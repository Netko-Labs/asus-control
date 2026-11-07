/**
 * Sensors, read-only from /sys/class/hwmon and /sys/class/power_supply
 * (which the sandbox shows with any hardware permission): the CPU's
 * temperature (k10temp's Tctl, coretemp's package), the graphics chips',
 * the fans (asus's fan inputs), and the battery's draw. Nothing is written.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Reading {
  /** cpu, gpu, dgpu, ssd, wifi, … */
  id: string;
  label: string;
  value: number;
  unit: "°C" | "rpm" | "W";
}

const readNumber = (path: string): number | null => {
  try {
    const value = Number(readFileSync(path, "utf8").trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
};

/** What each hwmon driver is, in words. */
const TEMPERATURES: Readonly<Record<string, { id: string; label: string }>> = {
  k10temp: { id: "cpu", label: "Processor" },
  coretemp: { id: "cpu", label: "Processor" },
  amdgpu: { id: "gpu", label: "Graphics" },
  nouveau: { id: "dgpu", label: "Graphics card" },
  nvme: { id: "ssd", label: "Drive" },
  mt7925_phy0: { id: "wifi", label: "Wi-Fi" },
  acpitz: { id: "board", label: "Inside" },
};

export function readSensors(root = "/sys/class"): Reading[] {
  const readings: Reading[] = [];
  const hwmon = join(root, "hwmon");
  for (const name of existsSync(hwmon) ? readdirSync(hwmon).sort() : []) {
    const dir = join(hwmon, name);
    const driver = readText(join(dir, "name"));
    if (!driver) continue;
    const known = TEMPERATURES[driver];
    if (known && !readings.some((reading) => reading.id === known.id)) {
      const millidegrees = readNumber(join(dir, "temp1_input"));
      if (millidegrees !== null) readings.push({ ...known, value: Math.round(millidegrees / 1000), unit: "°C" });
    }
    // An AMD laptop's processor and its graphics are one package: amdgpu's power is the package's (its PPT).
    if (driver === "amdgpu" && !readings.some((reading) => reading.id === "package")) {
      const microwatts = readNumber(join(dir, "power1_average")) ?? readNumber(join(dir, "power1_input"));
      if (microwatts !== null) readings.push({ id: "package", label: "Processor package", value: Math.round(microwatts / 1_000_000), unit: "W" });
    }
    if (driver === "asus") {
      for (const fan of [1, 2, 3]) {
        const rpm = readNumber(join(dir, `fan${fan}_input`));
        if (rpm === null) continue;
        const label = readText(join(dir, `fan${fan}_label`)) ?? `Fan ${fan}`;
        readings.push({ id: `fan${fan}`, label: label.replace(/_fan$/, " fan").replace(/^cpu/, "CPU").replace(/^gpu/, "GPU"), value: rpm, unit: "rpm" });
      }
    }
  }
  const supply = join(root, "power_supply");
  for (const name of existsSync(supply) ? readdirSync(supply).sort() : []) {
    if (readText(join(supply, name, "type")) !== "Battery") continue;
    const microwatts = readNumber(join(supply, name, "power_now"));
    if (microwatts !== null) readings.push({ id: "battery", label: "Battery draw", value: Math.round(microwatts / 100_000) / 10, unit: "W" });
    break;
  }
  return readings;
}

/** The live numbers: the processor's temperature, the first fan, and the package's watts (the battery's draw where the package isn't read). */
export interface LiveNumbers {
  celsius: number | null;
  rpm: number | null;
  watts: number | null;
}

export function liveNumbers(readings: readonly Reading[]): LiveNumbers {
  const find = (test: (reading: Reading) => boolean): number | null => readings.find(test)?.value ?? null;
  return {
    celsius: find((reading) => reading.id === "cpu"),
    rpm: find((reading) => reading.unit === "rpm"),
    watts: find((reading) => reading.id === "package") ?? find((reading) => reading.id === "battery"),
  };
}

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** A number as the region writes it, whole: 2,900. */
export const formatWhole = (value: number): string => whole.format(value);

/** The live line in words, for a screen reader and the tests: "54° CPU · 2,300 rpm · 38 W". */
export function liveLine(readings: readonly Reading[]): string {
  const { celsius, rpm, watts } = liveNumbers(readings);
  return [celsius === null ? null : `${celsius}° CPU`, rpm === null ? null : `${formatWhole(rpm)} rpm`, watts === null ? null : `${formatWhole(watts)} W`].filter(Boolean).join(" · ");
}

/** What is drawing power, in one line: "Processor 38 W · Battery 14 W" (on battery), "… · Plugged in". */
export function drawLine(readings: readonly Reading[], plugged: boolean): string {
  const find = (id: string): number | null => readings.find((reading) => reading.id === id)?.value ?? null;
  const pkg = find("package");
  const battery = find("battery");
  return [
    pkg === null ? null : `Processor ${formatWhole(pkg)} W`,
    plugged ? "Plugged in" : battery === null ? "On battery" : `Battery ${battery.toFixed(1)} W`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** An hour of readings, one every few seconds. */
export class History {
  private readonly samples = new Map<string, number[]>();

  constructor(private readonly size = 1800) {}

  add(readings: readonly Reading[]): void {
    for (const reading of readings) {
      const list = this.samples.get(reading.id) ?? [];
      list.push(reading.value);
      if (list.length > this.size) list.shift();
      this.samples.set(reading.id, list);
    }
  }

  of(id: string): readonly number[] {
    return this.samples.get(id) ?? [];
  }
}

/** How often Live reads the sensors, so a span of minutes is a count of samples. */
export const SAMPLE_MS = 2000;

/** The last `minutes` of samples (all there are, if fewer). */
export function recent(values: readonly number[], minutes: number, everyMs = SAMPLE_MS): readonly number[] {
  const count = Math.max(1, Math.round((minutes * 60_000) / everyMs));
  return values.length > count ? values.slice(-count) : values;
}

/** `values` averaged into at most `count` even buckets: whole-degree samples drawn as a smooth line, not a staircase. */
export function downsample(values: readonly number[], count: number): number[] {
  if (values.length <= count || count < 2) return [...values];
  return Array.from({ length: count }, (_, at) => {
    const from = Math.floor((at * values.length) / count);
    const to = Math.max(from + 1, Math.floor(((at + 1) * values.length) / count));
    const bucket = values.slice(from, to);
    return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
  });
}

export interface SparkOptions {
  /** The least span drawn, in the values' unit: a steady 54 ± 1 °C stays a calm line, not a zigzag. */
  minSpan?: number;
  /** Room kept above and below, so a stroke at the top or bottom isn't cut. */
  inset?: number;
}

/** A sparkline's path over `values`, scaled to width × height. */
export function sparkline(values: readonly number[], width: number, height: number, { minSpan = 0, inset = 0 }: SparkOptions = {}): string {
  if (values.length < 2) return "";
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  const span = high - low || 1;
  const inner = height - inset * 2;
  return values
    .map((value, at) => `${at === 0 ? "M" : "L"}${((at / (values.length - 1)) * width).toFixed(1)} ${(inset + inner - ((value - low) / span) * inner).toFixed(1)}`)
    .join("");
}
