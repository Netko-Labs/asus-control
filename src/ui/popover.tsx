/**
 * The popover under the menu bar item (dashiOS spec, ASUS Control A): one
 * column of the everyday controls, in the window's order, with a live line
 * (the processor's temperature, a fan), then "Open ASUS Control".
 */

import { Segmented, useColors } from "@dashi/ui";
import { Text, View } from "@mirinjs/metal";
import { MODES } from "../recipes.ts";
import { liveLine } from "../sensors.ts";
import { SLASH_MODES } from "../slash.ts";
import { useLive } from "./controls.tsx";

export const POPOVER_SIZE = { width: 300, height: 340 } as const;

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "column", gap: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "semibold", color: colors.textMuted }}>{label}</Text>
      {children}
    </View>
  );
}

const LEVEL_NAMES = ["Off", "Low", "Medium", "High"];

export function AsusPopover({ onOpenWindow }: { onOpenWindow: () => void }) {
  const colors = useColors();
  const { live, state } = useLive();
  const knobs = state.machine?.knobs ?? {};
  const mode = knobs["platform-profile"];
  const charge = knobs["charge-limit"];
  const keyboard = knobs["kbd-backlight"];
  const levels = state.machine?.lighting.keyboardLevels ?? keyboard?.max ?? null;
  return (
    <View
      testID="asus-popover"
      style={{
        flex: 1,
        flexDirection: "column",
        gap: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.launcher,
        borderWidth: 1,
        borderColor: colors.dockBorder,
      }}
    >
      <View style={{ flexDirection: "column", gap: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "bold", color: colors.text }}>ASUS Control</Text>
        <View testID="live-line">
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{state.problem ?? (liveLine(state.readings) || "Reading the sensors…")}</Text>
        </View>
      </View>
      {mode && (
        <Segmented
          testID="mode"
          options={MODES.filter((each) => mode.choices?.includes(each.id) ?? true).map((each) => ({ value: each.id, label: each.label }))}
          value={String(mode.value)}
          onChange={(value) => void live.setMode(value)}
        />
      )}
      {charge && (
        <Line label="Battery">
          <Segmented
            testID="charge"
            options={[
              { value: 80, label: "80%" },
              { value: 100, label: "100%" },
            ]}
            value={Number(charge.value) >= 100 ? 100 : 80}
            onChange={(value) => void live.setKnob("charge-limit", value)}
          />
        </Line>
      )}
      {(keyboard || state.slash) && (
        <Line label="Lights">
          {keyboard && levels !== null && (
            <Segmented
              testID="keyboard"
              options={Array.from({ length: levels + 1 }, (_, level) => ({ value: level, label: LEVEL_NAMES[level] ?? String(level) }))}
              value={Number(keyboard.value)}
              onChange={(value) => void live.setKnob("kbd-backlight", value)}
            />
          )}
          {state.slash && (
            <Segmented
              testID="lid"
              options={[
                { value: "off", label: "Lid off" },
                { value: "on", label: SLASH_MODES.find((each) => each.mode === state.slash?.mode)?.name ?? "Lid on" },
              ]}
              value={state.slash.enabled ? "on" : "off"}
              onChange={(value) => void live.withSlash((slash) => slash.setEnabled(value === "on"))}
            />
          )}
        </Line>
      )}
      <View style={{ marginTop: "auto", height: 1, backgroundColor: colors.separator }} />
      <View
        testID="open-window"
        onPress={onOpenWindow}
        style={{ height: 28, borderRadius: 6, paddingHorizontal: 8, justifyContent: "center", hoverBackgroundColor: colors.switcherSelection }}
      >
        <Text style={{ fontSize: 13, color: colors.text }}>Open ASUS Control…</Text>
      </View>
    </View>
  );
}
