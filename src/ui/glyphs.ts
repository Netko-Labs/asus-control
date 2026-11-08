/** ASUS Control's glyphs, on a 16-unit grid with 1.5 strokes and round caps, as Dashi's own; no ASUS or ROG marks. */

const svg = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`;
const stroke = (d: string): string => `<path d="${d}" stroke="#000" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The menu bar item: a fan. */
export const FAN = svg(
  `<circle cx="8" cy="8" r="1.4" fill="#000"/>${stroke("M8 6.6C7.2 4.6 7.6 2.4 9.6 2.2c1.6-.1 1.9 2 .4 3.4M9.4 8.4c2-.8 4.2-.4 4.4 1.6.1 1.6-2 1.9-3.4.4M6.6 8.6c-2 .8-4.2.4-4.4-1.6-.1-1.6 2-1.9 3.4-.4M7.6 9.4c.8 2 .4 4.2-1.6 4.4-1.6.1-1.9-2-.4-3.4")}`,
);

export const GLYPHS: Readonly<Record<string, string>> = {
  power: svg(stroke("M8 2v5.5M4.6 4.2a5 5 0 1 0 6.8 0")),
  fans: FAN,
  battery: svg(`${stroke("M2.5 5.2h9.5a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1zM14.5 7v2")}`),
  lighting: svg(stroke("M8 1.8v1.6M3.6 3.6l1.1 1.1M12.4 3.6l-1.1 1.1M5.6 10.4a3.4 3.4 0 1 1 4.8 0c-.6.6-.9 1.2-.9 2v.8h-3v-.8c0-.8-.3-1.4-.9-2zM6.6 14.4h2.8")),
  sensors: svg(stroke("M6.4 9.2V3.4a1.6 1.6 0 0 1 3.2 0v5.8a3 3 0 1 1-3.2 0zM8 6.4v4.4")),
  keys: svg(stroke("M2.4 4.4h11.2a.8.8 0 0 1 .8.8v5.6a.8.8 0 0 1-.8.8H2.4a.8.8 0 0 1-.8-.8V5.2a.8.8 0 0 1 .8-.8zM4.4 7h.01M6.8 7h.01M9.2 7h.01M11.6 7h.01M5.2 9.4h5.6")),
  advanced: svg(stroke("M2.4 4.4h6M11.2 4.4h2.4M2.4 8h2M7.2 8h6.4M2.4 11.6h7.2M12.4 11.6h1.2M9.8 3v2.8M5.6 6.6v2.8M11 10.2V13")),
};

/** "More": opens the window from the popover's header. */
export const MORE = svg(`<circle cx="3.5" cy="8" r="1.25" fill="#000"/><circle cx="8" cy="8" r="1.25" fill="#000"/><circle cx="12.5" cy="8" r="1.25" fill="#000"/>`);

/** The power modes' tiles. */
export const MODE_GLYPHS: Readonly<Record<string, string>> = {
  // An arc with an A's bar: Dashi picks.
  automatic: svg(stroke("M3.2 12.4 8 2.8l4.8 9.6M5 9h6")),
  // A leaf.
  "low-power": svg(stroke("M3 13c0-6 3.6-9.6 10-10 0 6.4-3.6 10-10 10zM3 13l5.6-5.6")),
  // A level with its bubble.
  balanced: svg(stroke("M1.8 8h3.6M10.6 8h3.6M8 10.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z")),
  // A bolt.
  performance: svg(stroke("M9 1.8 3.6 9h4l-.6 5.2L12.4 7h-4z")),
};

/** The popover's rows. */
export const KEYBOARD = svg(stroke("M2.4 4.4h11.2a.8.8 0 0 1 .8.8v5.6a.8.8 0 0 1-.8.8H2.4a.8.8 0 0 1-.8-.8V5.2a.8.8 0 0 1 .8-.8zM4.4 7h.01M6.8 7h.01M9.2 7h.01M11.6 7h.01M5.2 9.4h5.6"));
export const LID = svg(stroke("M4 13 12 3M7 13l5-6.2"));
export const BATTERY = svg(stroke("M2.5 5.2h9.5a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1zM14.5 7v2M4 7.4v1.2M6 7.4v1.2"));
