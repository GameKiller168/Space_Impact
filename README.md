# Space Impact — Nokia 3310 reconstruction (v0.1)

**v0.1 is playable** at https://gamekiller168.github.io/Space_Impact/ (the page is `web/`). It is a fan-made reconstruction built from data read out of the Nokia 3310 v6.39 firmware; it is **not** a verified copy and is **not** v1.0. Progress is saved in the browser's local storage.

What is verified against the firmware: the 100 ms tick, the wave schedule of all eight levels, first-wave positions and straight flight, ship movement and main shot, ship contact, explosion/respawn/shield, the scrolling terrain compositor, the class-to-sprite table and hit points from the wave records.

What is approximated (and only the first levels have been played carefully): enemy vertical movement, enemy fire rate and position, boss routines, points for classes never seen shot, pickup effect (+1 life up to 5, else +50), terrain deaths on levels 2-8 (pixel overlap of ship and terrain), the final boss's turrets (omitted), the level-end sequence's motion, and the bonus weapons (keys 4 and 6 do nothing). Later levels are not verified. See [web/FIDELITY.md](web/FIDELITY.md).

Keys: `8`/`0` up/down, `*`/`#` back/forward, `1`/`3` fire, `C` pause/menu.

This repository is a work in progress toward a Nokia 3310 v6.39 Space Impact recreation. Do not tag it as Space Impact v1.0 until the engine and release checks are complete.

The firmware image is not included. Local analysis used the Nokia 3310 v6.39 PPM B flash supplied with the task. The actual Space Impact app is dispatcher ID 1 (`0x25a52a`); the previously investigated app ID 3/4 and `0x31adxx` images are a different game. Firmware instructions and the app's handler agree on `8`/`0` for vertical movement, `*`/`#` for horizontal movement, `1`/`3` for the main weapon and `4`/`6` for bonus weapons.

The repository contains a separate Space Impact shell, isolated storage, an input adapter, 84 extracted image descriptors, all eight raw level descriptors and 179 wave records, terrain compositing, four decoded sound scripts, and partial movement, weapon, wave and recovery models. Their verified scope and remaining work are described in [web/FIDELITY.md](web/FIDELITY.md), [web/SPACEIMPACT_AUDIO.md](web/SPACEIMPACT_AUDIO.md), [web/SPACEIMPACT_INTEGRATION.md](web/SPACEIMPACT_INTEGRATION.md), and [tools/README.md](tools/README.md).

The next work is to complete the firmware-derived game engine: interpret all wave types and boss behavior, the remaining collision cases (ship contact with enemies is modeled and verified for level 1; see [web/FIDELITY.md](web/FIDELITY.md) for what is open, including pickups and terrain deaths) and bonus weapons, integrate the separate modules into the Space Impact page, implement complete snapshot restoration, and verify all eight levels, languages, sounds and vibration. The existing first-three-wave model intentionally stops at tick 92; it is not a full engine. The oracle models selected phone services and stops on unknown timer return codes rather than guessing.

Run the current automated checks with:

```sh
cd web
npm test
```

`npm test` pins the browser language to English (`web/tests/support/locale.js`), because the phone otherwise follows the host language and the label checks would fail on a non-English system.

Many existing checks still validate the inherited Snake II implementation; passing them does not establish Space Impact completeness. The `tools/` scripts accept a local firmware path and can regenerate the Space Impact data and firmware trace fixtures without committing the dump.
