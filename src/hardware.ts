/**
 * dashi-hardware (`dev.dashi.Hardware1` on the system bus; dashiOS
 * docs/hardware.md is the contract): what this machine has, its knobs, fan
 * curves, and the Curve Optimizer. It clamps every value and its polkit
 * actions decide (everyday knobs for the active session; tuning and fan
 * curves ask for the password once). Everything that arrives is parsed.
 */

import type { BusValue, SystemBus } from "./bus.ts";

const NAME = "dev.dashi.Hardware1";
const PATH = "/dev/dashi/Hardware1";

export type KnobValue = string | number | boolean;

export interface Knob {
  value: KnobValue;
  choices?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface Fan {
  id: string;
  label: string;
  rpm: number | null;
  curve: boolean;
}

export type Recipe = Record<string, KnobValue>;
export type Recipes = Record<string, { plugged: Recipe; battery: Recipe }>;

export interface Machine {
  model: string | null;
  product: string | null;
  knobs: Record<string, Knob>;
  fans: Fan[];
  lighting: { keyboardLevels: number | null; slash: boolean; aura: boolean };
  hotkeys: Record<string, string>;
  recipes: Recipes | null;
}

export type Point = [temperature: number, pwm: number];

export interface CurveOptimizer {
  available: boolean;
  reason: string | null;
  range: [number, number];
  perCore: boolean;
  cores: number;
  allCore: number;
  perCoreValues: number[];
}

/** The D-Bus type of each knob's value (docs/hardware.md, "Knobs"). */
export const KNOB_TYPES: Readonly<Record<string, "s" | "u" | "b">> = {
  "platform-profile": "s",
  epp: "s",
  "charge-limit": "u",
  "kbd-backlight": "u",
  "panel-overdrive": "b",
  boost: "b",
  "cpu-max-freq": "u",
  "ppt-spl": "u",
  "ppt-sppt": "u",
  "ppt-fppt": "u",
  "nv-tgp": "u",
  "nv-dynamic-boost": "u",
  "nv-temp-target": "u",
  "gpu-mux": "u",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isKnobValue = (value: unknown): value is KnobValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

function parseRecipe(value: unknown): Recipe {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, KnobValue] => isKnobValue(entry[1]) && entry[0] in KNOB_TYPES));
}

/** Describe()'s JSON → the machine; anything unexpected is left out, never guessed. */
export function parseDescribe(text: string): Machine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const knobs: Record<string, Knob> = {};
  if (isRecord(value.knobs)) {
    for (const [name, knob] of Object.entries(value.knobs)) {
      if (!isRecord(knob) || !isKnobValue(knob.value)) continue;
      knobs[name] = {
        value: knob.value,
        ...(Array.isArray(knob.choices) ? { choices: knob.choices.filter((each): each is string => typeof each === "string") } : {}),
        ...(typeof knob.min === "number" ? { min: knob.min } : {}),
        ...(typeof knob.max === "number" ? { max: knob.max } : {}),
        ...(typeof knob.unit === "string" ? { unit: knob.unit } : {}),
      };
    }
  }
  const fans: Fan[] = Array.isArray(value.fans)
    ? value.fans.filter(isRecord).flatMap((fan) =>
        typeof fan.id === "string"
          ? [{ id: fan.id, label: typeof fan.label === "string" ? fan.label : fan.id, rpm: typeof fan.rpm === "number" ? fan.rpm : null, curve: fan.curve === true }]
          : [],
      )
    : [];
  const lighting = isRecord(value.lighting) ? value.lighting : {};
  const keyboard = isRecord(lighting.keyboard) ? lighting.keyboard : null;
  const recipes: Recipes | null = isRecord(value.recipes)
    ? Object.fromEntries(
        Object.entries(value.recipes)
          .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
          .map(([mode, columns]) => [mode, { plugged: parseRecipe(columns.plugged), battery: parseRecipe(columns.battery) }]),
      )
    : null;
  return {
    model: typeof value.model === "string" ? value.model : null,
    product: typeof value.product === "string" ? value.product : null,
    knobs,
    fans,
    lighting: { keyboardLevels: typeof keyboard?.levels === "number" ? keyboard.levels : null, slash: lighting.slash === true, aura: lighting.aura === true },
    hotkeys: isRecord(value.hotkeys) ? Object.fromEntries(Object.entries(value.hotkeys).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {},
    recipes,
  };
}

