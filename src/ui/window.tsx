/**
 * ASUS Control's window: no sidebar; four tabs in the title bar's one row,
 * beside the window's controls (VS-1, VS-4): Overview, Fans, Lighting,
 * Advanced. A link inside a tab names a place, and tabs.ts says which tab
 * shows it. The Curve Optimizer's countdown is a sheet over it.
 */

import { AppWindow, Note, Segmented, useTitleBarInset } from "@dashi/ui";
import { ScrollView, View } from "@mirinjs/metal";
import { useState } from "react";
import { type TabId, TABS, tabFor } from "../tabs.ts";
import { AdvancedTab, KeepSheet, KEEP_SECONDS } from "./advanced.tsx";
import { useLive } from "./controls.tsx";
import { FansPane } from "./fans.tsx";
import { LightingPane } from "./lighting.tsx";
import { OverviewTab } from "./overview.tsx";

export const WINDOW_SIZE = { width: 760, height: 480 } as const;

/** `start`: a tab, or a place an old pane or a link names ("battery" opens Advanced). */
export function AsusWindow({ start = "overview" }: { start?: string }) {
  const { live, state } = useLive();
  const inset = useTitleBarInset();
  const [tab, setTab] = useState<TabId>(tabFor(start));
  const [ask, setAsk] = useState<{ token: string; previous: number } | null>(null);
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
  const tabs = (
    <View style={{ flex: 1, flexDirection: "row", justifyContent: "center" }}>
      <Segmented testID="tabs" options={TABS.map((each) => ({ value: each.id, label: each.label }))} value={tab} onChange={setTab} />
    </View>
  );
  // As wide as the controls' corner, so the tabs sit in the window's middle.
  const balance = <View style={{ width: Math.max(0, inset.leading + 2) }} />;
  return (
    <AppWindow title="ASUS Control" center={tabs} toolbar={balance} overlay={overlay}>
      <ScrollView testID={`body:${tab}`} style={{ flex: 1, flexDirection: "column", gap: 16, padding: 16 }}>
        {state.failure && <Note>{state.failure}</Note>}
        {tab === "overview" && <OverviewTab onGo={(place) => setTab(tabFor(place))} />}
        {tab === "fans" && <FansPane />}
        {tab === "lighting" && <LightingPane />}
        {tab === "advanced" && <AdvancedTab onAsk={setAsk} />}
      </ScrollView>
    </AppWindow>
  );
}
