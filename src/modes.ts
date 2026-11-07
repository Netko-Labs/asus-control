/**
 * The power mode as the popover's tiles and the window's segmented control
 * show it: Automatic, then the machine's modes (Quiet, Balanced, Turbo).
 * They are Dashi's own modes, the store Control Center and Settings use:
 * the applet sets the platform profile through dashi-hardware, and Dashi's
 * mode store takes a change it didn't make as the person's pick (dashiOS
 * packages/shell/src/power/modes/store.ts, `external`), so the pick lands
 * there and its recipe follows.
 *
 * Automatic is Dashi's choice, kept in Dashi's settings (power.mode unset),
 * and no channel an applet has (dashi-hardware, the applets socket) can
 * choose it or say it is chosen yet. Until one does, the tile is shown and
 * can't be pressed: `AUTOMATIC_REACHABLE` is the one switch to turn on with it.
 */

import type { Knob } from "./hardware.ts";
import { MODES } from "./recipes.ts";

export type ModeChoice = "automatic" | (typeof MODES)[number]["id"];

/** Whether an applet can choose Dashi's Automatic (see above). */
export const AUTOMATIC_REACHABLE = false;

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

/** Automatic, then each mode the machine's platform profile offers (all three when it doesn't say). */
export function modeOptions(profile: Knob | undefined, automatic = AUTOMATIC_REACHABLE): ModeOption[] {
  const offered = profile?.choices && profile.choices.length > 0 ? new Set(profile.choices.map(modeOfProfile)) : null;
  return [
    { id: "automatic", label: "Automatic", enabled: automatic },
    ...MODES.filter((mode) => offered?.has(mode.id) ?? true).map((mode) => ({ id: mode.id, label: mode.label, enabled: true })),
  ];
}

/** The mode in effect, as the tiles mark it. */
export const chosenMode = (profile: Knob | undefined): ModeChoice | null => modeOfProfile(profile?.value);
