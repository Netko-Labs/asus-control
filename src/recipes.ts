/**
 * Mode recipes people edit (dashiOS spec, "ASUS power states in sync", B):
 * each mode's knobs, plugged in and on battery, as sliders inside each
 * knob's real range, with Restore Defaults. The defaults are the model's
 * (dashi-hardware's Describe); the edits are kept in this applet's own home
 * and applied, for the mode that is on and the power source in use, when
 * they change and when the mode or the cable does. Until Dashi's mode store
 * takes edited recipes itself, this is where they live (README, "Recipes").
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Knob, KnobValue, Recipe, Recipes } from "./hardware.ts";

export const MODES = [
  { id: "low-power", label: "Quiet" },
  { id: "balanced", label: "Balanced" },
  { id: "performance", label: "Turbo" },
] as const;

export type Column = "plugged" | "battery";

/** The knobs a recipe edits, in the order the editor lists them, with their names. */
export const RECIPE_KNOBS: ReadonlyArray<{ knob: string; label: string; unit?: string }> = [
  { knob: "ppt-spl", label: "Sustained power", unit: "W" },
  { knob: "ppt-sppt", label: "Short bursts", unit: "W" },
  { knob: "ppt-fppt", label: "Peak", unit: "W" },
  { knob: "nv-tgp", label: "Graphics power", unit: "W" },
  { knob: "nv-dynamic-boost", label: "Graphics boost", unit: "W" },
  { knob: "nv-temp-target", label: "Graphics temperature limit", unit: "°C" },
  { knob: "epp", label: "Energy" },
  { knob: "boost", label: "Boost clock" },
];

export const recipesPath = (home = homedir()): string => join(home, "recipes.json");

const isKnobValue = (value: unknown): value is KnobValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

export function readEdits(path = recipesPath()): Recipes {
  if (!existsSync(path)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null) return {};
    const out: Recipes = {};
    for (const [mode, columns] of Object.entries(value as Record<string, unknown>)) {
      if (!MODES.some((each) => each.id === mode) || typeof columns !== "object" || columns === null) continue;
      const pick = (column: unknown): Recipe =>
        typeof column === "object" && column !== null ? Object.fromEntries(Object.entries(column).filter((entry): entry is [string, KnobValue] => isKnobValue(entry[1]))) : {};
      const { plugged, battery } = columns as Record<string, unknown>;
      out[mode] = { plugged: pick(plugged), battery: pick(battery) };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeEdits(edits: Recipes, path = recipesPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.new`, `${JSON.stringify(edits, null, 2)}\n`);
  renameSync(`${path}.new`, path);
}

/** A value kept inside the knob's range (dashi-hardware clamps too; this keeps the editor honest). */
export function clampTo(knob: Knob | undefined, value: KnobValue): KnobValue {
  if (typeof value !== "number" || !knob) return value;
  return Math.round(Math.max(knob.min ?? value, Math.min(knob.max ?? value, value)));
}

/** What a mode's column is: the model's defaults with the edits over them, only for knobs this machine has. */
export function effective(mode: string, column: Column, defaults: Recipes | null, edits: Recipes, knobs: Record<string, Knob>): Recipe {
  const base = defaults?.[mode]?.[column] ?? {};
  const edited = edits[mode]?.[column] ?? {};
  return Object.fromEntries(
    Object.entries({ ...base, ...edited })
      .filter(([knob]) => knob in knobs)
      .map(([knob, value]) => [knob, clampTo(knobs[knob], value)]),
  );
}

/** The edits with one knob of one column changed; back to the default drops the edit. */
export function edit(edits: Recipes, mode: string, column: Column, knob: string, value: KnobValue, defaults: Recipes | null): Recipes {
  const columns = edits[mode] ?? { plugged: {}, battery: {} };
  const next: Recipe = { ...columns[column], [knob]: value };
  if (defaults?.[mode]?.[column]?.[knob] === value) delete next[knob];
  return { ...edits, [mode]: { ...columns, [column]: next } };
}

export function restoreDefaults(edits: Recipes, mode: string): Recipes {
  const { [mode]: _gone, ...rest } = edits;
  return rest;
}

/** Whether the cable is in, from /sys/class/power_supply (a Mains supply that is online). */
export function pluggedIn(root = "/sys/class/power_supply"): boolean {
  try {
    return readdirSync(root).some((name) => {
      try {
        return readFileSync(join(root, name, "type"), "utf8").trim() === "Mains" && readFileSync(join(root, name, "online"), "utf8").trim() === "1";
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
}

/** A mode's recipe in one line: "Balanced plugged in: 55 W, graphics 80 W, boost on." */
export function recipeLine(mode: string, column: Column, recipe: Recipe): string {
  const label = MODES.find((each) => each.id === mode)?.label ?? mode;
  const parts = [
    typeof recipe["ppt-spl"] === "number" ? `${recipe["ppt-spl"]} W` : null,
    typeof recipe["nv-tgp"] === "number" ? `graphics ${recipe["nv-tgp"]} W` : null,
    typeof recipe.boost === "boolean" ? `boost ${recipe.boost ? "on" : "off"}` : null,
  ].filter(Boolean);
  return `${label} ${column === "plugged" ? "plugged in" : "on battery"}: ${parts.length ? parts.join(", ") : "the firmware's settings"}.`;
}
