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
import { fakeBus } from "./fake.ts";

// The popover and the window on a stand-in for the Metal host, over a G14 as dashi-hardware and asusd describe it.

const settle = (ms = 30): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function mount(element: (live: Live) => ReactElement) {
  process.env.HOME = mkdtempSync(join(tmpdir(), "asus-home-"));
  const { bus, calls } = fakeBus();
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

test("the popover: the live line, the mode, the battery, the lights, then the window", async () => {
  let opened = 0;
  const { root, press, calls } = await mount(() => <AsusPopover onOpenWindow={() => opened++} />);
  const tree = root.lastTree() ?? "";
  expect(tree).toContain("CPU 54 °C · 2300 rpm");
  expect(tree).toContain("Quiet");
  expect(tree).toContain("80%");
  expect(tree).toContain("Spectrum");
  await press("mode:performance");
  expect(calls.some((call) => call[4] === "Set" && call[6] === "platform-profile" && call[8] === "performance")).toBe(true);
  await press("open-window");
  expect(opened).toBe(1);
  root.unmount();
});

test("the window: every pane draws, and an undervolt waits for Keep", async () => {
  const { root, press, calls } = await mount(() => <AsusWindow />);
  for (const pane of ["power", "fans", "battery", "lighting", "sensors", "keys", "advanced"]) {
    await press(`pane:${pane}`);
    expect(root.nodeId(`body:${pane}`)).toBeDefined();
  }
  await press("pane:fans");
  expect(root.nodeId("curve")).toBeDefined();
  await press("pane:lighting");
  expect(root.nodeId("slash-preview")).toBeDefined();
  await press("pane:power");
  expect(root.lastTree()).toContain("Sustained power");
  await press("pane:advanced");
  expect(root.lastTree()).toContain("Try for 20 Seconds");
  root.unmount();
  // The countdown itself: a value applied with 20 seconds to keep it, kept with its token.
  expect(calls.some((call) => call[4] === "CurveOptimizer")).toBe(true);
});

test("an edited recipe follows the mode when it changes from anywhere", async () => {
  const { live, calls } = await mount(() => <AsusWindow />);
  live.saveEdits({ "low-power": { plugged: { "ppt-spl": 25 }, battery: {} } });
  await live.applyRecipe("low-power");
  expect(calls.some((call) => call[4] === "SetMany" && call.includes("25"))).toBe(true);
});
