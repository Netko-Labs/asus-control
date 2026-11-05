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

/** The popover's live line: "CPU 54 °C · 2300 rpm". */
export function liveLine(readings: readonly Reading[]): string {
  const cpu = readings.find((reading) => reading.id === "cpu");
  const fan = readings.find((reading) => reading.unit === "rpm");
  return [cpu ? `CPU ${cpu.value} °C` : null, fan ? `${fan.value} rpm` : null].filter(Boolean).join(" · ");
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

/** A sparkline's path over `values`, scaled to width × height. */
export function sparkline(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return values
    .map((value, at) => `${at === 0 ? "M" : "L"}${((at / (values.length - 1)) * width).toFixed(1)} ${(height - ((value - low) / span) * height).toFixed(1)}`)
    .join("");
}
