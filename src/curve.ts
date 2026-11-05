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

/**
 * The plot as SVG: the grid, the curve, its points (the one held larger),
 * and the live temperature as a line. Fills and strokes are colors given,
 * since Metal draws the markup as it is when no tint is set.
 */
export function curveSvg(points: readonly Point[], plot: Plot, colors: { line: string; grid: string; point: string; now: string }, held: number | null, now: number | null): string {
  const grid: string[] = [];
  for (let t = TEMP_RANGE[0]; t <= TEMP_RANGE[1]; t += 10) {
    const { x } = toPlot([t, 0], plot);
    grid.push(`<path d="M${x.toFixed(1)} ${plot.pad}V${plot.height - plot.pad}" stroke="${colors.grid}" stroke-width="1"/>`);
  }
  for (let p = 0; p <= PWM_MAX; p += PWM_MAX / 4) {
    const { y } = toPlot([TEMP_RANGE[0], p], plot);
    grid.push(`<path d="M${plot.pad} ${y.toFixed(1)}H${plot.width - plot.pad}" stroke="${colors.grid}" stroke-width="1"/>`);
  }
  const placed = points.map((point) => toPlot(point, plot));
  const path = placed.map(({ x, y }, at) => `${at === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const dots = placed.map(({ x, y }, at) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${at === held ? 7 : 5}" fill="${colors.point}"/>`).join("");
  const live = now === null ? "" : `<path d="M${toPlot([now, 0], plot).x.toFixed(1)} ${plot.pad}V${plot.height - plot.pad}" stroke="${colors.now}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plot.width} ${plot.height}">${grid.join("")}${live}<path d="${path}" fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
}
