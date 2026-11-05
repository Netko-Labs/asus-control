/**
 * ASUS Control's window (dashiOS spec, ASUS Control C), shaped like Settings:
 * a sidebar of panes and the pane. The Curve Optimizer's countdown is a
 * sheet over it.
 */

import { AppWindow, Note, SidebarItem, SidebarSection } from "@dashi/ui";
import { ScrollView } from "@mirinjs/metal";
import { useState } from "react";
import { AdvancedPane, KeepSheet, KEEP_SECONDS } from "./advanced.tsx";
import { useLive } from "./controls.tsx";
import { FansPane } from "./fans.tsx";
import { FAN, GLYPHS } from "./glyphs.ts";
import { LightingPane } from "./lighting.tsx";
import { BatteryPane, PowerPane } from "./power.tsx";
import { KeysPane, SensorsPane } from "./sensors.tsx";

export const WINDOW_SIZE = { width: 900, height: 640 } as const;

const PANES = [
  { id: "power", label: "Power", tint: "#3b8fd0" },
  { id: "fans", label: "Fans", tint: "#2f9d8f" },
  { id: "battery", label: "Battery", tint: "#4f8f4f" },
  { id: "lighting", label: "Lighting", tint: "#c7892b" },
  { id: "sensors", label: "Sensors", tint: "#d0527f" },
  { id: "keys", label: "Keys", tint: "#7a7a82" },
  { id: "advanced", label: "Advanced", tint: "#6E56CF" },
] as const;

export type PaneId = (typeof PANES)[number]["id"];

export function AsusWindow({ start = "power" }: { start?: PaneId }) {
  const { live, state } = useLive();
  const [pane, setPane] = useState<PaneId>(start);
  const [ask, setAsk] = useState<{ token: string; previous: number } | null>(null);
  const sidebar = (
    <SidebarSection>
      {PANES.map((each) => (
        <SidebarItem key={each.id} testID={`pane:${each.id}`} label={each.label} tile={{ glyph: GLYPHS[each.id] ?? FAN, tint: each.tint }} selected={pane === each.id} onPress={() => setPane(each.id)} />
      ))}
    </SidebarSection>
  );
  const keep = (): void => {
    const current = ask;
    setAsk(null);
    if (current) void live.hardware.confirmTuning(current.token);
  };
  const revert = (): void => {
    const current = ask;
    setAsk(null);
    // Back to what it was; with no countdown, as for saved values.
    if (current) void live.hardware.setCurveOptimizer(current.previous, [], 0).catch(() => {});
  };
  const overlay = ask ? <KeepSheet seconds={KEEP_SECONDS} onKeep={keep} onRevert={revert} /> : undefined;
  const title = PANES.find((each) => each.id === pane)?.label;
  return (
    <AppWindow title="ASUS Control" subtitle={title} sidebar={sidebar} overlay={overlay}>
      <ScrollView testID={`body:${pane}`} style={{ flex: 1, flexDirection: "column", gap: 16, padding: 24 }}>
        {state.failure && <Note>{state.failure}</Note>}
        {pane === "power" && <PowerPane />}
        {pane === "fans" && <FansPane />}
        {pane === "battery" && <BatteryPane />}
        {pane === "lighting" && <LightingPane />}
        {pane === "sensors" && <SensorsPane />}
        {pane === "keys" && <KeysPane />}
        {pane === "advanced" && <AdvancedPane onAsk={setAsk} />}
      </ScrollView>
    </AppWindow>
  );
}
