import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type NativeEvent, type NativeRoot, type NativeTransport, render } from "@mirinjs/metal";
import type { ReactElement } from "react";
import { Hardware } from "../src/hardware.ts";
import { Live } from "../src/live.ts";
import { Slash } from "../src/slash.ts";
import { LiveContext } from "../src/ui/controls.tsx";
import { AsusPopover } from "../src/ui/popover.tsx";
import { AsusWindow } from "../src/ui/window.tsx";
import { fakeBus, G14_DESCRIBE } from "./fake.ts";

// The popover and the window on a stand-in for the Metal host, over a G14 as dashi-hardware describes it.

const settle = (ms = 30): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function mount(element: (live: Live) => ReactElement, describe?: unknown) {
  process.env.HOME = mkdtempSync(join(tmpdir(), "asus-home-"));
  const { bus, calls } = fakeBus(describe);
  const sensors = [
    { id: "cpu", label: "Processor", value: 54, unit: "°C" as const },
    { id: "fan1", label: "CPU fan", value: 2300, unit: "rpm" as const },
  ];
  const live = new Live(new Hardware(bus), new Slash(bus), () => sensors, () => true);
  await live.tick();
  const listeners: ((event: NativeEvent) => void)[] = [];
  const transport: NativeTransport = { send() {}, onEvent: (listener) => listeners.push(listener), onClose() {}, simulate() {}, close() {} };
  const root: NativeRoot = render(<LiveContext.Provider value={live}>{element(live)}</LiveContext.Provider>, transport);
  await settle();
  const press = async (testID: string): Promise<void> => {
    const nodeId = root.nodeId(testID);
    if (!nodeId) throw new Error(`no node ${testID}`);
    for (const listener of listeners) listener({ type: "press", nodeId });
    await settle(60);
  };
  return { root, press, calls, live };
}

const setCalls = (calls: string[][], knob: string): string[] => calls.filter((call) => call[4] === "Set" && call[6] === knob).map((call) => call[8] ?? "");

test("the popover: the live line, the temperature line, the modes as tiles, then the three rows", async () => {
  let opened = 0;
  const { root, press, calls, live } = await mount(() => <AsusPopover onOpenWindow={() => opened++} />);
  const tree = root.lastTree() ?? "";
  expect(tree).toContain("54°");
  // No title row: the menu bar item is the title.
  expect(tree).not.toContain('["ASUS Control"]');
  for (const words of ["Automatic", "Quiet", "Balanced", "Turbo", "Keyboard", "Lid", "Spectrum", "Stop charging at 80%"]) expect(tree).toContain(words);
  expect(root.nodeId("temperature-line")).toBeDefined();
  await press("mode:performance");
  expect(setCalls(calls, "platform-profile")).toEqual(["performance"]);
  // Automatic is Dashi's, out of an applet's reach for now: the tile takes no press.
  await press("mode:automatic");
  expect(setCalls(calls, "platform-profile")).toEqual(["performance"]);
  // The keyboard is at 1: the third dot is High, the first again is off.
  await press("keyboard:3");
  await press("keyboard:1");
  expect(setCalls(calls, "kbd-backlight")).toEqual(["3", "0"]);
  await press("charge");
  expect(setCalls(calls, "charge-limit")).toEqual(["100"]);
  await press("open-window");
  expect(opened).toBe(1);
  expect(live.history.of("cpu").length).toBeGreaterThan(0);
  root.unmount();
});

test("the window: four tabs in the title bar, each draws, and the links go where they say", async () => {
  const { root, press, calls } = await mount(() => <AsusWindow />);
  expect(root.nodeId("window-sidebar")).toBeUndefined();
  expect(root.nodeId("tabs")).toBeDefined();
  expect(root.nodeId("body:overview")).toBeDefined();
  for (const box of ["box:now", "box:power", "box:fans", "box:lighting"]) expect(root.nodeId(box)).toBeDefined();
  expect(root.lastTree()).toContain("Balanced plugged in: 55 W.");
  expect(root.nodeId("sensors")).toBeDefined();
  await press("go:limits");
  expect(root.nodeId("body:advanced")).toBeDefined();
  for (const words of ["Recipes", "Sustained power", "Try for 20 Seconds", "Charge limit", "Fn F5"]) expect(root.lastTree()).toContain(words);
  await press("tabs:lighting");
  expect(root.nodeId("slash-preview")).toBeDefined();
  expect(root.nodeId("kbd-level")).toBeDefined();
  await press("slash:showOnBattery");
  expect(calls.some((call) => call[4] === "SetSlash" && call.includes("showOnBattery") && call.includes("true"))).toBe(true);
  await press("tabs:overview");
  await press("go:fans");
  expect(root.nodeId("body:fans")).toBeDefined();
  expect(root.nodeId("curve")).toBeDefined();
  await press("tabs:advanced");
  await press("boost");
  expect(setCalls(calls, "boost")).toEqual(["false"]);
  root.unmount();
  // The countdown itself: a value applied with 20 seconds to keep it, kept with its token.
  expect(calls.some((call) => call[4] === "CurveOptimizer")).toBe(true);
});

test("an old pane's name opens the tab that holds it now", async () => {
  const { root } = await mount(() => <AsusWindow start="battery" />);
  expect(root.nodeId("body:advanced")).toBeDefined();
  expect(root.nodeId("battery")).toBeDefined();
  root.unmount();
});

test("an edited recipe follows the mode when it changes from anywhere", async () => {
  const { live, calls } = await mount(() => <AsusWindow />);
  live.saveEdits({ "low-power": { plugged: { "ppt-spl": 25 }, battery: {} } });
  await live.applyRecipe("low-power");
  expect(calls.some((call) => call[4] === "SetMany" && call.includes("25"))).toBe(true);
});

test("without a Slash bar there is no lid row", async () => {
  const noBar = { ...G14_DESCRIBE, lighting: { keyboard: { levels: 3 }, slash: false, aura: false } };
  const popover = await mount(() => <AsusPopover onOpenWindow={() => {}} />, noBar);
  expect(popover.root.nodeId("lid")).toBeUndefined();
  expect(popover.root.nodeId("keyboard")).toBeDefined();
  expect(popover.calls.some((call) => call[4] === "Slash")).toBe(false);
  popover.root.unmount();
  const window = await mount(() => <AsusWindow />, noBar);
  expect(window.root.nodeId("lid")).toBeUndefined();
  await window.press("tabs:lighting");
  expect(window.root.nodeId("slash-preview")).toBeUndefined();
  expect(window.root.lastTree()).not.toContain("Lid");
  window.root.unmount();
});

test("the lid's switch goes to dashi-hardware", async () => {
  const { root, press, calls } = await mount(() => <AsusPopover onOpenWindow={() => {}} />);
  await press("lid");
  expect(calls.some((call) => call[4] === "SetSlash" && call.includes("enabled") && call.includes("false"))).toBe(true);
  root.unmount();
});
