/**
 * The pieces the popover and the window's Overview share: the live numbers,
 * the temperature line, the modes as tiles, the keyboard's dots, and the
 * three quick rows (keyboard, lid, charge limit). App-local: @dashi/ui has
 * no tile row or dot control, and only this applet uses them.
 */

import { DISABLED_OPACITY, Switch, useColors, useSurface } from "@dashi/ui";
import { Svg, Text, View } from "@mirinjs/metal";
import type { ReactNode } from "react";
import { dotLevel, levelName, litDots } from "../dots.ts";
import { type ModeChoice, chosenMode, modeOptions } from "../modes.ts";
import { downsample, formatWhole, liveNumbers, recent, sparkline } from "../sensors.ts";
import { modeName } from "../slash.ts";
import { useLive } from "./controls.tsx";
import { BATTERY, KEYBOARD, LID, MODE_GLYPHS } from "./glyphs.ts";

/** A number in a box of its own width, right-aligned, so the line doesn't shift as it changes (Metal's text has no tabular figures). */
function Figure({ text, width, size, bold }: { text: string; width: number; size: number; bold?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ width, flexShrink: 0, alignItems: "flex-end" }}>
      <Text numberOfLines={1} style={{ fontSize: size, fontWeight: bold ? "semibold" : "normal", color: colors.text }}>
        {text}
      </Text>
    </View>
  );
}

function Words({ text, size }: { text: string; size: number }) {
  const colors = useColors();
  return <Text style={{ fontSize: size, color: colors.textMuted }}>{text}</Text>;
}

/** "62° CPU · 2,900 rpm · 38 W", the numbers semibold and steady; what is known only. */
export function LiveNumbers({ size = 13 }: { size?: number }) {
  const { state } = useLive();
  const { celsius, rpm, watts } = liveNumbers(state.readings);
  const scale = size / 13;
  const parts: ReactNode[] = [];
  const dot = (key: string) => <Words key={key} text="·" size={size} />;
  if (celsius !== null) parts.push(<Figure key="c" text={`${celsius}°`} width={Math.round(28 * scale)} size={size} bold />, <Words key="cw" text="CPU" size={size} />);
  if (rpm !== null) {
    if (parts.length) parts.push(dot("d1"));
    parts.push(<Figure key="r" text={formatWhole(rpm)} width={Math.round(36 * scale)} size={size} bold />, <Words key="rw" text="rpm" size={size} />);
  }
  if (watts !== null) {
    if (parts.length) parts.push(dot("d2"));
    parts.push(<Figure key="w" text={formatWhole(watts)} width={Math.round(18 * scale)} size={size} bold />, <Words key="ww" text="W" size={size} />);
  }
  return (
    <View testID="live-numbers" style={{ flexDirection: "row", alignItems: "center", gap: Math.round(4 * scale), minWidth: 0 }}>
      {parts}
    </View>
  );
}

