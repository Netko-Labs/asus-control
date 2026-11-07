/**
 * Overview: everything at a glance, in a grid of boxes. Now (the
 * temperature and the fan, what is drawing power, the last 30 minutes),
 * Power mode (the modes, the recipe in effect in a line, "Change limits…"),
 * Fans (the curve in small, "Edit in Fans"), Lighting & battery (the
 * popover's three rows). Every sensor follows under the boxes, each with its
 * hour, as the old Sensors pane had them.
 */

import { Segmented, useColors } from "@dashi/ui";
import { type Bounds, Svg, Text, View } from "@mirinjs/metal";
import { useEffect, useState } from "react";
import { thumbLayers } from "../curve.ts";
import type { Point } from "../hardware.ts";
import { chosenMode, modeOptions } from "../modes.ts";
import { effective, recipeLine } from "../recipes.ts";
import { drawLine, formatWhole, liveNumbers } from "../sensors.ts";
import type { TabId } from "../tabs.ts";
import { SectionTitle, useLive } from "./controls.tsx";
import { Box, Link, QuickRows, TemperatureLine } from "./parts.tsx";
import { SensorsPane } from "./sensors.tsx";

/** A box's inner width as laid out, for its picture; a guess until then. */
function useWidth(initial: number): [number, (bounds: Bounds) => void] {
  const [width, setWidth] = useState(initial);
  return [width, (bounds) => setWidth((was) => (Math.abs(was - bounds.width) >= 1 ? Math.floor(bounds.width) : was))];
}

function NowBox() {
  const colors = useColors();
  const { state } = useLive();
  const { celsius, rpm } = liveNumbers(state.readings);
  const [width, measure] = useWidth(320);
  const big = [celsius === null ? null : `${celsius}°`, rpm === null ? null : `${formatWhole(rpm)} rpm`].filter(Boolean).join(" · ");
  return (
    <Box title="Now" testID="box:now">
      <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: "semibold", color: colors.text }}>
        {big || "—"}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
        {drawLine(state.readings, state.plugged)}
      </Text>
      <View onLayout={(bounds) => measure(bounds)} style={{ marginTop: 4 }}>
        <TemperatureLine width={width} height={60} strokeWidth={2} />
      </View>
    </Box>
  );
}

function PowerBox({ onGo }: { onGo: (place: string) => void }) {
  const colors = useColors();
  const { live, state } = useLive();
  const machine = state.machine;
  const profile = machine?.knobs["platform-profile"];
  const chosen = chosenMode(profile);
  if (!machine || !profile || !chosen) {
    return (
      <Box title="Power mode" testID="box:power">
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{state.problem ?? "dashi-hardware doesn't report a power mode on this machine."}</Text>
      </Box>
    );
  }
  const column = state.plugged ? "plugged" : "battery";
  const options = modeOptions(profile).filter((option) => option.enabled);
  return (
    <Box title="Power mode" testID="box:power">
      <Segmented testID="power-mode" options={options.map((option) => ({ value: option.id, label: option.label }))} value={chosen} onChange={(mode) => void live.setMode(mode)} />
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{recipeLine(chosen, column, effective(chosen, column, machine.recipes, state.edits, machine.knobs))}</Text>
      <View style={{ flexDirection: "row" }}>
        <Link label="Change limits…" testID="go:limits" onPress={() => onGo("limits")} />
      </View>
    </Box>
  );
}

function FansBox({ onGo }: { onGo: (place: string) => void }) {
  const colors = useColors();
  const { live, state } = useLive();
  const fan = state.machine?.fans.find((each) => each.curve) ?? state.machine?.fans[0] ?? null;
  const [points, setPoints] = useState<Point[] | null>(null);
  const [width, measure] = useWidth(320);
  useEffect(() => {
    if (!fan?.curve) return;
    let current = true;
    live.hardware
      .fanCurve(fan.id)
      .then((curve) => current && setPoints(curve))
      .catch(() => current && setPoints(null));
    return () => {
      current = false;
    };
  }, [fan?.id, fan?.curve, live]);
  const celsius = liveNumbers(state.readings).celsius;
  const plot = { width, height: 72, pad: 6 };
  const layers = points ? thumbLayers(points, plot, celsius) : null;
  return (
    <Box title="Fans" testID="box:fans">
      <View testID="fan-thumb" onLayout={(bounds) => measure(bounds)} style={{ height: 72, position: "relative" }}>
        {layers && <Svg markup={layers.line} width={width} height={72} color={colors.textMuted} />}
        {layers?.dot && (
          <View style={{ position: "absolute", left: 0, top: 0 }}>
            <Svg markup={layers.dot} width={width} height={72} color={colors.selection} />
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
            {fan ? [fan.label, fan.rpm ? `${formatWhole(fan.rpm)} rpm` : null].filter(Boolean).join(" · ") : "No fans to show"}
          </Text>
        </View>
        {fan?.curve && <Link label="Edit in Fans" testID="go:fans" onPress={() => onGo("fans")} />}
      </View>
    </Box>
  );
}

export function OverviewTab({ onGo }: { onGo: (place: TabId | string) => void }) {
  return (
    <View style={{ flexDirection: "column", gap: 16 }}>
      <View style={{ display: "grid", gridTemplateColumns: ["1fr", "1fr"], gap: 10 }}>
        <NowBox />
        <PowerBox onGo={onGo} />
        <FansBox onGo={onGo} />
        <Box title="Lighting & battery" testID="box:lighting">
          <QuickRows glyphs={false} inset={0} />
        </Box>
      </View>
      <SectionTitle title="Sensors" detail="Each one now, with the last hour beside it." />
      <SensorsPane />
    </View>
  );
}
