/**
 * Lighting (dashiOS spec, ASUS Control F): the keyboard's level; the lid's
 * Slash bar drawn as it will play, its animation, brightness, speed and
 * when it shows. Both through dashi-hardware (kbd-backlight, Slash). With no
 * Slash bar, there is no lid section.
 */

import { Choices, Group, Note, Row, Segmented, Switch, useColors } from "@dashi/ui";
import { View } from "@mirinjs/metal";
import { useEffect, useState } from "react";
import { levelName } from "../dots.ts";
import { frameMs, modeName, SEGMENTS, SHOW_FLAGS, slashFrame } from "../slash.ts";
import { SectionTitle, SliderValue, useLive } from "./controls.tsx";

/** The bar as it will light: slanted segments, each as bright as the animation's frame says, scaled by the brightness. */
export function SlashPreview({ mode, interval, brightness, on }: { mode: string; interval: number; brightness: number; on: boolean }) {
  const colors = useColors();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setFrame((n) => n + 1), frameMs(interval));
    return () => clearInterval(timer);
  }, [interval, on]);
  const lights = on ? slashFrame(mode, frame) : Array.from({ length: SEGMENTS }, () => 0);
  return (
    <View testID="slash-preview" style={{ height: 96, borderRadius: 12, backgroundColor: "#1c1c1f", alignItems: "center", justifyContent: "center" }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-end" }}>
        {lights.map((light, at) => (
          <View
            key={at}
            style={{
              width: 14,
              height: 30,
              marginBottom: at * 5,
              borderRadius: 3,
              backgroundColor: "#ffffff",
              opacity: 0.08 + 0.92 * light * (0.25 + (0.75 * brightness) / 255),
            }}
          />
        ))}
      </View>
      {!on && <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, borderWidth: 1, borderColor: colors.separator }} />}
    </View>
  );
}

export function LightingPane() {
  const { live, state } = useLive();
  const slash = state.slash;
  const keyboard = state.machine?.knobs["kbd-backlight"];
  const levels = state.machine?.lighting.keyboardLevels ?? keyboard?.max ?? null;
  return (
    <View style={{ flexDirection: "column", gap: 14 }}>
      <SectionTitle title="Keyboard" />
      {keyboard && levels !== null ? (
        <Group>
          <Row label="Brightness" detail="Fn F4 changes it too.">
            <Segmented
              testID="kbd-level"
              options={Array.from({ length: levels + 1 }, (_, level) => ({ value: level, label: levelName(level) }))}
              value={Number(keyboard.value)}
              onChange={(value) => void live.setKnob("kbd-backlight", value)}
            />
          </Row>
        </Group>
      ) : (
        <Note>This keyboard has no light Dashi can set.</Note>
      )}
      {slash && (
        <>
          <SectionTitle title="Lid" detail="The Slash bar on the lid, as it will play." />
          <SlashPreview mode={slash.mode} interval={slash.interval} brightness={slash.brightness} on={slash.enabled} />
          <Group>
            <Row label="Lid lights">
              <Switch testID="slash-on" on={slash.enabled} onChange={(on) => void live.withSlash((each) => each.setEnabled(on))} />
            </Row>
            <Row label="Animation" stack>
              <Choices
                testID="slash-mode"
                options={slash.modes.map((mode) => ({ value: mode, label: modeName(mode) }))}
                value={slash.mode}
                onChange={(mode) => void live.withSlash((each) => each.setMode(mode))}
              />
            </Row>
            <Row label="Brightness">
              <SliderValue testID="slash-brightness" value={slash.brightness} min={0} max={255} onCommit={(value) => void live.withSlash((each) => each.setBrightness(value))} />
            </Row>
            <Row label="Speed" detail="Slower to the right.">
              <SliderValue testID="slash-interval" value={slash.interval} min={0} max={5} onCommit={(value) => void live.withSlash((each) => each.setInterval(value))} />
            </Row>
          </Group>
          <SectionTitle title="Shows" />
          <Group>
            {SHOW_FLAGS.map((flag) => (
              <Row key={flag.property} label={flag.label}>
                <Switch testID={`slash:${flag.property}`} on={slash.show[flag.property]} onChange={(on) => void live.withSlash((each) => each.setShow(flag.property, on))} />
              </Row>
            ))}
          </Group>
        </>
      )}
    </View>
  );
}
