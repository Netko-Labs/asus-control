/**
 * ASUS Control: fans, power, and lights for ASUS ROG and TUF laptops, on top
 * of Dashi's power modes and its hardware helper (dashi-hardware), lid lights included. In the
 * menu bar: a fan with the processor's temperature; a click opens the
 * popover, a right-click the modes; "Open ASUS Control" opens the window.
 */

import { appearance, defineApplet, metalHost } from "@dashi/applet";
import { setAppearanceSource } from "@dashi/ui";
import { type NativeHostTransport, render, spawnNativeHost } from "@mirinjs/metal";
import { SystemBus } from "./bus.ts";
import { Hardware } from "./hardware.ts";
import { Live } from "./live.ts";
import { MODES } from "./recipes.ts";
import { Slash } from "./slash.ts";
import { LiveContext } from "./ui/controls.tsx";
import { FAN } from "./ui/glyphs.ts";
import { AsusPopover, POPOVER_SIZE } from "./ui/popover.tsx";
import { AsusWindow, WINDOW_SIZE } from "./ui/window.tsx";

const APP_ID = "dev.netko.asus-control";

const source = appearance();
setAppearanceSource({ subscribe: source.subscribe, isDark: source.isDark });

const bus = new SystemBus();
const live = new Live(new Hardware(bus), new Slash(bus));

let window: NativeHostTransport | null = null;

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
  mode: string | null;
}

const applet = defineApplet<ItemState>({
  id: "asus-control",
  title: "ASUS Control",
  initial: { cpu: null, mode: null },
  glyph: FAN,
  label: (state) => (state.cpu === null ? undefined : `${state.cpu}°`),
  tooltip: (state) => `ASUS Control${state.mode ? ` · ${MODES.find((each) => each.id === state.mode)?.label ?? state.mode}` : ""}`,
  menu: (state) => [
    ...MODES.map((each) => ({ id: `mode:${each.id}`, label: each.label, checked: state.mode === each.id })),
    { type: "separator" as const },
    { id: "open", label: "Open ASUS Control…" },
  ],
  onSelect: (item, handle) => {
    if (item === "open") return openWindow();
    if (item.startsWith("mode:")) {
      void live.setMode(item.slice("mode:".length));
      handle.closePopover();
    }
  },
  popover: {
    ...POPOVER_SIZE,
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
    const follow = (): void => {
      const state = live.getSnapshot();
      const cpu = state.readings.find((reading) => reading.id === "cpu")?.value ?? null;
      const mode = state.machine?.knobs["platform-profile"]?.value;
      const next = { cpu, mode: typeof mode === "string" ? mode : null };
      if (next.cpu !== handle.state.cpu || next.mode !== handle.state.mode) handle.set(next);
    };
    const stop = live.subscribe(follow);
    return () => {
      stop();
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