export function parseCurveOptimizer(text: string): CurveOptimizer | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || typeof value.available !== "boolean") return null;
    const range = Array.isArray(value.range) && value.range.length === 2 && value.range.every((n) => typeof n === "number") ? (value.range as [number, number]) : [0, 0];
    return {
      available: value.available,
      reason: typeof value.reason === "string" ? value.reason : null,
      range: [Math.min(...range), Math.max(...range)],
      perCore: value.perCore === true,
      cores: typeof value.cores === "number" ? value.cores : 0,
      allCore: typeof value.allCore === "number" ? value.allCore : 0,
      perCoreValues: Array.isArray(value.perCoreValues) ? value.perCoreValues.filter((n): n is number => typeof n === "number") : [],
    };
  } catch {
    return null;
  }
}

/** busctl's a(yy) → points. */
export function parseCurve(data: BusValue[]): Point[] {
  const list = Array.isArray(data[0]) ? (data[0] as BusValue[]) : [];
  return list.flatMap((pair) => (Array.isArray(pair) && typeof pair[0] === "number" && typeof pair[1] === "number" ? [[pair[0], pair[1]] as Point] : []));
}

/** One knob as busctl's variant arguments: `TYPE VALUE`. */
export function variantArgs(knob: string, value: KnobValue): [string, string] {
  const type = KNOB_TYPES[knob];
  if (!type) throw new Error(`no knob ${knob}`);
  return [type, type === "b" ? String(value === true || value === "true") : String(value)];
}

export class Hardware {
  constructor(private readonly bus: SystemBus) {}

  async describe(): Promise<Machine | null> {
    const [text] = await this.bus.call(NAME, PATH, NAME, "Describe");
    return typeof text === "string" ? parseDescribe(text) : null;
  }

  async set(knob: string, value: KnobValue): Promise<KnobValue | null> {
    const [type, text] = variantArgs(knob, value);
    const [applied] = await this.bus.call(NAME, PATH, NAME, "Set", "sv", [knob, type, text]);
    return isKnobValue(applied) ? applied : isRecord(applied) && isKnobValue(applied.data) ? applied.data : null;
  }

  /** One recipe in one call (the service writes the profile first). */
  async setMany(recipe: Recipe): Promise<void> {
    const entries = Object.entries(recipe).filter(([knob]) => knob in KNOB_TYPES);
    const args = entries.flatMap(([knob, value]) => [knob, ...variantArgs(knob, value)]);
    await this.bus.call(NAME, PATH, NAME, "SetMany", "a{sv}", [entries.length, ...args]);
  }

  async fanCurve(fan: string): Promise<Point[]> {
    return parseCurve(await this.bus.call(NAME, PATH, NAME, "GetFanCurve", "s", [fan]));
  }

  async setFanCurve(fan: string, points: readonly Point[]): Promise<void> {
    await this.bus.call(NAME, PATH, NAME, "SetFanCurve", "sa(yy)", [fan, points.length, ...points.flat()]);
  }

  async resetFanCurves(): Promise<void> {
    await this.bus.call(NAME, PATH, NAME, "ResetFanCurves");
  }

  async curveOptimizer(): Promise<CurveOptimizer | null> {
    const [text] = await this.bus.call(NAME, PATH, NAME, "CurveOptimizer");
    return typeof text === "string" ? parseCurveOptimizer(text) : null;
  }

  /** Applies an offset now; it goes back to 0 unless `confirm(token)` within `seconds`. */
  async setCurveOptimizer(allCore: number, perCore: readonly number[], seconds: number): Promise<string> {
    const [token] = await this.bus.call(NAME, PATH, NAME, "SetCurveOptimizer", "iaiu", [allCore, perCore.length, ...perCore, seconds]);
    if (typeof token !== "string") throw new Error("dashi-hardware gave no token");
    return token;
  }

  async confirmTuning(token: string): Promise<void> {
    await this.bus.call(NAME, PATH, NAME, "ConfirmTuning", "s", [token]);
  }
}
