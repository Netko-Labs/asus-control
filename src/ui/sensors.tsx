/**
 * Sensors: each temperature, fan, and the battery's draw now, with the last
 * hour drawn beside it (while ASUS Control runs). Keys: what the laptop's
 * own keys do in Dashi.
 */

import { Group, Note, Row, useColors } from "@dashi/ui";
import { Svg, Text, View } from "@mirinjs/metal";
import { formatWhole, sparkline } from "../sensors.ts";
import { SectionTitle, useLive } from "./controls.tsx";

const SPARK = { width: 160, height: 24 };

export function SensorsPane() {
  const colors = useColors();
  const { live, state } = useLive();
  if (state.readings.length === 0) return <Note>No sensors can be read here.</Note>;
  return (
    <Group testID="sensors">
      {state.readings.map((reading) => {
        const path = sparkline(live.history.of(reading.id), SPARK.width, SPARK.height);
        return (
          <Row key={reading.id} label={reading.label}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {path && (
                <Svg
                  markup={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPARK.width} ${SPARK.height}"><path d="${path}" fill="none" stroke="${colors.selection}" stroke-width="1.5"/></svg>`}
                  width={SPARK.width}
                  height={SPARK.height}
                />
              )}
              <View style={{ width: 72, alignItems: "flex-end" }}>
                <Text style={{ fontSize: 13, color: colors.text }}>{`${reading.unit === "rpm" ? formatWhole(reading.value) : reading.value} ${reading.unit}`}</Text>
              </View>
            </View>
          </Row>
        );
      })}
    </Group>
  );
}

/** What each key Dashi knows is for (dashi-hardware's Describe names the keys; the shell's keymap acts on them). */
const KEY_WORDS: Readonly<Record<string, { key: string; does: string }>> = {
  mode: { key: "Fn F5", does: "Changes the power mode: Quiet, Balanced, Turbo" },
  lighting: { key: "Fn F4", does: "Steps the keyboard light" },
  rog: { key: "The ROG key", does: "What Dashi's keyboard settings give it" },
  micMute: { key: "Fn F9", does: "Turns the microphone off and on" },
};

export function KeysSection() {
  const { state } = useLive();
  const keys = Object.keys(state.machine?.hotkeys ?? {}).filter((name) => name in KEY_WORDS);
  if (keys.length === 0) return <Note>dashi-hardware knows no special keys on this machine.</Note>;
  return (
    <View style={{ flexDirection: "column", gap: 12 }}>
      <SectionTitle title="Keys" detail="The laptop's own keys, with Dashi's on-screen display." />
      <Group testID="keys">
        {keys.map((name) => (
          <Row key={name} label={KEY_WORDS[name]?.key ?? name} detail={KEY_WORDS[name]?.does} />
        ))}
      </Group>
    </View>
  );
}