/** The processor's temperature over the last `minutes`, in the accent: the one thing a glance at a number can't give. */
export function TemperatureLine({ width, height, minutes = 30, strokeWidth = 1.5 }: { width: number; height: number; minutes?: number; strokeWidth?: number }) {
  const colors = useColors();
  const { live } = useLive();
  // A point every 4 px or so: the samples are whole degrees, and averaging them draws the trend, not the rounding.
  const path = sparkline(downsample(recent(live.history.of("cpu"), minutes), Math.max(2, Math.round(width / 4))), width, height, { minSpan: 8, inset: strokeWidth });
  return (
    <View testID="temperature-line" style={{ width, height, flexShrink: 0 }}>
      {path && (
        <Svg
          markup={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/></svg>`}
          width={width}
          height={height}
          color={colors.selection}
        />
      )}
    </View>
  );
}

/**
 * The modes as four tiles in a row; the one chosen filled with the accent, its glyph and label white.
 * On a Dashi that tells applets its power mode, the choice is Dashi's: Automatic is pressable, and
 * filled while it is on (modes.ts).
 */
export function ModeTiles() {
  const colors = useColors();
  const { live, state } = useLive();
  const profile = state.machine?.knobs["platform-profile"];
  if (!profile && !state.power) return null;
  const chosen = chosenMode(profile, state.power);
  const choose = (choice: ModeChoice): void => void live.setMode(choice);
  return (
    <View testID="modes" focusGroup accessibilityRole="group" accessibilityLabel="Power mode" style={{ flexDirection: "row", gap: 4, flexShrink: 0 }}>
      {modeOptions(profile, state.power).map((option) => {
        const on = option.id === chosen;
        const ink = on ? "#ffffff" : colors.text;
        return (
          <View
            key={option.id}
            testID={`mode:${option.id}`}
            focusable={option.enabled}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on, disabled: !option.enabled }}
            {...(option.enabled ? { onPress: () => choose(option.id) } : {})}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 7,
              gap: 3,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.selection : colors.button,
              hoverBackgroundColor: !option.enabled ? undefined : on ? colors.selectionHover : colors.pressed,
              opacity: option.enabled ? 1 : DISABLED_OPACITY,
              focusRingColor: colors.focusRing,
            }}
          >
            <Svg markup={MODE_GLYPHS[option.id] ?? ""} size={16} color={ink} />
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: on ? "semibold" : "normal", textAlign: "center", color: on ? "#ffffff" : colors.textMuted }}>
              {option.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** One dot per level: tap a dot for that level; tapping the lowest while it alone is lit turns the light off. */
export function KeyboardDots({ level, levels, onChange }: { level: number; levels: number; onChange: (level: number) => void }) {
  const colors = useColors();
  return (
    <View testID="keyboard" focusGroup accessibilityRole="group" accessibilityLabel={`Keyboard light, ${levelName(level)}`} style={{ flexDirection: "row", gap: 2 }}>
      {litDots(level, levels).map((lit, at) => (
        <View
          key={at}
          testID={`keyboard:${at + 1}`}
          focusable
          accessibilityRole="button"
          accessibilityLabel={levelName(dotLevel(at + 1, level))}
          onPress={() => {
            const next = dotLevel(at + 1, level);
            if (next !== level) onChange(next);
          }}
          // A 22 × 22 target around an 18 × 8 dot.
          style={{ width: 22, height: 22, borderRadius: 5, alignItems: "center", justifyContent: "center", hoverBackgroundColor: colors.button, focusRingColor: colors.focusRing }}
        >
          <View style={{ width: 18, height: 8, borderRadius: 4, backgroundColor: lit ? colors.selection : colors.track }} />
        </View>
      ))}
    </View>
  );
}

function QuickRow({ glyph, label, detail, children, inset = 4 }: { glyph?: string; label: string; detail?: string; children: ReactNode; inset?: number }) {
  const colors = useColors();
  return (
    <View style={{ height: 34, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: inset }}>
      {glyph && <Svg markup={glyph} size={16} color={colors.textMuted} />}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 }}>
        <View style={{ flexShrink: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text }}>
            {label}
          </Text>
        </View>
        {detail ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>{`· ${detail}`}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** The charge limit the switch stops at when turned on. */
export const CHARGE_STOP = 80;

/** The keyboard, the lid's Slash bar (only when there is one), and the charge limit: a row each, the control at the right. */
export function QuickRows({ glyphs = true, inset }: { glyphs?: boolean; inset?: number }) {
  const { live, state } = useLive();
  const knobs = state.machine?.knobs ?? {};
  const keyboard = knobs["kbd-backlight"];
  const charge = knobs["charge-limit"];
  const levels = state.machine?.lighting.keyboardLevels ?? keyboard?.max ?? null;
  const limit = Number(charge?.value ?? 100);
  const stopping = limit < 100;
  const g = (glyph: string): string | undefined => (glyphs ? glyph : undefined);
  return (
    <View style={{ flexDirection: "column", flexShrink: 0 }}>
      {keyboard && levels !== null && (
        <QuickRow glyph={g(KEYBOARD)} label="Keyboard" {...(inset === undefined ? {} : { inset })}>
          <KeyboardDots level={Number(keyboard.value)} levels={levels} onChange={(level) => void live.setKnob("kbd-backlight", level)} />
        </QuickRow>
      )}
      {state.slash && (
        <QuickRow glyph={g(LID)} label="Lid" detail={modeName(state.slash.mode)} {...(inset === undefined ? {} : { inset })}>
          <Switch testID="lid" on={state.slash.enabled} onChange={(on) => void live.withSlash((slash) => slash.setEnabled(on))} />
        </QuickRow>
      )}
      {charge && (
        <QuickRow glyph={g(BATTERY)} label={`Stop charging at ${stopping ? limit : CHARGE_STOP}%`} {...(inset === undefined ? {} : { inset })}>
          <Switch testID="charge" on={stopping} onChange={(on) => void live.setKnob("charge-limit", on ? CHARGE_STOP : 100)} />
        </QuickRow>
      )}
    </View>
  );
}

/** A box on the Overview: a card with a small heading. */
export function Box({ title, testID, children }: { title: string; testID: string; children: ReactNode }) {
  const colors = useColors();
  const surface = useSurface();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "column", gap: 6, padding: 12, borderRadius: 10, backgroundColor: surface.card, borderWidth: 1, borderColor: colors.separator, minWidth: 0 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "semibold", color: colors.textMuted }}>{title}</Text>
      {children}
    </View>
  );
}

/** Words that go somewhere in the window, in the accent's ink (a link, not a button). */
export function Link({ label, testID, onPress }: { label: string; testID: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <View testID={testID} focusable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={{ flexShrink: 0, borderRadius: 4, focusRingColor: colors.focusRing }}>
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.accentInk }}>
        {label}
      </Text>
    </View>
  );
}
