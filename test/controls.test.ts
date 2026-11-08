/**
 * ASUS Control's tiles in Dashi's Control Center (src/controls.ts): what
 * each says, the fans' presets, what a press does through dashi-hardware,
 * and the wiring to the SDK's `controls`, on a stand-in G14.
 */

import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ControlAction, type ControlsApi, parseManifest } from "@dashi/applet";
import manifest from "../applet.json" with { type: "json" };
import { act, connectControls, fanCurve, readFanChoice, tileStates, writeFanChoice } from "../src/controls.ts";
import { Hardware } from "../src/hardware.ts";
import { Live } from "../src/live.ts";
import type { Reading } from "../src/sensors.ts";
import { Slash } from "../src/slash.ts";
import { fakeBus } from "./fake.ts";

const READINGS: Reading[] = [
  { id: "cpu", label: "Processor", value: 71, unit: "°C" },
  { id: "fan-cpu", label: "CPU fan", value: 3400, unit: "rpm" },
];

async function machine() {
  const { bus, calls, slash } = fakeBus();
  const live = new Live(new Hardware(bus), new Slash(bus), () => READINGS, () => true);
  await live.tick();
  return { live, calls, slash };
}

test("the manifest declares the three tiles and asks for the controls permission (Dashi's own Keyboard tile is the light)", () => {
  const parsed = parseManifest(manifest);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.controls.map((control) => `${control.id}:${control.kind}`)).toEqual(["lid:toggle", "fans:choice", "cpu:status"]);
  expect(parsed.permissions.some((permission) => permission.kind === "controls")).toBe(true);
  expect(parsed.version).toBe("0.3.0");
});

test("the tiles say the lid's animation, the fans' choice, and the processor's temperature and fan", async () => {
  const { live } = await machine();
  expect(tileStates(live.getSnapshot(), "Auto")).toEqual({
    lid: { on: true, detail: "Spectrum" },
    fans: { choice: "Auto" },
    cpu: { detail: "71 °C · 3,400 rpm" },
  });
  // Without the sensors, the fan's speed as dashi-hardware describes it.
  expect(tileStates({ ...live.getSnapshot(), readings: [] }, "Auto").cpu).toEqual({ detail: "2,300 rpm" });
  // A lid without a Slash bar says so; before the machine is known, no tiles.
  expect(tileStates({ ...live.getSnapshot(), slash: null }, "Auto").lid).toEqual({ on: false, detail: "Not on this lid" });
  expect(tileStates({ ...live.getSnapshot(), slash: null, machine: null, readings: [] }, "Max")).toEqual({ lid: null, fans: null, cpu: null });
});

test("the fans' presets: Quiet slow until warm, Max flat out, 8 points each", () => {
  expect(fanCurve("Max").every(([, duty]) => duty === 255)).toBe(true);
  const quiet = fanCurve("Quiet");
  expect(quiet).toHaveLength(8);
  expect(quiet[0]).toEqual([30, 0]);
  expect(quiet.at(-1)).toEqual([100, 255]);
  expect(quiet.every(([, duty], at) => at === 0 || duty >= (quiet[at - 1] as [number, number])[1])).toBe(true);
});

test("a press goes to dashi-hardware: the lid on and off, the fans' curves set or reset", async () => {
  const { live, calls, slash } = await machine();
  await act(live, "lid", { action: "toggle", on: false });
  expect(slash.enabled).toBe(false);
  expect(await act(live, "fans", { action: "choose", choice: "Max" })).toBe("Max");
  expect(calls.filter((call) => call[4] === "SetFanCurve").map((call) => call[6])).toEqual(["cpu", "gpu"]);
  expect(await act(live, "fans", { action: "choose", choice: "Auto" })).toBe("Auto");
  expect(calls.at(-1)?.[4]).toBe("ResetFanCurves");
  expect(await act(live, "fans", { action: "choose", choice: "Turbo" })).toBeNull();
});

test("connected: the tiles' state goes to Dashi, presses come back, and a label opens the popover", async () => {
  const home = mkdtempSync(join(tmpdir(), "asus-fans-"));
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    const { live, slash } = await machine();
    const updates: Array<[string, unknown]> = [];
    const handlers = new Map<string, (action: ControlAction) => void>();
    const openers = new Map<string, () => void>();
    const controls: ControlsApi = {
      update: (id, state) => {
        updates.push([id, state]);
        return true;
      },
      on: (id, handler) => {
        handlers.set(id, handler);
        return () => handlers.delete(id);
      },
      onOpen: (id, handler) => {
        openers.set(id, handler);
        return () => openers.delete(id);
      },
      shown: [],
      onShown: () => () => {},
    };
    let opened = 0;
    const stop = connectControls(live, controls, () => opened++);
    expect(updates).toEqual([
      ["lid", { on: true, detail: "Spectrum" }],
      ["fans", { choice: "Auto", detail: "Auto" }],
      ["cpu", { detail: "71 °C · 3,400 rpm" }],
    ]);
    handlers.get("lid")?.({ action: "toggle", on: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(slash.enabled).toBe(false);
    expect(updates.at(-1)).toEqual(["lid", { on: false, detail: "Off" }]);
    openers.get("cpu")?.();
    expect(opened).toBe(1);
    stop();
    expect(handlers.size).toBe(0);
    writeFanChoice("Quiet", join(home, "fans.json"));
    expect(readFanChoice(join(home, "fans.json"))).toBe("Quiet");
    expect(readFanChoice(join(home, "missing.json"))).toBe("Auto");
  } finally {
    process.env.HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
