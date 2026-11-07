import { expect, test } from "bun:test";
import { dutyAt, thumbSvg } from "../src/curve.ts";
import { dotLevel, levelName, litDots } from "../src/dots.ts";
import { chosenMode, modeOfProfile, modeOptions } from "../src/modes.ts";
import { recipeLine } from "../src/recipes.ts";
import { drawLine, recent, SAMPLE_MS, sparkline } from "../src/sensors.ts";
import { isTab, TABS, tabFor } from "../src/tabs.ts";
import { popoverSize } from "../src/ui/popover.tsx";

const points = (path: string): Array<[number, number]> =>
  [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);

test("the temperature line: the last 30 minutes of samples, scaled into its box", () => {
  const hour = Array.from({ length: 1800 }, (_, at) => at);
  const half = recent(hour, 30);
  expect(half).toHaveLength((30 * 60_000) / SAMPLE_MS);
  expect(half[0]).toBe(900);
  expect(half.at(-1)).toBe(1799);
  // Fewer samples than the span: all of them.
  expect(recent([1, 2, 3], 30)).toEqual([1, 2, 3]);

  const path = sparkline([50, 60, 70], 100, 22, { inset: 1 });
  expect(points(path)).toEqual([
    [0, 21],
    [50, 11],
    [100, 1],
  ]);
  // A steady temperature stays a calm line in the middle, not a zigzag across the box.
  const steady = points(sparkline([54, 55, 54, 55], 90, 20, { minSpan: 10 }));
  expect(steady.every(([, y]) => y >= 9 && y <= 11)).toBe(true);
  // One sample is no line.
  expect(sparkline([54], 90, 20)).toBe("");
});

test("the keyboard's dots: a tap sets that level; the lowest again turns it off", () => {
  expect(litDots(2, 3)).toEqual([true, true, false]);
  expect(litDots(0, 3)).toEqual([false, false, false]);
  expect(dotLevel(3, 1)).toBe(3);
  expect(dotLevel(1, 3)).toBe(1);
  expect(dotLevel(2, 2)).toBe(2);
  expect(dotLevel(1, 1)).toBe(0);
  expect(dotLevel(1, 0)).toBe(1);
  expect(levelName(0)).toBe("Off");
  expect(levelName(3)).toBe("High");
});

test("tabs: four, and every old pane and link lands on one", () => {
  expect(TABS.map((tab) => tab.label)).toEqual(["Overview", "Fans", "Lighting", "Advanced"]);
  expect(tabFor("power")).toBe("overview");
  expect(tabFor("sensors")).toBe("overview");
  expect(tabFor("battery")).toBe("advanced");
  expect(tabFor("keys")).toBe("advanced");
  expect(tabFor("limits")).toBe("advanced");
  expect(tabFor("fans")).toBe("fans");
  expect(tabFor("lighting")).toBe("lighting");
  expect(tabFor("anything")).toBe("overview");
  expect(isTab("advanced")).toBe(true);
  expect(isTab("power")).toBe(false);
});

test("modes: Automatic first, then the machine's own; quiet reads as Quiet", () => {
  const profile = { value: "quiet", choices: ["quiet", "balanced", "performance"] };
  expect(modeOptions(profile, true).map((mode) => [mode.label, mode.enabled])).toEqual([
    ["Automatic", true],
    ["Quiet", true],
    ["Balanced", true],
    ["Turbo", true],
  ]);
  expect(modeOptions({ value: "balanced", choices: ["balanced", "performance"] }, false).map((mode) => mode.id)).toEqual(["automatic", "balanced", "performance"]);
  expect(modeOptions(profile, false)[0]?.enabled).toBe(false);
  expect(chosenMode(profile)).toBe("low-power");
  expect(modeOfProfile("custom")).toBeNull();
});

test("the Overview's lines: the recipe, what draws power, and the fan's place on its curve", () => {
  expect(recipeLine("balanced", "plugged", { "ppt-spl": 55, boost: true })).toBe("Balanced plugged in: 55 W, boost on.");
  expect(recipeLine("performance", "battery", {})).toBe("Turbo on battery: the firmware's settings.");
  const readings = [
    { id: "package", label: "Processor package", value: 38, unit: "W" as const },
    { id: "battery", label: "Battery draw", value: 14.25, unit: "W" as const },
  ];
  expect(drawLine(readings, false)).toBe("Processor 38 W · Battery 14.3 W");
  expect(drawLine(readings, true)).toBe("Processor 38 W · Plugged in");
  const curve: Array<[number, number]> = [
    [40, 50],
    [60, 150],
  ];
  expect(dutyAt(curve, 50)).toBe(100);
  expect(dutyAt(curve, 20)).toBe(50);
  expect(dutyAt(curve, 90)).toBe(150);
  expect(thumbSvg(curve, { width: 100, height: 40, pad: 4 }, { line: "#888", now: "#357A64" }, 50)).toContain("<circle");
});

test("the popover: 272 wide, about 230 tall, a row shorter without a Slash bar", () => {
  expect(popoverSize(3)).toEqual({ width: 272, height: 232 });
  expect(popoverSize(2).height).toBe(198);
});
