/**
 * The lid's Slash bar, through asusd (`xyz.ljones.Slash` at `/xyz/ljones` on
 * `xyz.ljones.Asusd`; dashiOS docs/hardware.md, "asusd"): on, its
 * brightness, its animation and how fast, and when it shows. The preview
 * draws the bar's segments as the animation will light them, frame by
 * frame; it is a likeness, computed here, not read from the lid.
 */

import type { SystemBus } from "./bus.ts";

const NAME = "xyz.ljones.Asusd";
const PATH = "/xyz/ljones";
const IFACE = "xyz.ljones.Slash";

/**
 * The animations, by the number asusd's `Mode` takes. From asusctl's
 * rog-slash `SlashMode` (6.x); check against the lid in the VM's fake tree
 * and on the G14 before trusting a number.
 */
export const SLASH_MODES = [
  { mode: 0x10, name: "Bounce" },
  { mode: 0x12, name: "Slash" },
  { mode: 0x13, name: "Loading" },
  { mode: 0x1d, name: "Bit Stream" },
  { mode: 0x1a, name: "Transmission" },
  { mode: 0x19, name: "Flow" },
  { mode: 0x25, name: "Flux" },
  { mode: 0x24, name: "Phantom" },
  { mode: 0x26, name: "Spectrum" },
  { mode: 0x32, name: "Hazard" },
  { mode: 0x33, name: "Interfacing" },
  { mode: 0x34, name: "Ramp" },
  { mode: 0x42, name: "Game Over" },
  { mode: 0x43, name: "Start" },
  { mode: 0x44, name: "Buzzer" },
] as const;

/** The bar's segments. */
export const SEGMENTS = 7;

export const SHOW_FLAGS = [
  { property: "ShowOnBoot", label: "At startup" },
  { property: "ShowOnShutdown", label: "At shutdown" },
  { property: "ShowOnSleep", label: "While asleep" },
  { property: "ShowOnBattery", label: "On battery" },
  { property: "ShowOnLidClosed", label: "With the lid closed" },
  { property: "ShowBatteryWarning", label: "When the battery is low" },
] as const;

export type ShowFlag = (typeof SHOW_FLAGS)[number]["property"];

export interface SlashState {
  enabled: boolean;
  brightness: number;
  interval: number;
  mode: number;
  show: Record<ShowFlag, boolean>;
}

/** Each segment's light (0 to 1) at `frame` for `mode`: the shape of each animation, drawn the same way asusd plays it, roughly. */
export function slashFrame(mode: number, frame: number): number[] {
  const at = (i: number): number => (frame + i) % SEGMENTS;
  const name = SLASH_MODES.find((each) => each.mode === mode)?.name ?? "Slash";
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

/** How long a frame lasts at asusd's `Interval` (0 is fastest, 5 slowest). */
export const frameMs = (interval: number): number => 90 + interval * 60;

export class Slash {
  constructor(private readonly bus: SystemBus) {}

  async read(): Promise<SlashState | null> {
    try {
      const get = (property: string) => this.bus.get(NAME, PATH, IFACE, property);
      const [enabled, brightness, interval, mode, ...flags] = await Promise.all([
        get("Enabled"),
        get("Brightness"),
        get("Interval"),
        get("Mode"),
        ...SHOW_FLAGS.map((flag) => get(flag.property)),
      ]);
      const show = Object.fromEntries(SHOW_FLAGS.map((flag, at) => [flag.property, flags[at] === true])) as Record<ShowFlag, boolean>;
      return {
        enabled: enabled === true,
        brightness: typeof brightness === "number" ? brightness : 0,
        interval: typeof interval === "number" ? interval : 0,
        mode: typeof mode === "number" ? mode : SLASH_MODES[1].mode,
        show,
      };
    } catch {
      // No asusd (not installed, or not this machine): no lid lighting here.
      return null;
    }
  }

  setEnabled(on: boolean): Promise<void> {
    return this.bus.set(NAME, PATH, IFACE, "Enabled", "b", on);
  }

  setBrightness(value: number): Promise<void> {
    return this.bus.set(NAME, PATH, IFACE, "Brightness", "y", Math.max(0, Math.min(255, Math.round(value))));
  }

  setInterval(value: number): Promise<void> {
    return this.bus.set(NAME, PATH, IFACE, "Interval", "y", Math.max(0, Math.min(5, Math.round(value))));
  }

  setMode(mode: number): Promise<void> {
    return this.bus.set(NAME, PATH, IFACE, "Mode", "y", mode);
  }

  setShow(flag: ShowFlag, on: boolean): Promise<void> {
    return this.bus.set(NAME, PATH, IFACE, flag, "b", on);
  }
}
