/**
 * The window's four tabs, in the title bar's one row, and where everything
 * the old seven panes held went: Power and Sensors to Overview (the mode,
 * the live numbers, every sensor under the boxes), Battery and Keys to
 * Advanced (with the recipes, the power limits, the Curve Optimizer and the
 * graphics card's limits). A link inside the window names a place; this
 * says which tab shows it.
 */

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "fans", label: "Fans" },
  { id: "lighting", label: "Lighting" },
  { id: "advanced", label: "Advanced" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

const PLACES: Readonly<Record<string, TabId>> = {
  overview: "overview",
  power: "overview",
  sensors: "overview",
  fans: "fans",
  curve: "fans",
  lighting: "lighting",
  keyboard: "lighting",
  lid: "lighting",
  advanced: "advanced",
  limits: "advanced",
  recipes: "advanced",
  undervolt: "advanced",
  graphics: "advanced",
  battery: "advanced",
  keys: "advanced",
};

export const isTab = (value: string): value is TabId => TABS.some((tab) => tab.id === value);

/** The tab that shows `place` (a tab, an old pane's id, or a link's target); Overview for anything unknown. */
export function tabFor(place: string): TabId {
  return PLACES[place] ?? "overview";
}
