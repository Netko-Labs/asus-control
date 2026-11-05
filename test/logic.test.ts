import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { busError, parseAnswer } from "../src/bus.ts";
import { curveSvg, fromPlot, isValidCurve, movePoint, nearest, toPlot } from "../src/curve.ts";
import { Hardware, parseDescribe, variantArgs } from "../src/hardware.ts";
import { edit, effective, pluggedIn, readEdits, restoreDefaults, writeEdits } from "../src/recipes.ts";
import { History, liveLine, readSensors, sparkline } from "../src/sensors.ts";
import { SEGMENTS, Slash, SLASH_MODES, slashFrame } from "../src/slash.ts";
import { fakeBus, G14_DESCRIBE } from "./fake.ts";

test("Describe parses, and what it doesn't say is left out", () => {
  const machine = parseDescribe(JSON.stringify(G14_DESCRIBE));
  expect(machine?.knobs["ppt-spl"]).toEqual({ value: 55, min: 15, max: 80, unit: "W" });
  expect(machine?.fans.map((fan) => fan.id)).toEqual(["cpu", "gpu"]);
  expect(machine?.lighting).toEqual({ keyboardLevels: 3, slash: true, aura: false });
  expect(machine?.recipes?.balanced?.battery).toEqual({ "platform-profile": "balanced", "ppt-spl": 30 });
  expect(parseDescribe("not json")).toBeNull();
  expect(parseDescribe(JSON.stringify({ knobs: { "ppt-spl": { value: [1] } }, recipes: { balanced: { plugged: { "made-up": 1 } } } }))?.knobs).toEqual({});
});

test("calls go to busctl as structured arguments", async () => {
  const { bus, calls } = fakeBus();
  const hardware = new Hardware(bus);
  expect(variantArgs("boost", true)).toEqual(["b", "true"]);
  expect(variantArgs("charge-limit", 80)).toEqual(["u", "80"]);
  expect(() => variantArgs("smu", 1)).toThrow();
  await hardware.set("platform-profile", "performance");
  expect(calls.at(-1)).toEqual(["call", "dev.dashi.Hardware1", "/dev/dashi/Hardware1", "dev.dashi.Hardware1", "Set", "sv", "platform-profile", "s", "performance"]);
  await hardware.setMany({ "platform-profile": "low-power", "ppt-spl": 30 });
  expect(calls.at(-1)?.slice(4)).toEqual(["SetMany", "a{sv}", "2", "platform-profile", "s", "low-power", "ppt-spl", "u", "30"]);
  expect((await hardware.fanCurve("cpu")).length).toBe(8);
  await hardware.setFanCurve("cpu", [
    [30, 20],
    [40, 30],
  ]);
  expect(calls.at(-1)?.slice(4)).toEqual(["SetFanCurve", "sa(yy)", "cpu", "2", "30", "20", "40", "30"]);
  expect(await hardware.setCurveOptimizer(-10, [], 20)).toBe("token-1");
  expect(calls.at(-1)?.slice(4)).toEqual(["SetCurveOptimizer", "iaiu", "-10", "0", "20"]);
  expect((await hardware.curveOptimizer())?.range).toEqual([-40, 0]);
  expect(parseAnswer('{"type":"s","data":["x"]}')).toEqual(["x"]);
  expect(busError("Call failed: Access denied (org.freedesktop.PolicyKit1.Error.NotAuthorized)").message).toBe("Not allowed.");
});

test("a dragged point stays between its neighbours: temperatures rising, duty not falling", () => {
  const points: Array<[number, number]> = [
    [30, 20],
    [40, 30],
    [50, 50],
    [60, 80],
    [70, 120],
    [80, 170],
    [90, 220],
    [100, 255],
  ];
  expect(movePoint(points, 2, 45, 60)[2]).toEqual([45, 60]);
  expect(movePoint(points, 2, 10, 0)[2]).toEqual([41, 30]);
  expect(movePoint(points, 2, 99, 999)[2]).toEqual([59, 80]);
  expect(movePoint(points, 0, 0, -5)[0]).toEqual([20, 0]);
  expect(isValidCurve(movePoint(points, 3, 55, 10))).toBe(true);
  expect(isValidCurve([[40, 50], [30, 60]])).toBe(false);
  const plot = { width: 560, height: 260, pad: 18 };
  const at = toPlot([60, 80], plot);
  const back = fromPlot(at.x, at.y, plot);
  expect(Math.round(back[0])).toBe(60);
  expect(Math.round(back[1])).toBe(80);
  expect(nearest(points, at.x + 3, at.y - 3, plot)).toBe(3);
  expect(nearest(points, 0, 0, plot)).toBeNull();
  expect(curveSvg(points, plot, { line: "#000", grid: "#ccc", point: "#000", now: "#f00" }, 3, 54)).toContain("<circle");
});

