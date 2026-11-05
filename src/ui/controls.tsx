/**
 * ASUS Control's own small controls, beside @dashi/ui's rows and pills: a
 * slider that writes once when the drag ends, the live store's hook, and
 * a section title.
 */

import { useColors } from "@dashi/ui";
import { type Bounds, Text, View } from "@mirinjs/metal";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Live, LiveState } from "../live.ts";

export const LiveContext = createContext<Live | null>(null);

export function useLive(): { live: Live; state: LiveState } {
  const live = useContext(LiveContext);
  if (!live) throw new Error("ASUS Control's store is not provided");
  return { live, state: useSyncExternalStore(live.subscribe, live.getSnapshot) };
}

const KNOB = 18;
const TRACK = 4;
const SETTLE_MS = 300;

/** A slider over [min, max] in `step`s; `onCommit` once the drag ends (or rests), so a drag is one write. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  width = 220,
  testID,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  width?: number;
  testID: string;
  onCommit: (value: number) => void;
}) {
  const colors = useColors();
  const [dragging, setDragging] = useState<number | null>(null);
  const laid = useRef<Bounds | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  const span = Math.max(max - min, 1);
  const shown = dragging ?? value;
  const left = ((Math.max(min, Math.min(max, shown)) - min) / span) * (width - KNOB);
  const commit = (next: number): void => {
    clearTimeout(pending.current);
    setDragging(null);
    onCommit(next);
  };
  return (
    <View
      testID={testID}
      onLayout={(bounds) => {
        laid.current = bounds;
      }}
      onPointer={(event) => {
        const bar = event.bounds ?? laid.current;
        if (!bar) return;
        const fraction = Math.max(0, Math.min(1, (event.x - bar.x - KNOB / 2) / Math.max(bar.width - KNOB, 1)));
        const next = Math.round((min + fraction * span) / step) * step;
        setDragging(next);
        clearTimeout(pending.current);
        if (event.phase === "up") commit(next);
        else pending.current = setTimeout(() => commit(next), SETTLE_MS);
      }}
      style={{ width, height: KNOB + 4, position: "relative" }}
    >
      <View style={{ position: "absolute", left: 0, top: (KNOB + 4 - TRACK) / 2, width, height: TRACK, borderRadius: TRACK / 2, backgroundColor: colors.track }} />
      <View
        style={{ position: "absolute", left: 0, top: (KNOB + 4 - TRACK) / 2, width: left + KNOB / 2, height: TRACK, borderRadius: TRACK / 2, backgroundColor: colors.selection }}
      />
      <View style={{ position: "absolute", left, top: 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: "#ffffff", shadow: "sm" }} />
    </View>
  );
}

/** A slider with its value beside it. */
export function SliderValue(props: Parameters<typeof Slider>[0] & { unit?: string }) {
  const colors = useColors();
  const [shown, setShown] = useState(props.value);
  useEffect(() => setShown(props.value), [props.value]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Slider
        {...props}
        onCommit={(next) => {
          setShown(next);
          props.onCommit(next);
        }}
      />
      <View style={{ width: 64, alignItems: "flex-end" }}>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{`${shown}${props.unit ? ` ${props.unit}` : ""}`}</Text>
      </View>
    </View>
  );
}

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexShrink: 0, flexDirection: "column", gap: 2, marginTop: 4 }}>
      <Text style={{ fontSize: 15, fontWeight: "bold", color: colors.text }}>{title}</Text>
      {detail !== undefined && <Text style={{ fontSize: 12, color: colors.textMuted }}>{detail}</Text>}
    </View>
  );
}
