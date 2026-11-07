/**
 * Fan curves: 8 points per fan (asus_custom_fan_curve), each a temperature
 * in °C and a PWM duty from 0 to 255. dashi-hardware takes a curve only with
 * temperatures rising and duty never falling, so a dragged point is kept
 * between its neighbours, and the curve is drawn as it will be applied.
 */

import type { Point } from "./hardware.ts";

export const TEMP_RANGE = [20, 100] as const;
export const PWM_MAX = 255;

/** A point moved to (temperature, pwm), kept inside its neighbours: temperatures strictly rising, duty not falling. */
export function movePoint(points: readonly Point[], index: number, temperature: number, pwm: number): Point[] {
  const before = points[index - 1];
  const after = points[index + 1];
  const low = before ? before[0] + 1 : TEMP_RANGE[0];
  const high = after ? after[0] - 1 : TEMP_RANGE[1];
  const floor = before ? before[1] : 0;
  const ceiling = after ? after[1] : PWM_MAX;
  const t = Math.round(Math.max(low, Math.min(high, temperature)));
  const p = Math.round(Math.max(floor, Math.min(ceiling, pwm)));
  return points.map((point, at) => (at === index ? [t, p] : point));
}

/** Whether dashi-hardware will take it. */
export function isValidCurve(points: readonly Point[]): boolean {
  return points.every(([t, p], at) => {
    const before = points[at - 1];
    return t >= 0 && t <= 255 && p >= 0 && p <= PWM_MAX && (!before || (t > before[0] && p >= before[1]));
  });
}

export const percent = (pwm: number): number => Math.round((pwm / PWM_MAX) * 100);

export interface Plot {
  width: number;
  height: number;
  pad: number;
}

/** A point's place on the plot, and back. */
export function toPlot([t, p]: Point, plot: Plot): { x: number; y: number } {
  const inner = { w: plot.width - plot.pad * 2, h: plot.height - plot.pad * 2 };
  return { x: plot.pad + ((t - TEMP_RANGE[0]) / (TEMP_RANGE[1] - TEMP_RANGE[0])) * inner.w, y: plot.pad + (1 - p / PWM_MAX) * inner.h };
}

export function fromPlot(x: number, y: number, plot: Plot): Point {
  const inner = { w: plot.width - plot.pad * 2, h: plot.height - plot.pad * 2 };
  const t = TEMP_RANGE[0] + ((x - plot.pad) / inner.w) * (TEMP_RANGE[1] - TEMP_RANGE[0]);
  const p = (1 - (y - plot.pad) / inner.h) * PWM_MAX;
  return [t, p];
}

/** The point nearest (x, y) on the plot, within `reach` points. */
export function nearest(points: readonly Point[], x: number, y: number, plot: Plot, reach = 24): number | null {
  let best: number | null = null;
  let distance = reach;
  points.forEach((point, at) => {
    const at2 = toPlot(point, plot);
    const d = Math.hypot(at2.x - x, at2.y - y);
    if (d <= distance) {
      distance = d;
      best = at;
    }
  });
  return best;
}

/** One layer of the plot: SVG markup drawn in black, for Metal to tint (it draws a markup's own colors in its one tint). */
const layer = (plot: Plot, body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plot.width} ${plot.height}">${body}</svg>`;

/**
 * The plot as SVG layers, each tinted on its own: the grid, the curve with
 * its points (the one held larger), and the live temperature as a dashed
 * line (empty when it isn't known).
 */
export function curveLayers(points: readonly Point[], plot: Plot, held: number | null, now: number | null): { grid: string; curve: string; now: string } {
  const grid: string[] = [];
  for (let t = TEMP_RANGE[0]; t <= TEMP_RANGE[1]; t += 10) {
    const { x } = toPlot([t, 0], plot);
    grid.push(`<path d="M${x.toFixed(1)} ${plot.pad}V${plot.height - plot.pad}" stroke="#000" stroke-width="1"/>`);
  }
  for (let p = 0; p <= PWM_MAX; p += PWM_MAX / 4) {
    const { y } = toPlot([TEMP_RANGE[0], p], plot);
    grid.push(`<path d="M${plot.pad} ${y.toFixed(1)}H${plot.width - plot.pad}" stroke="#000" stroke-width="1"/>`);
  }
  const placed = points.map((point) => toPlot(point, plot));
  const path = placed.map(({ x, y }, at) => `${at === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const dots = placed.map(({ x, y }, at) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${at === held ? 7 : 5}" fill="#000"/>`).join("");
  const line = now === null ? "" : `<path d="M${toPlot([now, 0], plot).x.toFixed(1)} ${plot.pad}V${plot.height - plot.pad}" stroke="#000" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  return {
    grid: layer(plot, grid.join("")),
    curve: layer(plot, `<path d="${path}" fill="none" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>${dots}`),
    now: line ? layer(plot, line) : "",
  };
}

/** The duty the curve gives at `temperature`, between its points (flat past either end). */
export function dutyAt(points: readonly Point[], temperature: number): number {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 0;
  if (temperature <= first[0]) return first[1];
  if (temperature >= last[0]) return last[1];
  for (let at = 1; at < points.length; at++) {
    const [t1, p1] = points[at] as Point;
    const [t0, p0] = points[at - 1] as Point;
    if (temperature <= t1) return p0 + ((temperature - t0) / (t1 - t0 || 1)) * (p1 - p0);
  }
  return last[1];
}

/** The Overview's small picture of the curve: the line, and where the fan is on it now (null when the temperature isn't known). */
export function thumbLayers(points: readonly Point[], plot: Plot, now: number | null): { line: string; dot: string } {
  const path = points
    .map((point, at) => {
      const { x, y } = toPlot(point, plot);
      return `${at === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
  let dot = "";
  if (now !== null && points.length > 0) {
    const t = Math.max(TEMP_RANGE[0], Math.min(TEMP_RANGE[1], now));
    const { x, y } = toPlot([t, dutyAt(points, t)], plot);
    dot = layer(plot, `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#000"/>`);
  }
  return { line: layer(plot, `<path d="${path}" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`), dot };
}
