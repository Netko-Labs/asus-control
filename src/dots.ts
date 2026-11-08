/**
 * The keyboard light as a row of dots, one per level: a dot is lit up to the
 * level. Tapping a dot sets that level; tapping the lowest dot while it is
 * the only one lit turns the light off. Tapping the level already set does
 * nothing, so a second tap never surprises.
 */

export const LEVEL_NAMES = ["Off", "Low", "Medium", "High"] as const;

export const levelName = (level: number): string => LEVEL_NAMES[level] ?? `Level ${level}`;

/** The level a tap on dot `tapped` (1 is the lowest) sets, from `current`. */
export function dotLevel(tapped: number, current: number): number {
  return tapped === 1 && current === 1 ? 0 : tapped;
}

/** Which of `count` dots are lit at `level`. */
export function litDots(level: number, count: number): boolean[] {
  return Array.from({ length: Math.max(0, count) }, (_, at) => at < level);
}
