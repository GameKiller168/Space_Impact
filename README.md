# Space Impact — development handoff

This repository is a work in progress toward a Nokia 3310 v6.39 Space Impact recreation. **It is not a playable Space Impact release yet.** The current `web/index.html` still launches the inherited Snake II game. Do not publish or tag it as Space Impact v1.0 until the game-specific engine and release checks are complete.

The firmware image is not included. Local analysis used the Nokia 3310 v6.39 PPM B flash supplied with the task. The actual Space Impact app is dispatcher ID 1 (`0x25a52a`); the previously investigated app ID 3/4 and `0x31adxx` images are a different game. Firmware instructions and the app's handler agree on `8`/`0` for vertical movement, `*`/`#` for horizontal movement, `1`/`3` for the main weapon and `4`/`6` for bonus weapons.

The repository contains a separate Space Impact shell, isolated storage, an input adapter, 84 extracted image descriptors, all eight raw level descriptors and 179 wave records, terrain compositing, four decoded sound scripts, and partial movement, weapon, wave and recovery models. Their verified scope and remaining work are described in [web/FIDELITY.md](web/FIDELITY.md), [web/SPACEIMPACT_AUDIO.md](web/SPACEIMPACT_AUDIO.md), [web/SPACEIMPACT_INTEGRATION.md](web/SPACEIMPACT_INTEGRATION.md), and [tools/README.md](tools/README.md).

The next work is to complete the firmware-derived game engine: interpret all wave types and boss behavior, collisions and bonus weapons, integrate the separate modules into the Space Impact page, implement complete snapshot restoration, and verify all eight levels, languages, sounds and vibration. The existing first-three-wave model intentionally stops at tick 92; it is not a full engine. The oracle models selected phone services and stops on unknown timer return codes rather than guessing.

Run the current automated checks with:

```sh
cd web
npm test
```

Many existing checks still validate the inherited Snake II implementation; passing them does not establish Space Impact completeness. The `tools/` scripts accept a local firmware path and can regenerate the Space Impact data and firmware trace fixtures without committing the dump.
