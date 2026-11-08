/**
 * The power mode as the popover's tiles and the window's segmented control
 * show it: Automatic, then the machine's modes (Quiet, Balanced, Turbo).
 * They are Dashi's own modes, the store Control Center and Settings use.
 *
 * On a Dashi that offers applets its power mode (protocol 4, `power.mode`
 * in applet.json; dashiOS docs/applets.md "Version 4"), the tiles are that
 * store: the choice (Automatic or a mode) is Dashi's, read from it and
 * asked of it, and Automatic can be pressed. `automaticReachable` is that
 * detection: Dashi's state arrived.
 *
 * On an older Dashi nothing an applet reaches can choose Automatic or say it
 * is chosen: the applet sets the platform profile through dashi-hardware,
 * which Dashi's mode store takes as a key press (dashiOS
 * packages/shell/src/power/modes/store.ts, `external`), and the Automatic
 * tile is shown and can't be pressed.
 */

import type { PowerState } from "@dashi/applet";
import type { Knob } from "./hardware.ts";
import { MODES } from "./recipes.ts";

export type ModeChoice = "automatic" | (typeof MODES)[number]["id"];

/** Whether this Dashi lets the applet choose its Automatic: it told the applet its power mode. */
export const automaticReachable = (power: PowerState | null): boolean => power !== null && power.available.length > 0;

export interface ModeOption {
  id: ModeChoice;
  label: string;
  /** It can be chosen from here. */
  enabled: boolean;
}

/** The platform profile's value as a mode; asus-wmi's `quiet` and `cool` are Quiet. */
export function modeOfProfile(value: unknown): ModeChoice | null {
  if (value === "low-power" || value === "quiet" || value === "cool") return "low-power";
  if (value === "balanced" || value === "performance") return value;
  return null;
}

/**
 * Automatic, then each mode the machine has: Dashi's list when it told us,
 * else the platform profile's choices (all three when it doesn't say).
 */
export function modeOptions(profile: Knob | undefined, power: PowerState | null = null): ModeOption[] {
  const reachable = automaticReachable(power);
  const offered = reachable
    ? new Set<ModeChoice>(power?.available ?? [])
    : profile?.choices && profile.choices.length > 0
      ? new Set(profile.choices.map(modeOfProfile))
      : null;
  return [
    { id: "automatic", label: "Automatic", enabled: reachable },
    ...MODES.filter((mode) => offered?.has(mode.id) ?? true).map((mode) => ({ id: mode.id, label: mode.label, enabled: true })),
  ];
}

/** The choice the tiles mark: Dashi's (Automatic included) when it told us, else the platform profile's mode. */
export const chosenMode = (profile: Knob | undefined, power: PowerState | null = null): ModeChoice | null =>
  automaticReachable(power) && power ? power.choice : modeOfProfile(profile?.value);

/** The mode in effect (for its recipe): what Automatic or a pick runs now, else the platform profile's. */
export const modeInEffect = (profile: Knob | undefined, power: PowerState | null = null): Exclude<ModeChoice, "automatic"> | null => {
  if (automaticReachable(power) && power?.mode) return power.mode;
  const mode = modeOfProfile(profile?.value);
  return mode === "automatic" ? null : mode;
};

/** The mode's name here (Quiet, Balanced, Turbo). */
export const modeLabel = (mode: ModeChoice): string => (mode === "automatic" ? "Automatic" : (MODES.find((each) => each.id === mode)?.label ?? mode));
