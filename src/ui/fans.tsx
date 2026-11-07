/**
 * Fans: each fan's curve, 8 points you drag (temperature across, duty up),
 * with the live temperature on it; Apply writes it (dashi-hardware asks for
 * the password once), Restore puts the firmware's back.
 */

import { Button, Note, Segmented, useColors } from "@dashi/ui";
import { type Bounds, Svg, Text, View } from "@mirinjs/metal";
import { useEffect, useRef, useState } from "react";
import { curveLayers, fromPlot, isValidCurve, movePoint, nearest, percent, type Plot } from "../curve.ts";
import type { Point } from "../hardware.ts";
import { formatWhole } from "../sensors.ts";
import { useLive } from "./controls.tsx";

/** The plot's height and inset; its width is the tab's. */
const PLOT_HEIGHT = 260;
const PLOT_PAD = 18;

export function FansPane() {
  const colors = useColors();
  const { live, state } = useLive();
  const fans = (state.machine?.fans ?? []).filter((fan) => fan.curve);
  const [fan, setFan] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const laid = useRef<Bounds | null>(null);
  const [width, setWidth] = useState(700);
  const PLOT: Plot = { width, height: PLOT_HEIGHT, pad: PLOT_PAD };
  const chosen = fan ?? fans[0]?.id ?? null;

  useEffect(() => {
    if (!chosen) return;
    let current = true;
    setPoints(null);
    live.hardware
      .fanCurve(chosen)
      .then((curve) => current && setPoints(curve))
      .catch((error) => current && setMessage(String(error)));
    return () => {
      current = false;
    };
  }, [chosen, live]);

  if (fans.length === 0 || !chosen) return <Note>{state.problem ?? "This machine's fans don't take a custom curve."}</Note>;
  const cpu = state.readings.find((reading) => reading.id === (chosen.includes("gpu") ? "gpu" : "cpu"))?.value ?? null;
  const rpm = state.machine?.fans.find((each) => each.id === chosen)?.rpm;
  return (
    <View style={{ flexDirection: "column", gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Segmented testID="fan" options={fans.map((each) => ({ value: each.id, label: each.label }))} value={chosen} onChange={setFan} />
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{[cpu === null ? null : `${cpu} °C`, rpm ? `${formatWhole(rpm)} rpm` : null].filter(Boolean).join(" · ")}</Text>
      </View>
      {points && (
        <View
          testID="curve"
          onLayout={(bounds) => {
            laid.current = bounds;
            if (Math.abs(bounds.width - width) >= 1) setWidth(Math.floor(bounds.width));
          }}
          onPointer={(event) => {
            const box = event.bounds ?? laid.current;
            if (!box) return;
            const x = ((event.x - box.x) / box.width) * PLOT.width;
            const y = ((event.y - box.y) / box.height) * PLOT.height;
            const index = event.phase === "down" ? nearest(points, x, y, PLOT) : held;
            if (event.phase === "up") setHeld(null);
            if (index === null) return;
            if (event.phase === "down") setHeld(index);
            const [t, p] = fromPlot(x, y, PLOT);
            setPoints(movePoint(points, index, t, p));
          }}
          style={{ height: PLOT.height, borderRadius: 10, backgroundColor: colors.button, position: "relative" }}
        >
          {(() => {
            // Metal draws an SVG in one tint, so each color is a layer of its own.
            const layers = curveLayers(points, PLOT, held, cpu);
            const at = { position: "absolute" as const, left: 0, top: 0 };
            return (
              <>
                <View style={at}>
                  <Svg markup={layers.grid} width={PLOT.width} height={PLOT.height} color={colors.separator} />
                </View>
                {layers.now && (
                  <View style={at}>
                    <Svg markup={layers.now} width={PLOT.width} height={PLOT.height} color={colors.critical} />
                  </View>
                )}
                <View style={at}>
                  <Svg markup={layers.curve} width={PLOT.width} height={PLOT.height} color={colors.selection} />
                </View>
              </>
            );
          })()}
        </View>
      )}
      {points && (
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{points.map(([t, p]) => `${t}° ${percent(p)}%`).join("   ")}</Text>
      )}
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
        <Button
          label="Restore"
          testID="fan-restore"
          onPress={() =>
            void live.hardware
              .resetFanCurves()
              .then(() => live.hardware.fanCurve(chosen))
              .then(setPoints)
              .catch((error) => setMessage(String(error)))
          }
        />
        <Button
          label="Apply"
          testID="fan-apply"
          primary
          disabled={!points || !isValidCurve(points)}
          onPress={() =>
            points &&
            void live.hardware
              .setFanCurve(chosen, points)
              .then(() => setMessage("Applied."))
              .catch((error) => setMessage(String(error)))
          }
        />
      </View>
      {message && <Note>{message}</Note>}
    </View>
  );
}