test("sensors from hwmon and the battery, the live line, and an hour of history", () => {
  const root = mkdtempSync(join(tmpdir(), "sys-class-"));
  const hw = (name: string, files: Record<string, string>) => {
    const dir = join(root, "hwmon", name);
    mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), `${text}\n`);
  };
  hw("hwmon8", { name: "k10temp", temp1_input: "54250" });
  hw("hwmon9", { name: "asus", fan1_input: "2300", fan1_label: "cpu_fan", fan2_input: "2600", fan2_label: "gpu_fan" });
  hw("hwmon7", { name: "amdgpu", temp1_input: "48000" });
  mkdirSync(join(root, "power_supply/BAT1"), { recursive: true });
  writeFileSync(join(root, "power_supply/BAT1/type"), "Battery\n");
  writeFileSync(join(root, "power_supply/BAT1/power_now"), "12345678\n");
  mkdirSync(join(root, "power_supply/ACAD"), { recursive: true });
  writeFileSync(join(root, "power_supply/ACAD/type"), "Mains\n");
  writeFileSync(join(root, "power_supply/ACAD/online"), "0\n");
  const readings = readSensors(root);
  expect(readings.find((reading) => reading.id === "cpu")?.value).toBe(54);
  expect(readings.find((reading) => reading.id === "fan1")).toMatchObject({ label: "CPU fan", value: 2300 });
  expect(readings.find((reading) => reading.id === "battery")?.value).toBe(12.3);
  expect(liveLine(readings)).toBe("CPU 54 °C · 2300 rpm");
  expect(pluggedIn(join(root, "power_supply"))).toBe(false);
  const history = new History(3);
  for (let n = 0; n < 5; n++) history.add(readings);
  expect(history.of("cpu")).toHaveLength(3);
  expect(sparkline([1, 2, 3], 10, 10)).toBe("M0.0 10.0L5.0 5.0L10.0 0.0");
});

test("recipes: defaults with the edits over them, clamped, kept, and restored", () => {
  const machine = parseDescribe(JSON.stringify(G14_DESCRIBE));
  if (!machine) throw new Error("a machine");
  const edited = edit({}, "balanced", "plugged", "ppt-spl", 70, machine.recipes);
  expect(effective("balanced", "plugged", machine.recipes, edited, machine.knobs)).toEqual({ "platform-profile": "balanced", epp: "balance_performance", "ppt-spl": 70 });
  expect(effective("balanced", "plugged", machine.recipes, edit({}, "balanced", "plugged", "ppt-spl", 500, null), machine.knobs)["ppt-spl"]).toBe(80);
  // Back to the default value drops the edit.
  expect(edit(edited, "balanced", "plugged", "ppt-spl", 55, machine.recipes).balanced?.plugged).toEqual({});
  expect(restoreDefaults(edited, "balanced")).toEqual({});
  const path = join(mkdtempSync(join(tmpdir(), "recipes-")), "recipes.json");
  writeEdits(edited, path);
  expect(readEdits(path)).toEqual(edited);
});

test("the Slash bar: its properties through asusd, and a frame per animation", async () => {
  const { bus, slash: props } = fakeBus();
  const slash = new Slash(bus);
  const state = await slash.read();
  expect(state).toMatchObject({ enabled: true, brightness: 200, mode: 0x26, show: { ShowOnBoot: true, ShowOnBattery: false } });
  await slash.setBrightness(400);
  expect(props.Brightness).toBe(255);
  await slash.setShow("ShowOnBattery", true);
  expect(props.ShowOnBattery).toBe(true);
  for (const { mode } of SLASH_MODES) {
    const frame = slashFrame(mode, 3);
    expect(frame).toHaveLength(SEGMENTS);
    expect(frame.every((light) => light >= 0 && light <= 1)).toBe(true);
  }
});
