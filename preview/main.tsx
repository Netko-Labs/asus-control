/**
 * The popover and the window on a fixed, made-up G14, through the Metal
 * host, for screenshots: `bun preview/main.tsx popover|overview|fans|lighting|advanced
 * [--dark] [--seconds N]`. Nothing here reaches hardware: the bus is the
 * tests' stand-in (test/fake.ts), the sensors are numbers below, and the
 * last half hour of temperature is drawn from a formula. The popover is
 * drawn in a small window of its own (on the laptop it is a surface under
 * the menu bar item). It closes itself after N seconds (60 by default).
 */

import { metalHost } from "@dashi/applet";
import { setAppearanceSource, useColors, useSurface } from "@dashi/ui";
import { render, spawnNativeHost, View } from "@mirinjs/metal";
import { Hardware } from "../src/hardware.ts";
import { Live } from "../src/live.ts";
import type { Reading } from "../src/sensors.ts";
import { Slash } from "../src/slash.ts";
import { isTab } from "../src/tabs.ts";
import { LiveContext } from "../src/ui/controls.tsx";
import { AsusPopover, POPOVER_SIZE } from "../src/ui/popover.tsx";
import { AsusWindow, WINDOW_SIZE } from "../src/ui/window.tsx";
import { fakeBus, G14_DESCRIBE } from "../test/fake.ts";

const args = process.argv.slice(2);
const what = args.find((arg) => !arg.startsWith("--") && !/^\d+$/.test(arg)) ?? "popover";
const dark = args.includes("--dark");
const seconds = Number(args[args.indexOf("--seconds") + 1]) || 60;
if (what !== "popover" && !isTab(what)) throw new Error(`preview: ${what}? popover, overview, fans, lighting or advanced`);

setAppearanceSource({ subscribe: () => () => {}, isDark: () => dark });

const describe = {
  ...G14_DESCRIBE,
  knobs: {
    ...G14_DESCRIBE.knobs,
    "kbd-backlight": { value: 3, min: 0, max: 3 },
    "ppt-fppt": { value: 80, min: 15, max: 100, unit: "W" },
    "nv-dynamic-boost": { value: 25, min: 5, max: 25, unit: "W" },
    "nv-temp-target": { value: 87, min: 75, max: 87, unit: "°C" },
  },
  fans: [
    { id: "cpu", label: "CPU fan", rpm: 2900, curve: true },
    { id: "gpu", label: "GPU fan", rpm: 3100, curve: true },
  ],
  recipes: {
    "low-power": { plugged: { "ppt-spl": 30, boost: false }, battery: { "ppt-spl": 20, boost: false } },
    balanced: { plugged: { "ppt-spl": 55, boost: true, epp: "balance_performance" }, battery: { "ppt-spl": 35, boost: true } },
    performance: { plugged: { "ppt-spl": 80, "nv-tgp": 95, boost: true }, battery: { "ppt-spl": 45, boost: true } },
  },
};

const { bus, slash } = fakeBus(describe);
slash.mode = "bounce";

const readings: Reading[] = [
  { id: "cpu", label: "Processor", value: 62, unit: "°C" },
  { id: "gpu", label: "Graphics", value: 51, unit: "°C" },
  { id: "package", label: "Processor package", value: 38, unit: "W" },
  { id: "ssd", label: "Drive", value: 41, unit: "°C" },
  { id: "wifi", label: "Wi-Fi", value: 44, unit: "°C" },
  { id: "fan1", label: "CPU fan", value: 2900, unit: "rpm" },
  { id: "fan2", label: "GPU fan", value: 3100, unit: "rpm" },
  { id: "battery", label: "Battery draw", value: 14.2, unit: "W" },
];

const live = new Live(new Hardware(bus), new Slash(bus), () => readings, () => true);
// An hour of samples, one every 2 s: a laptop warming from 50° under a build, with the small wobble real sensors have.
for (let at = 0; at < 1800; at++) {
  const t = at / 1800;
  const cpu = 50 + 12 * t ** 1.4 + 2.2 * Math.sin(at / 37) + 1.1 * Math.sin(at / 9.3);
  live.history.add(
    readings.map((reading) =>
      reading.id === "cpu"
        ? { ...reading, value: Math.round(cpu) }
        : reading.unit === "°C"
          ? { ...reading, value: Math.round(reading.value - 4 + 4 * t + Math.sin(at / 50)) }
          : reading.unit === "rpm"
            ? { ...reading, value: Math.round(reading.value - 600 + 600 * t + 80 * Math.sin(at / 40)) }
            : { ...reading, value: Math.round((reading.value + 3 * Math.sin(at / 60)) * 10) / 10 },
    ),
  );
}
await live.tick();

/** The popover as it sits under the menu bar, on the screen's own ground, clear of the window's controls. */
function Stage() {
  const surface = useSurface();
  const colors = useColors();
  return (
    <View dragRegion style={{ flex: 1, backgroundColor: surface.canvas, paddingTop: 44, alignItems: "center" }}>
      <View style={{ width: POPOVER_SIZE.width, height: POPOVER_SIZE.height, borderRadius: 12, shadow: "xl", backgroundColor: colors.launcher }}>
        <AsusPopover onOpenWindow={() => {}} />
      </View>
    </View>
  );
}

const size = what === "popover" ? { width: POPOVER_SIZE.width + 48, height: POPOVER_SIZE.height + 44 + 24 } : WINDOW_SIZE;
const host = spawnNativeHost(process.env.DASHI_METAL_HOST ?? metalHost(), {
  title: what === "popover" ? "ASUS Control popover" : "ASUS Control",
  appId: "dev.netko.asus-control.preview",
  ...size,
  titleBar: "unified",
});
const root = render(<LiveContext.Provider value={live}>{what === "popover" ? <Stage /> : <AsusWindow start={what} />}</LiveContext.Provider>, host);
host.onClose(() => process.exit(0));
setTimeout(() => {
  root.unmount();
  host.close();
  process.exit(0);
}, seconds * 1000);
