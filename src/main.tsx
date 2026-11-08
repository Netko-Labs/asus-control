/**
 * ASUS Control: fans, power, and lights for ASUS ROG and TUF laptops, on top
 * of Dashi's power modes and its hardware helper (dashi-hardware), lid lights included. In the
 * menu bar: a fan with the processor's temperature; a click opens the
 * popover, a right-click the modes; the popover's ⋯ and "Open ASUS
 * Control…" open the window. The power mode is Dashi's: on a Dashi that
 * tells applets (protocol 4), Automatic is one of the modes (modes.ts). In
 * Control Center (protocol 5): the lid light, the fans and the processor
 * (controls.ts).
 */

import { appearance, defineApplet, metalHost } from "@dashi/applet";
import { setAppearanceSource } from "@dashi/ui";
import { type NativeHostTransport, render, spawnNativeHost } from "@mirinjs/metal";
import { SystemBus } from "./bus.ts";
import { Hardware } from "./hardware.ts";
import { connectControls } from "./controls.ts";
import { Live } from "./live.ts";
import { automaticReachable, chosenMode, type ModeChoice, modeLabel, modeOptions } from "./modes.ts";
import { Slash } from "./slash.ts";
import { LiveContext } from "./ui/controls.tsx";
import { FAN } from "./ui/glyphs.ts";
import { AsusPopover, popoverSize } from "./ui/popover.tsx";
import { AsusWindow, WINDOW_SIZE } from "./ui/window.tsx";

const APP_ID = "dev.netko.asus-control";

const source = appearance();
setAppearanceSource({ subscribe: source.subscribe, isDark: source.isDark });

const bus = new SystemBus();
const live = new Live(new Hardware(bus), new Slash(bus));

let window: NativeHostTransport | null = null;

/** The popover's rows under the modes: the keyboard, the lid (with a Slash bar), the charge limit. */
function quickRows(): number {
  const state = live.getSnapshot();
  const knobs = state.machine?.knobs ?? {};
  const rows = [knobs["kbd-backlight"] !== undefined, state.slash !== null, knobs["charge-limit"] !== undefined].filter(Boolean).length;
  // Before the machine is known, room for all three.
  return state.machine ? rows : 3;
}

function openWindow(): void {
  if (window) return;
  const host = spawnNativeHost(metalHost(), { title: "ASUS Control", appId: APP_ID, width: WINDOW_SIZE.width, height: WINDOW_SIZE.height, titleBar: "unified" });
  const root = render(
    <LiveContext.Provider value={live}>
      <AsusWindow />
    </LiveContext.Provider>,
    host,
  );
  window = host;
  host.onClose(() => {
    root.unmount();
    window = null;
  });
}

interface ItemState {
  cpu: number | null;
  /** The choice the menu marks: Dashi's (Automatic included) or the platform profile's mode. */
  mode: ModeChoice | null;
  /** The mode Automatic runs now, while it is chosen. */
  running: ModeChoice | null;
  /** Automatic can be chosen from here (this Dashi tells applets its power mode). */
  automatic: boolean;
}

const applet = defineApplet<ItemState>({
  id: "asus-control",
  title: "ASUS Control",
  initial: { cpu: null, mode: null, running: null, automatic: false },
  glyph: FAN,
  label: (state) => (state.cpu === null ? undefined : `${state.cpu}°`),
  tooltip: (state) =>
    `ASUS Control${state.mode ? ` · ${modeLabel(state.mode)}${state.mode === "automatic" && state.running ? ` (${modeLabel(state.running)})` : ""}` : ""}`,
  menu: (state) => [
    ...modeOptions(undefined, null)
      .filter((each) => each.id !== "automatic" || state.automatic)
      .map((each) => ({ id: `mode:${each.id}`, label: each.label, checked: state.mode === each.id })),
    { type: "separator" as const },
    { id: "open", label: "Open ASUS Control…" },
  ],
  onSelect: (item, handle) => {
    if (item === "open") return openWindow();
    if (item.startsWith("mode:")) {
      void live.setMode(item.slice("mode:".length) as ModeChoice);
      handle.closePopover();
    }
  },
  popover: {
    // Read when the popover is asked for: a row less without a Slash bar.
    get width() {
      return popoverSize(quickRows()).width;
    },
    get height() {
      return popoverSize(quickRows()).height;
    },
    component: ({ close }) => (
      <LiveContext.Provider value={live}>
        <AsusPopover
          onOpenWindow={() => {
            close();
            openWindow();
          }}
        />
      </LiveContext.Provider>
    ),
  },
  start: (handle) => {
    live.start();
    // Dashi's power mode, when this Dashi tells applets (feature-detected: null on an older one).
    const stopPower = live.followPower(handle.client);
    const follow = (): void => {
      const state = live.getSnapshot();
      const cpu = state.readings.find((reading) => reading.id === "cpu")?.value ?? null;
      const profile = state.machine?.knobs["platform-profile"];
      const next: ItemState = {
        cpu,
        mode: chosenMode(profile, state.power),
        running: state.power?.mode ?? null,
        automatic: automaticReachable(state.power),
      };
      if (JSON.stringify(next) !== JSON.stringify(handle.state)) handle.set(next);
    };
    const stop = live.subscribe(follow);
    // Its tiles in Dashi's Control Center (protocol 5): the lid light, the fans, the processor.
    const stopControls = connectControls(live, handle.controls, () => handle.openPopover());
    return () => {
      stop();
      stopControls();
      stopPower();
      live.stop();
    };
  },
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    window?.close();
    applet.stop();
    process.exit(0);
  });
}
