/**
 * The popover under the menu bar item (mockups, "ASUS Control, redesigned"):
 * no title row, since the item is the title. The header is the live line
 * (the processor's temperature, a fan, the package's watts) with ⋯ at the
 * right for the window; under it the last 30 minutes of temperature; the
 * modes as four tiles; then a row each for the keyboard, the lid's Slash bar
 * (only when there is one) and the charge limit.
 */

import { useColors } from "@dashi/ui";
import { Svg, Text, View } from "@mirinjs/metal";
import { liveLine } from "../sensors.ts";
import { useLive } from "./controls.tsx";
import { FAN, MORE } from "./glyphs.ts";
import { LiveNumbers, ModeTiles, QuickRows, TemperatureLine } from "./parts.tsx";

const WIDTH = 272;
const PAD = 8;
const ROW = 34;

/** The popover's size: three rows with a Slash bar, two without. */
export function popoverSize(rows: number): { width: number; height: number } {
  // padding, header 30, the line 22 with 4 above and 6 below, tiles 46, 6, the rows, padding.
  return { width: WIDTH, height: PAD + 30 + 4 + 22 + 6 + 46 + 6 + rows * ROW + PAD };
}

export const POPOVER_SIZE = popoverSize(3);

export function AsusPopover({ onOpenWindow }: { onOpenWindow: () => void }) {
  const colors = useColors();
  const { state } = useLive();
  const line = liveLine(state.readings);
  const quiet = state.problem ?? (line ? null : state.machine ? "No temperature or fan readings here" : "Reading the sensors…");
  return (
    <View
      testID="asus-popover"
      style={{
        flex: 1,
        flexDirection: "column",
        padding: PAD,
        borderRadius: 12,
        backgroundColor: colors.launcher,
        borderWidth: 1,
        borderColor: colors.dockBorder,
      }}
    >
      <View testID="live-line" accessibilityRole="status" accessibilityLabel={quiet ?? line} style={{ height: 30, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4 }}>
        <Svg markup={FAN} size={16} color={colors.textMuted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {quiet ? (
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
              {quiet}
            </Text>
          ) : (
            <LiveNumbers />
          )}
        </View>
        <View
          testID="open-window"
          focusable
          accessibilityRole="button"
          accessibilityLabel="Open ASUS Control…"
          onPress={onOpenWindow}
          style={{ width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center", hoverBackgroundColor: colors.button, focusRingColor: colors.focusRing }}
        >
          <Svg markup={MORE} size={16} color={colors.textMuted} />
        </View>
      </View>
      <View style={{ marginTop: 4, marginBottom: 6, paddingHorizontal: 4 }}>
        <TemperatureLine width={WIDTH - 2 - PAD * 2 - 8} height={22} />
      </View>
      <ModeTiles />
      <View style={{ height: 6, flexShrink: 0 }} />
      <QuickRows />
    </View>
  );
}
