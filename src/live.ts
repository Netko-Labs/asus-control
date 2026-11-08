/**
 * What ASUS Control knows, kept fresh: the machine and its knobs
 * (dashi-hardware's Describe, every few seconds: it is cheap), the sensors,
 * the lid's Slash bar (dashi-hardware's Slash), and the power source. The popover, the
 * window, and the menu bar item all read this one store. A mode change from
 * anywhere (Fn F5, the menu bar, Automatic) pulls the edited recipe along.
 *
 * The power mode is Dashi's: on a Dashi that offers it (`DashiPower`, the
 * applets client's protocol 4), the choice is read from Dashi and asked of
 * it, Automatic included; on an older one, a mode is set as the platform
 * profile through dashi-hardware (modes.ts).
 */

import type { PowerChoice, PowerState } from "@dashi/applet";
import { BusError } from "./bus.ts";
import type { Hardware, KnobValue, Machine } from "./hardware.ts";
import { effective, pluggedIn, readEdits, writeEdits } from "./recipes.ts";
import type { Recipes } from "./hardware.ts";
import { automaticReachable, type ModeChoice } from "./modes.ts";
import { History, type Reading, readSensors } from "./sensors.ts";
import type { Slash, SlashState } from "./slash.ts";

export interface LiveState {
  machine: Machine | null;
  /** Why there is no machine: dashi-hardware isn't running, or refused. */
  problem: string | null;
  readings: Reading[];
  slash: SlashState | null;
  plugged: boolean;
  edits: Recipes;
  /** The last change that didn't go through, for a note. */
  failure: string | null;
  /** Dashi's power mode, when this Dashi tells applets (null on an older one, or before it says). */
  power: PowerState | null;
}

/** What the applets client offers of Dashi's power mode (@dashi/applet's AppletsClient). */
export interface DashiPower {
  readonly powerMode: PowerState | null;
  onPowerMode(listener: (state: PowerState | null) => void): () => void;
  choosePowerMode(choice: PowerChoice): boolean;
}

const POLL_MS = 2000;
const SLASH_EVERY = 5;

export class Live {
  private state: LiveState = { machine: null, problem: null, readings: [], slash: null, plugged: true, edits: readEdits(), failure: null, power: null };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private dashi: DashiPower | null = null;
  readonly history = new History();

  constructor(
    readonly hardware: Hardware,
    readonly slash: Slash,
    private readonly sensors: () => Reading[] = () => readSensors(),
    private readonly plugged: () => boolean = () => pluggedIn(),
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveState => this.state;

  private set(change: Partial<LiveState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const before = this.state.machine?.knobs["platform-profile"]?.value;
    const wasPlugged = this.state.plugged;
    const readings = this.sensors();
    this.history.add(readings);
    const plugged = this.plugged();
    try {
      const machine = await this.hardware.describe();
      // The bar when Describe says it is there; none otherwise, so the lid row goes away with it.
      const slash = !machine?.lighting.slash ? null : this.ticks++ % SLASH_EVERY === 0 || !this.state.slash ? await this.slash.read() : this.state.slash;
      this.set({ machine, problem: machine ? null : "dashi-hardware answered with nothing", readings, slash, plugged });
      const now = machine?.knobs["platform-profile"]?.value;
      // The mode or the cable changed (from anywhere): the edited recipe follows.
      if (machine && typeof now === "string" && (now !== before || plugged !== wasPlugged) && before !== undefined) await this.applyRecipe(now);
    } catch (error) {
      this.set({ problem: error instanceof BusError ? error.message : String(error), readings, plugged });
    }
  }

  /** Sets one knob, and reads the machine again. */
  async setKnob(knob: string, value: KnobValue): Promise<void> {
    try {
      await this.hardware.set(knob, value);
    } catch (error) {
      this.set({ failure: error instanceof Error ? error.message : String(error) });
    }
    await this.tick();
  }

  /** Follows Dashi's power mode (and goes back to the platform profile when Dashi stops saying it); returns what stops it. */
  followPower(dashi: DashiPower): () => void {
    this.dashi = dashi;
    this.set({ power: dashi.powerMode });
    const stop = dashi.onPowerMode((power) => this.set({ power }));
    return () => {
      stop();
      if (this.dashi === dashi) this.dashi = null;
      this.set({ power: null });
    };
  }

  /** A pick: asked of Dashi when it offers its power mode (as Control Center's), else the platform profile; Automatic only through Dashi. */
  async setMode(choice: ModeChoice): Promise<void> {
    if (this.dashi && automaticReachable(this.state.power)) {
      if (this.dashi.choosePowerMode(choice)) return;
      this.set({ failure: `Dashi didn't take ${choice === "automatic" ? "Automatic" : "that mode"}.` });
      return;
    }
    if (choice === "automatic") return;
    await this.setKnob("platform-profile", choice);
  }

  /** The edited recipe of `mode`, for the power source in use, in one call; nothing when it has no edits. */
  async applyRecipe(mode: string): Promise<void> {
    const machine = this.state.machine;
    if (!machine || !this.state.edits[mode]) return;
    const recipe = effective(mode, this.state.plugged ? "plugged" : "battery", machine.recipes, this.state.edits, machine.knobs);
    try {
      await this.hardware.setMany({ ...recipe, "platform-profile": mode });
    } catch (error) {
      this.set({ failure: error instanceof Error ? error.message : String(error) });
    }
  }

  saveEdits(edits: Recipes): void {
    writeEdits(edits);
    this.set({ edits });
    const mode = this.state.machine?.knobs["platform-profile"]?.value;
    if (typeof mode === "string") void this.applyRecipe(mode);
  }

  async withSlash(change: (slash: Slash) => Promise<void>): Promise<void> {
    try {
      await change(this.slash);
    } catch (error) {
      this.set({ failure: error instanceof Error ? error.message : String(error) });
    }
    this.set({ slash: await this.slash.read() });
  }

  dismissFailure(): void {
    this.set({ failure: null });
  }
}
