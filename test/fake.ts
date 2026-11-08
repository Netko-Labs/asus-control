/** A stand-in for the system bus: a G14 as dashi-hardware describes it, its Slash bar included, and every call recorded. */

import { type BusctlRunner, SystemBus } from "../src/bus.ts";

export const G14_DESCRIBE = {
  model: "GA403WR",
  vendor: "ASUSTeK COMPUTER INC.",
  product: "ROG Zephyrus G14 GA403WR_GA403WR",
  laptop: true,
  knobs: {
    "platform-profile": { value: "balanced", choices: ["low-power", "balanced", "performance"] },
    "charge-limit": { value: 80, min: 20, max: 100 },
    "kbd-backlight": { value: 1, min: 0, max: 3 },
    "ppt-spl": { value: 55, min: 15, max: 80, unit: "W" },
    "ppt-sppt": { value: 65, min: 15, max: 80, unit: "W" },
    "nv-tgp": { value: 80, min: 55, max: 95, unit: "W" },
    boost: { value: true },
    epp: { value: "balance_performance", choices: ["performance", "balance_performance", "balance_power", "power"] },
    "panel-overdrive": { value: false },
  },
  fans: [
    { id: "cpu", label: "CPU fan", rpm: 2300, curve: true },
    { id: "gpu", label: "GPU fan", rpm: 2600, curve: true },
  ],
  lighting: { keyboard: { levels: 3 }, slash: true, aura: false },
  hotkeys: { mode: "KEY_PROG3", lighting: "KEY_KBDILLUMTOGGLE", rog: "KEY_PROG1", micMute: "KEY_MICMUTE" },
  recipes: {
    balanced: { plugged: { "platform-profile": "balanced", epp: "balance_performance", "ppt-spl": 55 }, battery: { "platform-profile": "balanced", "ppt-spl": 30 } },
  },
};

const CURVE = [
  [30, 20],
  [40, 30],
  [50, 50],
  [60, 80],
  [70, 120],
  [80, 170],
  [90, 220],
  [100, 255],
];

export function fakeBus(describe: unknown = G14_DESCRIBE) {
  const calls: string[][] = [];
  const slash: Record<string, string | number | boolean> = {
    enabled: true,
    brightness: 200,
    interval: 2,
    mode: "spectrum",
    showOnBoot: true,
    showOnShutdown: true,
    showOnSleep: false,
    showOnBattery: false,
    showOnLidClosed: false,
    showBatteryWarning: true,
  };
  const slashJson = () =>
    JSON.stringify({ available: true, reason: "", device: "hidraw5", ...slash, modes: ["static", "bounce", "flow", "spectrum"], limits: { brightness: [0, 255], interval: [0, 5] } });
  const run: BusctlRunner = async (args) => {
    calls.push([...args]);
    const ok = (data: unknown) => ({ code: 0, stdout: JSON.stringify(data), stderr: "" });
    switch (args[4]) {
      case "Slash":
        return ok({ type: "s", data: [slashJson()] });
      case "SetSlash": {
        // a{sv}: the count, then KEY TYPE VALUE for each; clamped as dashi-hardware does.
        const entries = args.slice(7);
        for (let at = 0; at + 3 <= entries.length; at += 3) {
          const [key = "", type, value = ""] = entries.slice(at, at + 3);
          slash[key] = type === "b" ? value === "true" : type === "s" ? value : Math.min(key === "interval" ? 5 : 255, Number(value));
        }
        return ok({ type: "s", data: [slashJson()] });
      }
      case "Describe":
        return ok({ type: "s", data: [JSON.stringify(describe)] });
      case "GetFanCurve":
        return ok({ type: "a(yy)", data: [CURVE] });
      case "CurveOptimizer":
        return ok({ type: "s", data: [JSON.stringify({ available: true, reason: "", range: [-40, 0], perCore: true, cores: 12, allCore: 0, perCoreValues: [] })] });
      case "SetCurveOptimizer":
        return ok({ type: "s", data: ["token-1"] });
      case "Set":
        return ok({ type: "v", data: [{ type: args[7], data: args[8] }] });
      default:
        return ok({ type: "", data: [] });
    }
  };
  return { bus: new SystemBus(run), calls, slash };
}
