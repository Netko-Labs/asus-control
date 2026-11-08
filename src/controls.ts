/**
 * ASUS Control's tiles in Dashi's Control Center (Dashi 0.5's protocol 5,
 * dashiOS docs/applets.md "Version 5: Control Center"): the lid's light
 * (on and off, its animation under the name), the fans (Quiet, Auto, Max),
 * and the processor (its temperature and the fan, to read; a press opens
 * the popover). Dashi draws them; this says their state and does what was
 * pressed, through dashi-hardware as everything else here. The keyboard
 * light has no tile of ours: Dashi's own Keyboard tile is the same light.
 *
 * Pure parts first (what each tile says, the fan presets), then `connectControls`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ControlAction, ControlsApi } from "@dashi/applet";
import type { Point } from "./hardware.ts";
import type { Live, LiveState } from "./live.ts";
import { formatWhole, liveNumbers } from "./sensors.ts";
import { modeName } from "./slash.ts";

export const FAN_CHOICES = ["Quiet", "Auto", "Max"] as const;
export type FanChoice = (typeof FAN_CHOICES)[number];

export const isFanChoice = (value: unknown): value is FanChoice => FAN_CHOICES.some((choice) => choice === value);

/**
 * The fans' curves for a choice: Auto is the firmware's own (reset), Quiet
 * keeps them slow until it is warm, Max runs them flat out. Temperatures in
 * °C, duty in PWM (0–255), 8 points as dashi-hardware takes them.
 */
export function fanCurve(choice: Exclude<FanChoice, "Auto">): Point[] {
  const temperatures = [30, 40, 50, 60, 70, 80, 90, 100];
  const duty = choice === "Max" ? [255, 255, 255, 255, 255, 255, 255, 255] : [0, 0, 20, 45, 80, 130, 190, 255];
  return temperatures.map((temperature, at) => [temperature, duty[at] as number]);
}

/** What the tiles say now; null for a tile this machine can't have. */
export interface TileStates {
  lid: { on: boolean; detail: string } | null;
  fans: { choice: FanChoice } | null;
  cpu: { detail: string } | null;
}

export function tileStates(state: LiveState, fans: FanChoice): TileStates {
  const machine = state.machine;
  const { celsius, rpm: sensed } = liveNumbers(state.readings);
  // The fan's speed from the sensors, else as dashi-hardware describes it.
  const rpm = sensed ?? machine?.fans.find((fan) => fan.rpm !== null && fan.rpm > 0)?.rpm ?? null;
  const words = [celsius === null ? null : `${celsius} °C`, rpm === null ? null : `${formatWhole(rpm)} rpm`].filter(Boolean).join(" · ");
  return {
    // A lid without a Slash bar (or one dashi-hardware doesn't know) says so, rather than a switch that does nothing.
    lid: state.slash
      ? { on: state.slash.enabled, detail: state.slash.enabled ? modeName(state.slash.mode) : "Off" }
      : machine
        ? { on: false, detail: "Not on this lid" }
        : null,
    fans: machine && machine.fans.some((fan) => fan.curve) ? { choice: fans } : null,
    cpu: words ? { detail: words } : null,
  };
}

/** Where the fans' choice is kept, in the applet's home. */
export const fansPath = (home = homedir()): string => join(home, "fans.json");

export function readFanChoice(path = fansPath()): FanChoice {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    const choice = typeof value === "object" && value !== null ? (value as { choice?: unknown }).choice : null;
    return isFanChoice(choice) ? choice : "Auto";
  } catch {
    return "Auto";
  }
}

export function writeFanChoice(choice: FanChoice, path = fansPath()): void {
  try {
    writeFileSync(path, `${JSON.stringify({ choice })}\n`);
  } catch {
    // Kept in memory only; the next start says Auto.
  }
}

/** Sets every fan that takes a curve to the choice's (Auto: the firmware's). */
export async function applyFans(live: Live, choice: FanChoice): Promise<void> {
  const machine = live.getSnapshot().machine;
  if (choice === "Auto") return live.hardware.resetFanCurves();
  for (const fan of machine?.fans.filter((each) => each.curve) ?? []) await live.hardware.setFanCurve(fan.id, fanCurve(choice));
}

/** What a press on a tile does; returns the fans' new choice when it changed them. */
export async function act(live: Live, id: string, action: ControlAction): Promise<FanChoice | null> {
  if (id === "lid" && action.action === "toggle") {
    await live.withSlash((slash) => slash.set({ enabled: action.on }));
    return null;
  }
  if (id === "fans" && action.action === "choose" && isFanChoice(action.choice)) {
    await applyFans(live, action.choice);
    return action.choice;
  }
  return null;
}

/**
 * Keeps the tiles up to date while the applet runs and does what is
 * pressed; a status tile's press (and any label's) opens the popover.
 * Returns what stops it.
 */
export function connectControls(live: Live, controls: ControlsApi, openPopover: () => void): () => void {
  let fans = readFanChoice();
  /** What each tile was last told: only a tile that changed is sent again. */
  const told = new Map<string, string>();
  const send = (id: string, state: Parameters<ControlsApi["update"]>[1] | null): void => {
    const line = JSON.stringify(state);
    if (state === null || told.get(id) === line) return;
    told.set(id, line);
    controls.update(id, state);
  };
  const tell = (): void => {
    const states = tileStates(live.getSnapshot(), fans);
    send("lid", states.lid);
    send("fans", states.fans ? { choice: states.fans.choice, detail: states.fans.choice } : null);
    send("cpu", states.cpu);
  };
  const stops = [
    live.subscribe(tell),
    ...(["lid", "fans"] as const).map((id) =>
      controls.on(id, (action) => {
        void act(live, id, action)
          .then((choice) => {
            if (choice) {
              fans = choice;
              writeFanChoice(choice);
            }
            tell();
          })
          .catch((error) => live.reportFailure(error));
      }),
    ),
    ...(["lid", "fans", "cpu"] as const).map((id) => controls.onOpen(id, openPopover)),
  ];
  tell();
  return () => {
    for (const stop of stops) stop();
  };
}
