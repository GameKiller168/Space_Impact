# Space Impact

A fan-made recreation of the Nokia 3310 game **Space Impact** in the browser, rebuilt from data read out of the phone's own firmware (v6.39, PPM B).

**[▶ Play v0.2 beta](https://gamekiller168.github.io/Space_Impact/)** · [What is verified](web/FIDELITY.md) · [Changelog](CHANGELOG.md)

> **Beta.** The ordinary enemies, their shots, the waves, the ship, the terrain and the texts follow the firmware and are checked against it by tests. The bosses, the level ends, the points, the pickups, terrain deaths and the bonus weapons (keys 4 and 6) are still estimates; an honest list is in [web/FIDELITY.md](web/FIDELITY.md). It is **not** a verified copy and not v1.0.

## Play

The page is a phone: display, function keys and keypad (the look of the sister project [Snake II](https://github.com/GameKiller168/Snake_II)). It works on touch screens (several fingers at once, sliding between keys), with the keyboard, and offline once loaded (installable as an app). The game, the settings and the top score are saved in the browser.

| | Phone key | Keyboard |
| --- | --- | --- |
| Up / down | `8` / `0` | arrow keys or W / S |
| Back / forward | `*` / `#` | arrow keys or A / D |
| Main weapon (hold it to keep firing) | `1` or `3` | Space |
| Bonus weapons (not yet implemented) | `4` or `6` | Shift |
| Pause, back | `C` | Backspace, Escape or C |
| Scroll, select | scroll keys, middle key | up / down, Enter |

## What is in the repository

- `web/` is the page: plain HTML, CSS and JavaScript, no build step, no dependencies. `cd web && npm test` runs the tests (Node 22).
- `tools/` are the Python tools that run the original handler of the game in an ARM7 emulator and record fixtures. They need a Nokia 3310 v6.39 PPM B flash image, which is **not included**; see [tools/README.md](tools/README.md).
- [web/FIDELITY.md](web/FIDELITY.md) says, for every part of the game, whether it was read from the firmware (and how it is tested) or estimated.

## Deployment

Every push to `main` publishes `web/` to GitHub Pages (`.github/workflows/pages.yml`).

The game belongs to Nokia; this is an unofficial fan project without any connection to Nokia or HMD.
