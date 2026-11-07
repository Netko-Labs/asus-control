# ASUS Control

A Dashi applet for ASUS ROG and TUF laptops: everything ROG Control Center
does, on top of Dashi's power modes instead of beside them. Named for what it
controls; it draws no ASUS or ROG marks.

- **In the menu bar**: a fan with the processor's temperature. A click opens
  the popover, a right-click the modes and "Open ASUS Control…".
- **The popover** (272 × 232; a row shorter without a Slash bar): no title
  row. The live line is its header (the processor's temperature, the fan,
  the package's watts) with **⋯** at the right for the window; under it the
  last 30 minutes of temperature; the modes as four tiles (Automatic, Quiet,
  Balanced, Turbo); then one row each for the keyboard (a dot per level: tap
  one for that level, the lowest again for off), the lid's Slash bar and its
  animation (on and off), and "Stop charging at 80%".
- **The window** (760 × 480): no sidebar; four tabs in the title bar's one
  row, beside the window's controls.
  - **Overview**: Now (the temperature and fan, what is drawing power, the
    last 30 minutes), Power mode (the modes, the recipe in effect in a line,
    "Change limits…" to Advanced), Fans (the curve in small with the fan on
    it, "Edit in Fans"), Lighting & battery (the popover's three rows); every
    sensor with its last hour under the boxes.
  - **Fans**: 8 points per fan you drag, with the live temperature on the
    curve; Apply and Restore.
  - **Lighting**: the keyboard's level; the lid's Slash bar previewed as it
    will play, its animation, brightness and speed, and when it shows (at
    startup, at shutdown, asleep, on battery, with the lid closed, when the
    battery is low).
  - **Advanced**: each mode's recipe plugged in and on battery (with Restore
    Defaults), the power limits now, the Curve Optimizer with a countdown
    that puts it back unless kept, boost and the energy preference, the
    graphics card's limits, panel overdrive, the charge limit to the
    percent, and what the laptop's keys do.

The old panes moved: Power to Overview (the mode) and Advanced (the
recipes), Battery and Keys to Advanced, Sensors to Overview (`src/tabs.ts`
maps each old name to its tab).

## How it reaches the hardware

Only through Dashi: dashi-hardware (`dev.dashi.Hardware1`, dashiOS
`docs/hardware.md`) for every knob, fan curve, the Curve Optimizer and the
lid's Slash bar (`Slash`, `SetSlash`), on the system bus through Dashi's
sandbox proxy, with `busctl`. It reads the sensors from `/sys/class/hwmon`
and `/sys/class/power_supply`, read-only. It writes no file outside its own
home. A machine without a Slash bar has no lid row.

`applet.json` asks for exactly that: `hardware.power`, `hardware.lighting`
(the keyboard and lid lights), `hardware.fans`, `hardware.tuning` (the last
two ask for the password once, dashi-hardware's `tune` action). No network,
no files, no notifications.

## Recipes

Each mode's recipe starts as the model's (dashi-hardware's Describe). Edits
are kept in this applet's home (`recipes.json`) and applied with one
`SetMany` when they change and whenever the mode or the cable does. When
Dashi's mode store takes edited recipes itself, this hands them over instead.

## Developing

```sh
bun install                 # @dashi/applet, @dashi/ui and @mirinjs/metal from the Dashi and mirin checkouts beside this one
bun test                    # the logic, and the popover and window on a stand-in G14
bun run dev                 # in the menu bar with a "dev" badge (in Dashi's VM: bun run dev -- --vm)
bun preview/main.tsx popover|overview|fans|lighting|advanced [--dark]
                            # the popover or a tab on a made-up G14 (no hardware), for screenshots
bun run pack                # dist/dev.netko.asus-control-<version>.dashi-applet
bun run publish             # the pull request to Netko-Labs/dashi-applets, prepared locally
```

The dependencies are by path, to sibling checkouts (`file:../dashiOS/packages/applet`,
`../dashiOS/packages/dashi-ui`, `../mirin/packages/mirin-metal`) until @dashi/applet
is published; the catalog's CI points them at its own checkouts when it rebuilds a
version. With `DASHI_HARDWARE_BUS=session`, dashi-hardware is looked for on the session
bus: a fake G14 (`dashi-hardware --sysfs-root data/fixtures/ga403wr serve` in dashiOS).

## Automatic

Automatic is Dashi's own choice (Control Center and Settings keep it in
Dashi's settings), and nothing an applet can reach chooses it or says it is
chosen yet: dashi-hardware sets the platform profile, which Dashi's mode
store takes as a pick of that mode. So the tile is shown and can't be
pressed, the window's mode control lists the three modes, and a mode picked
here while Dashi is on Automatic holds until the cable changes, as Fn F5
does. `AUTOMATIC_REACHABLE` in `src/modes.ts` turns it on once Dashi offers
applets a way.

## To check on the machine

- The Slash animations (dashi-hardware's ids, ported from asusctl's rog-slash
  `SlashMode`): check each against the lid, and the preview's likeness of it.
- The live numbers sit in boxes of their own width so the line holds
  still: Metal's text has no tabular figures yet.
- The package's watts come from amdgpu's `power1_average` (the APU's
  package power); on an Intel machine the line shows the battery's draw.
- The keyboard light's "off after, on battery" waits for Dashi's power
  recipes to carry it (it isn't a dashi-hardware knob).

MIT licensed.
