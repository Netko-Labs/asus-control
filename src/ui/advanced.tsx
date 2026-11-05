/**
 * Advanced (dashiOS spec, CPU tuning A–E): the Curve Optimizer, applied
 * with a countdown that puts it back unless kept (dashi-hardware's
 * SetCurveOptimizer and ConfirmTuning, its boot guard behind them); the
 * three power limits; boost and the preference; the graphics card's
 * limits; the panel's overdrive. Every range is the firmware's.
 */

import { Button, Group, Note, Row, Segmented, Sheet, useColors } from "@dashi/ui";
import { Text, View } from "@mirinjs/metal";
import { useEffect, useState } from "react";
import type { CurveOptimizer } from "../hardware.ts";
import { SectionTitle, SliderValue, useLive } from "./controls.tsx";

/** How long a new undervolt waits to be kept before it goes back (as Displays does). */
export const KEEP_SECONDS = 20;

const REASONS: Readonly<Record<string, string>> = {
  lockdown: "Turn off Secure Boot to undervolt: it stops the writes the processor needs.",
  "unsupported-cpu": "This processor can't be undervolted this way.",
  rejected: "The processor didn't take a test value, so undervolting is off.",
  "not-in-database": "Dashi doesn't know this model's safe range yet.",
};

/** The countdown sheet: Revert or Keep, and it reverts by itself at 0. */
export function KeepSheet({ seconds, onKeep, onRevert }: { seconds: number; onKeep: () => void; onRevert: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left <= 0) onRevert();
  }, [left, onRevert]);
  const colors = useColors();
  return (
    <Sheet testID="keep-sheet" onCancel={onRevert}>
      <View style={{ flexDirection: "column", gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "bold", color: colors.text }}>Keep these settings?</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{`They go back in ${Math.max(left, 0)} seconds unless you keep them.`}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>If the computer freezes, the next start uses the defaults.</Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Button label="Revert" testID="revert" onPress={onRevert} />
          <Button label="Keep" testID="keep" primary onPress={onKeep} />
        </View>
      </View>
    </Sheet>
  );
}

function Undervolt({ onAsk }: { onAsk: (ask: { token: string; previous: number }) => void }) {
  const colors = useColors();
  const { live } = useLive();
  const [co, setCo] = useState<CurveOptimizer | null>(null);
  const [value, setValue] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void live.hardware
      .curveOptimizer()
      .then((answer) => {
        setCo(answer);
        if (answer) setValue(answer.allCore);
      })
      .catch((error) => setMessage(String(error)));
  }, [live]);
  if (!co) return <Note>{message ?? "Asking dashi-hardware…"}</Note>;
  if (!co.available) return <Note>{REASONS[co.reason ?? ""] ?? "Undervolting isn't available on this machine."}</Note>;
  const tryIt = (): void => {
    void live.hardware
      .setCurveOptimizer(value, [], KEEP_SECONDS)
      .then((token) => onAsk({ token, previous: co.allCore }))
      .catch((error) => setMessage(String(error)));
  };
  return (
    <Group testID="undervolt">
      <Row label="All cores" detail="Lower runs cooler at the same speed. Too low and the computer can freeze; Dashi undoes it if it does.">
        <SliderValue testID="co-all" value={value} min={co.range[0]} max={co.range[1]} onCommit={setValue} />
      </Row>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{`Now ${co.allCore}`}</Text>
        <Button label={`Try for ${KEEP_SECONDS} Seconds`} testID="co-try" primary disabled={value === co.allCore} onPress={tryIt} />
      </View>
      {message && <Note>{message}</Note>}
    </Group>
  );
}

const LIMITS = [
  { knob: "ppt-spl", label: "Sustained", unit: "W" },
  { knob: "ppt-sppt", label: "Short bursts", unit: "W" },
  { knob: "ppt-fppt", label: "Peak", unit: "W" },
] as const;

const GRAPHICS = [
  { knob: "nv-tgp", label: "Power", unit: "W" },
  { knob: "nv-dynamic-boost", label: "Dynamic boost", unit: "W" },
  { knob: "nv-temp-target", label: "Temperature limit", unit: "°C" },
] as const;

function KnobSliders({ list }: { list: ReadonlyArray<{ knob: string; label: string; unit: string }> }) {
  const { live, state } = useLive();
  const knobs = state.machine?.knobs ?? {};
  const present = list.filter(({ knob }) => knob in knobs);
  if (present.length === 0) return <Note>This machine doesn't have these.</Note>;
  return (
    <Group>
      {present.map(({ knob, label, unit }) => {
        const range = knobs[knob];
        return (
          <Row key={knob} label={label}>
            <SliderValue testID={`knob:${knob}`} value={Number(range?.value)} min={range?.min ?? 0} max={range?.max ?? 100} unit={unit} onCommit={(value) => void live.setKnob(knob, value)} />
          </Row>
        );
      })}
    </Group>
  );
}

export function AdvancedPane({ onAsk }: { onAsk: (ask: { token: string; previous: number }) => void }) {
  const { live, state } = useLive();
  const knobs = state.machine?.knobs ?? {};
  const boost = knobs.boost;
  const epp = knobs.epp;
  const overdrive = knobs["panel-overdrive"];
  return (
    <View style={{ flexDirection: "column", gap: 14 }}>
      <SectionTitle title="Undervolt" detail="The Curve Optimizer: an offset to every core's voltage curve." />
      <Undervolt onAsk={onAsk} />
      <SectionTitle title="Power limits" detail="Lower runs cooler and quieter, and slower in long tasks. The mode's recipe sets them again when the mode changes." />
      <KnobSliders list={LIMITS} />
      <SectionTitle title="Processor" />
      <Group>
        {boost && (
          <Row label="Boost clock" detail="Faster bursts, more heat.">
            <Segmented
              testID="boost"
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={boost.value === true ? "on" : "off"}
              onChange={(value) => void live.setKnob("boost", value === "on")}
            />
          </Row>
        )}
        {epp?.choices && (
          <Row label="Prefer" stack>
            <Segmented testID="epp" options={epp.choices.map((choice) => ({ value: choice, label: choice.replaceAll("_", " ") }))} value={String(epp.value)} onChange={(value) => void live.setKnob("epp", value)} />
          </Row>
        )}
      </Group>
      <SectionTitle title="Graphics card" />
      <KnobSliders list={GRAPHICS} />
      {overdrive && (
        <Group>
          <Row label="Panel overdrive" detail="Sharper motion on the screen.">
            <Segmented
              testID="overdrive"
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              value={overdrive.value === true ? "on" : "off"}
              onChange={(value) => void live.setKnob("panel-overdrive", value === "on")}
            />
          </Row>
        </Group>
      )}
    </View>
  );
}
