/** A stand-in for the system bus: a G14 as dashi-hardware and asusd describe it, and every call recorded. */

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
  const slash: Record<string, number | boolean> = { Enabled: true, Brightness: 200, Interval: 2, Mode: 0x26, ShowOnBoot: true, ShowOnShutdown: true, ShowOnSleep: false, ShowOnBattery: false, ShowOnLidClosed: false, ShowBatteryWarning: true };
  const run: BusctlRunner = async (args) => {
    calls.push([...args]);
    const ok = (data: unknown) => ({ code: 0, stdout: JSON.stringify(data), stderr: "" });
    if (args[0] === "get-property") {
      const name = args[4] ?? "";
      return ok({ type: typeof slash[name] === "boolean" ? "b" : "y", data: slash[name] });
    }
    if (args[0] === "set-property") {
      const [, , , , name = "", type, value] = args;
      slash[name] = type === "b" ? value === "true" : Number(value);
      return { code: 0, stdout: "", stderr: "" };
    }
    switch (args[4]) {
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
