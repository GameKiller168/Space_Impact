# Space Impact fidelity ledger

Status: **work in progress; not a v1.0 release**. The current page still uses the Snake II engine. The existing Snake II tests do not validate Space Impact behavior.

## Evidence source

The local reference is Nokia 3310 firmware v6.39, PPM B. The flash dump and analysis scripts stay outside the repository.

## Corrected game identification

The app dispatcher at `0x2dbd2a` routes app ID 1 to `0x25a52a`, the Space Impact wrapper. Its initialization starts at `0x257b48` and its message handler is at `0x25a200`. The handler contains a completion branch after level index 7.

Earlier investigation incorrectly attributed app ID 3/4, wrapper `0x2da004`, and the `0x31adxx` sprite tables to Space Impact. Those observations concern another game, apparently Pairs II, and cannot establish Space Impact assets, rules, or controls.

## Graphics and movement

`js/spaceimpact-assets.js` contains the 84 descriptors from `0x312dcc` through `0x3131b0`, decoded as vertical, least-significant-bit-first pixel pages. The dump itself is not included. These images include the heart, player ship and large enemy images. Their placement and animation throughout all levels are not yet verified.

A local ARM oracle executes the Space Impact handler with simulated allocation and display-list services. At startup it observes the ship at `(5, 20)` and a 100 ms tick. In the initial terrain mode, the one-pixel movement limits are x = 1–73 and y = 6–41; repeated-key messages request a two-pixel move only when the full step fits. `js/spaceimpact-controls.js` implements this observed movement with caller-supplied terrain bounds, and `tests/fixtures/spaceimpact-movement.json` records 17 independent firmware traces. The oracle does not yet model all external timers or a complete level.

`js/spaceimpact-terrain.js` reconstructs the eight 512-column terrain maps. Its 84 × 16-pixel output was compared with the firmware's compositor at every scroll position for every level, including a second pass in shuffled order with a prefilled output buffer. The layer starts at y=32 on levels 1–4 and 7–8, and at y=0 on levels 5–6. The terrain image alone does not implement scrolling, obstacles, collisions or level progression.

`js/spaceimpact-weapons.js` models initial main-shot creation, its two-tick cooldown and horizontal movement. The short traces in `tests/fixtures/spaceimpact-fire.json` come from the running firmware. Collisions, changes of weapon type and the bonus weapon are not implemented there.

`js/spaceimpact-levels.js` preserves all eight level descriptors and their 179 raw wave records. The meaning of most record fields and enemy behavior is still unverified. The first three level-one enemy waves have a separate model and firmware trace through tick 92. It covers spawning, movement, frame changes and leaving the display; collision behavior and later wave types are outside that model. A separate trace records the first unsteered collision and recovery. The PPM B tone scripts for events `0x17`–`0x1a` have been decoded into `js/spaceimpact-tones.js`; their evidence and remaining audio gaps are documented in `SPACEIMPACT_AUDIO.md`.

## Controls established by firmware

The English PPM help text and the actual handler at `0x257e1c` agree: keys `8` and `0` move up and down, `*` and `#` move backward and forward, `1` or `3` fire the main weapon, and `4` or `6` fire bonus weapons. The browser's PC keyboard aliases are a separate interface choice. Key repeats and release behavior still require end-to-end verification.

## Release gates not met

- Replace the Snake II game engine and drawing code with Space Impact behavior and verified assets.
- Identify and validate all eight level scripts, terrain, enemy schedules, bosses, collisions, and transitions against the running firmware.
- Decode Space Impact sound sequences and vibration events.
- Integrate and verify saving, language strings, menus, input, and settings with the actual engine.
- Add Space Impact-specific oracle tests and run all eight levels through completion.
- Build, review, commit, push, and tag a release after those checks pass.
