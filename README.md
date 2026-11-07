# ASUS Control

A Dashi applet for ASUS ROG and TUF laptops: everything ROG Control Center
does, on top of Dashi's power modes instead of beside them. Named for what it
controls; it draws no ASUS or ROG marks.

- **In the menu bar**: a fan with the processor's temperature. A click opens
  the popover (the mode, the charge limit, the keyboard and lid lights, a live
  line with the temperature and a fan), a right-click the modes.
- **The window**, shaped like Settings: Power (the mode, and each mode's
  recipe plugged in and on battery, with Restore Defaults), Fans (8 points per
  fan you drag, with the live temperature on the curve), Battery (the charge
  limit), Lighting (the lid's Slash bar previewed as it will play, its
  animation, speed, brightness and when it shows; the keyboard's level),
  Sensors (temperatures, fans and the battery's draw, with an hour of
  history), Keys, and Advanced (the Curve Optimizer with a countdown that puts
  it back unless kept, the power limits, boost and the preference, the
  graphics card's limits, panel overdrive).

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
bun run pack                # dist/dev.netko.asus-control-<version>.dashi-applet
bun run publish             # the pull request to Netko-Labs/dashi-applets, prepared locally
```

The dependencies are by path, to sibling checkouts (`file:../dashiOS/packages/applet`,
`../dashiOS/packages/dashi-ui`, `../mirin/packages/mirin-metal`) until @dashi/applet
is published; the catalog's CI points them at its own checkouts when it rebuilds a
version. With `DASHI_HARDWARE_BUS=session`, dashi-hardware is looked for on the session
bus: a fake G14 (`dashi-hardware --sysfs-root data/fixtures/ga403wr serve` in dashiOS).

## To check on the machine

- The Slash animations (dashi-hardware's ids, ported from asusctl's rog-slash
  `SlashMode`): check each against the lid, and the preview's likeness of it.
- The keyboard light's "off after, on battery" waits for Dashi's power
  recipes to carry it (it isn't a dashi-hardware knob).

MIT licensed.
