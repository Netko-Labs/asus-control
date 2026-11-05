/**
 * Power: the mode, and each mode's recipe (plugged in and on battery) as
 * sliders inside each knob's real range, with Restore Defaults. Battery:
 * the charge limit.
 */

import { Button, Group, Note, Row, Segmented, useColors } from "@dashi/ui";
import { Text, View } from "@mirinjs/metal";
import { useState } from "react";
import { type Column, edit, effective, MODES, RECIPE_KNOBS, restoreDefaults } from "../recipes.ts";
import { SectionTitle, SliderValue, useLive } from "./controls.tsx";

export function PowerPane() {
  const colors = useColors();
  const { live, state } = useLive();
  const machine = state.machine;
  const current = machine?.knobs["platform-profile"];
  const [editing, setEditing] = useState<string>(String(current?.value ?? "balanced"));
  const [column, setColumn] = useState<Column>("plugged");
  if (!machine || !current) return <Note>{state.problem ?? "dashi-hardware doesn't report a power mode on this machine."}</Note>;
  const recipe = effective(editing, column, machine.recipes, state.edits, machine.knobs);
  const editable = RECIPE_KNOBS.filter(({ knob }) => knob in machine.knobs);
  const change = (knob: string, value: number | string | boolean): void => live.saveEdits(edit(state.edits, editing, column, knob, value, machine.recipes));
  return (
    <View style={{ flexDirection: "column", gap: 16 }}>
      <Group>
        <Row label="Mode" detail="Fn F5 and the menu bar change it too; they never disagree.">
          <Segmented
            testID="power-mode"
            options={MODES.filter((each) => current.choices?.includes(each.id) ?? true).map((each) => ({ value: each.id, label: each.label }))}
            value={String(current.value)}
            onChange={(value) => void live.setMode(value)}
          />
        </Row>
      </Group>
      <SectionTitle title="Recipes" detail="What each mode sets. Ranges are the firmware's; each mode has a column for the battery." />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Segmented testID="recipe-mode" options={MODES.map((each) => ({ value: each.id, label: each.label }))} value={editing} onChange={setEditing} />
        <Segmented
          testID="recipe-column"
          options={[
            { value: "plugged", label: "Plugged in" },
            { value: "battery", label: "On battery" },
          ]}
          value={column}
          onChange={setColumn}
        />
      </View>
      <Group testID="recipe">
        {editable.map(({ knob, label, unit }) => {
          const range = machine.knobs[knob];
          const value = recipe[knob] ?? range?.value;
          if (!range) return null;
          if (typeof range.value === "boolean")
            return (
              <Row key={knob} label={label}>
                <Segmented
                  testID={`recipe:${knob}`}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  value={value === true ? "on" : "off"}
                  onChange={(next) => change(knob, next === "on")}
                />
              </Row>
            );
          if (range.choices)
            return (
              <Row key={knob} label={label}>
                <Segmented
                  testID={`recipe:${knob}`}
                  options={range.choices.map((choice) => ({ value: choice, label: choice.replaceAll("_", " ") }))}
                  value={String(value)}
                  onChange={(next) => change(knob, next)}
                />
              </Row>
            );
          return (
            <Row key={knob} label={label}>
              <SliderValue testID={`recipe:${knob}`} value={Number(value)} min={range.min ?? 0} max={range.max ?? 100} unit={unit ?? range.unit} onCommit={(next) => change(knob, next)} />
            </Row>
          );
        })}
      </Group>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{state.edits[editing] ? "Edited" : "The model's defaults"}</Text>
        <Button label="Restore Defaults" testID="restore" onPress={() => live.saveEdits(restoreDefaults(state.edits, editing))} disabled={!state.edits[editing]} />
      </View>
    </View>
  );
}

export function BatteryPane() {
  const { live, state } = useLive();
  const charge = state.machine?.knobs["charge-limit"];
  if (!charge) return <Note>This machine has no charge limit.</Note>;
  return (
    <Group>
      <Row label="Charge limit" detail="Stopping short of full keeps the battery healthy when it is plugged in most of the time.">
        <SliderValue testID="charge-limit" value={Number(charge.value)} min={charge.min ?? 20} max={charge.max ?? 100} step={5} unit="%" onCommit={(value) => void live.setKnob("charge-limit", value)} />
      </Row>
    </Group>
  );
}
