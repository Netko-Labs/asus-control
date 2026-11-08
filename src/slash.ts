/**
 * The lid's Slash bar, through dashi-hardware (`Slash` and `SetSlash` on
 * `dev.dashi.Hardware1`; dashiOS docs/hardware.md, "The Slash bar"): on, its
 * brightness, its animation and how fast, and when it shows. The preview
 * draws the bar's segments as the animation will light them, frame by
 * frame; it is a likeness, computed here, not read from the lid.
 */

import type { SystemBus } from "./bus.ts";

const NAME = "dev.dashi.Hardware1";
const PATH = "/dev/dashi/Hardware1";

/** The animations' names in words, by dashi-hardware's ids (its `modes` says which this bar has). */
export const SLASH_MODES = [
  { mode: "static", name: "Static" },
  { mode: "bounce", name: "Bounce" },
  { mode: "slash", name: "Slash" },
  { mode: "loading", name: "Loading" },
  { mode: "bit-stream", name: "Bit Stream" },
  { mode: "transmission", name: "Transmission" },
  { mode: "flow", name: "Flow" },
  { mode: "flux", name: "Flux" },
  { mode: "phantom", name: "Phantom" },
  { mode: "spectrum", name: "Spectrum" },
  { mode: "hazard", name: "Hazard" },
  { mode: "interfacing", name: "Interfacing" },
  { mode: "ramp", name: "Ramp" },
  { mode: "game-over", name: "Game Over" },
  { mode: "start", name: "Start" },
  { mode: "buzzer", name: "Buzzer" },
] as const;

/** An animation's name in words; an id this list doesn't know is shown as it is. */
export const modeName = (mode: string): string => SLASH_MODES.find((each) => each.mode === mode)?.name ?? mode;

/** The bar's segments. */
export const SEGMENTS = 7;

export const SHOW_FLAGS = [
  { property: "showOnBoot", label: "At startup" },
  { property: "showOnShutdown", label: "At shutdown" },
  { property: "showOnSleep", label: "While asleep" },
  { property: "showOnBattery", label: "On battery" },
  { property: "showOnLidClosed", label: "With the lid closed" },
  { property: "showBatteryWarning", label: "When the battery is low" },
] as const;

export type ShowFlag = (typeof SHOW_FLAGS)[number]["property"];

export interface SlashState {
  enabled: boolean;
  brightness: number;
  interval: number;
  mode: string;
  /** The animations this bar has, by id. */
  modes: string[];
  show: Record<ShowFlag, boolean>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `Slash()`'s JSON → the bar; null when it isn't there (`available: false`) or the answer makes no sense. */
export function parseSlash(text: string): SlashState | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.available !== true || typeof value.mode !== "string") return null;
  const modes = Array.isArray(value.modes) ? value.modes.filter((each): each is string => typeof each === "string") : [];
  return {
    enabled: value.enabled === true,
    brightness: typeof value.brightness === "number" ? value.brightness : 0,
    interval: typeof value.interval === "number" ? value.interval : 0,
    mode: value.mode,
    modes: modes.length > 0 ? modes : [value.mode],
    show: Object.fromEntries(SHOW_FLAGS.map((flag) => [flag.property, value[flag.property] === true])) as Record<ShowFlag, boolean>,
  };
}

/** Each segment's light (0 to 1) at `frame` for `mode`: the shape of each animation, drawn the way the bar plays it, roughly. */
export function slashFrame(mode: string, frame: number): number[] {
  const at = (i: number): number => (frame + i) % SEGMENTS;
  const name = modeName(mode);
  return Array.from({ length: SEGMENTS }, (_, i) => {
    switch (name) {
      case "Bounce": {
        const position = Math.abs((frame % (2 * (SEGMENTS - 1))) - (SEGMENTS - 1));
        return i === position ? 1 : Math.abs(i - position) === 1 ? 0.35 : 0;
      }
      case "Loading":
        return i <= frame % (SEGMENTS + 1) ? 1 : 0;
      case "Bit Stream":
        return ((frame * 7 + i * 13) % 5) < 2 ? 1 : 0.1;
      case "Flow":
      case "Flux":
        return 0.5 + 0.5 * Math.sin((frame + i) / 1.5);
      case "Static":
        return 1;
      case "Phantom":
        return frame % 6 < 3 ? 0.15 : 1;
      case "Spectrum":
        return (Math.sin((frame - i) / 2) + 1) / 2;
      case "Hazard":
        return (frame + i) % 2 === 0 ? 1 : 0;
      case "Ramp":
        return ((at(i) + 1) / SEGMENTS) ** 1.5;
      case "Start":
      case "Game Over":
        return frame % 10 < 5 ? 1 : 0;
      case "Buzzer":
        return frame % 2 === 0 ? 1 : 0.2;
      default:
        // Slash, Transmission, Interfacing: one lit segment sweeping across.
        return at(i) === 0 ? 1 : at(i) === SEGMENTS - 1 ? 0.4 : 0;
    }
  });
}

/** How long a frame lasts at the bar's `interval` (0 is fastest, 5 slowest). */
export const frameMs = (interval: number): number => 90 + interval * 60;

/** One `SetSlash` entry as busctl's arguments: `KEY TYPE VALUE`. */
const entry = (key: string, value: string | number | boolean): string[] =>
  typeof value === "boolean" ? [key, "b", String(value)] : typeof value === "number" ? [key, "u", String(Math.max(0, Math.round(value)))] : [key, "s", value];

export class Slash {
  constructor(private readonly bus: SystemBus) {}

  /** The bar, or null when this machine has none (or dashi-hardware can't reach it). */
  async read(): Promise<SlashState | null> {
    try {
      const [text] = await this.bus.call(NAME, PATH, NAME, "Slash");
      return typeof text === "string" ? parseSlash(text) : null;
    } catch {
      return null;
    }
  }

  /** Any of the bar's settings in one call; dashi-hardware validates and clamps them. */
  async set(values: Readonly<Record<string, string | number | boolean>>): Promise<void> {
    const entries = Object.entries(values);
    await this.bus.call(NAME, PATH, NAME, "SetSlash", "a{sv}", [entries.length, ...entries.flatMap(([key, value]) => entry(key, value))]);
  }

  setEnabled(on: boolean): Promise<void> {
    return this.set({ enabled: on });
  }

  setBrightness(value: number): Promise<void> {
    return this.set({ brightness: Math.max(0, Math.min(255, Math.round(value))) });
  }

  setInterval(value: number): Promise<void> {
    return this.set({ interval: Math.max(0, Math.min(5, Math.round(value))) });
  }

  setMode(mode: string): Promise<void> {
    return this.set({ mode });
  }

  setShow(flag: ShowFlag, on: boolean): Promise<void> {
    return this.set({ [flag]: on });
  }
}
