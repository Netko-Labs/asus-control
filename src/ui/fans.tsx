/**
 * Fans: each fan's curve, 8 points you drag (temperature across, duty up),
 * with the live temperature on it; Apply writes it (dashi-hardware asks for
 * the password once), Restore puts the firmware's back.
 */

import { Button, Note, Segmented, useColors } from "@dashi/ui";
import { type Bounds, Svg, Text, View } from "@mirinjs/metal";
import { useEffect, useRef, useState } from "react";
import { curveSvg, fromPlot, isValidCurve, movePoint, nearest, percent, type Plot } from "../curve.ts";
import type { Point } from "../hardware.ts";
import { useLive } from "./controls.tsx";

const PLOT: Plot = { width: 560, height: 260, pad: 18 };

export function FansPane() {
  const colors = useColors();
  const { live, state } = useLive();
  const fans = (state.machine?.fans ?? []).filter((fan) => fan.curve);
  const [fan, setFan] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const laid = useRef<Bounds | null>(null);
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
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{[cpu === null ? null : `${cpu} °C`, rpm ? `${rpm} rpm` : null].filter(Boolean).join(" · ")}</Text>
      </View>
      {points && (
        <View
          testID="curve"
          onLayout={(bounds) => {
            laid.current = bounds;
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
          style={{ width: PLOT.width, height: PLOT.height, borderRadius: 10, backgroundColor: colors.button }}
        >
          <Svg markup={curveSvg(points, PLOT, { line: colors.selection, grid: colors.separator, point: colors.selection, now: colors.critical }, held, cpu)} width={PLOT.width} height={PLOT.height} />
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
