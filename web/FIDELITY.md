# Space Impact fidelity ledger

Status: **work in progress**. The page runs the Space Impact engine (v0.2, see the last section for what is verified and what is estimated).

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

## Ship contact

`js/spaceimpact-contact.js` decides whether the ship is touched by another display object. It follows the player-contact routine whose entry is `0x259d30`; the message handler calls it once per tick, but not on every tick (it is skipped, for example, on the tick that restarts the timers after a life is lost). The module covers the object-contact decision only. Not modeled: what the firmware does after a hit or pickup; a state byte at `0x10a1f0` that skips the search when it equals `0x1e` (never seen in the recordings); and a second, terrain-related test in the same routine, `0x2e7036(G, ship id, ship y)`, which runs while the hit flag is clear and the level byte at `0x109ef0` is not 1, compares the ship's y with a terrain object and, when it returns non-zero, hits the ship. That function has not been decoded. It never fired in any recorded level-1 tick (including the runs pressed into the terrain layer), so deaths caused by terrain on other levels are an open gap.

Verified against the running firmware, with `tests/fixtures/spaceimpact-contact.json` (16 scripted level-1 runs, 1301 recorded ticks, 17 hits, two of them on a second life, ship moved up, down, left and right, firing, and pressed into the terrain layer; first-hit ticks 56 to 94 and a run of 199 ticks without a hit):

- The search for a touching object starts at the display-list entry *after the ship's own* (the start index is the ship-id variable at `0x10a208`). Entries drawn before the ship, such as the terrain layer, are never found; this is why pressing the ship into the terrain does not hurt on level 1.
- The first entry whose box touches the ship ends the search, even if its pixels then miss. Boxes are compared with inclusive edges, the ship's box as unsigned bytes and the other object's as signed bytes.
- A pixel test then runs on the overlap of the two bitmaps (vertical 8-pixel pages, least significant bit on top). The byte at `0x10a1ed` selects the rule: **2** counts a pixel where both bits are *clear*, **1** where both are *set*. The recordings only contain mode 2. Mode 1 is read from the code; with mode 1 the model would disagree with the firmware on 31 recorded ticks. This is the reason the firmware reports a hit about two ticks after the sprites' drawn edges first overlap.
- The enemy and shield classes, the ship and the ship's shots behave as the class bytes at `0x109f0e` (12 bytes per object) say: the enemy is class 5, the shield 8, the terrain layer 50, the ship's shot 1.

Read from the disassembly, **not** distinguished by any recording (the shield is listed before the ship and removes touching enemies first, and the ship's shots have set bits, so each of these rules is hidden by another): the guard word at `0x10a20a` (non-zero while the start-of-life shield exists) suppresses contact; classes 0, 1, 2, 8, 9, 10, `0x16` and `0x24` are never tested; class 4 needs only the box test; classes `0x11` and `0x21` are pickups rather than hits. Pickups have not been reached in any run.

Open: with mode 2 the firmware treats clear bits as the contact pixels. Whether that means the bitmaps are drawn inverted on the LCD, or contact really is decided on empty pixels, has not been compared with the renderer. Objects with a negative x (read as 254 and so on) reach bytes outside their bitmap in the firmware's pixel loop; the module raises `RangeError` instead of guessing.

## Controls established by firmware

The English PPM help text and the actual handler at `0x257e1c` agree: keys `8` and `0` move up and down, `*` and `#` move backward and forward, `1` or `3` fire the main weapon, and `4` or `6` fire bonus weapons. The browser's PC keyboard aliases are a separate interface choice. Key repeats and release behavior still require end-to-end verification.

## Release gates not met

- Replace the Snake II game engine and drawing code with Space Impact behavior and verified assets.
- Identify and validate all eight level scripts, terrain, enemy schedules, bosses, collisions, and transitions against the running firmware.
- Decode Space Impact sound sequences and vibration events.
- Integrate and verify saving, language strings, menus, input, and settings with the actual engine.
- Add Space Impact-specific oracle tests and run all eight levels through completion.
- Build, review, commit, push, and tag a release after those checks pass.

## Engine v0.2 (`spaceimpact-engine.js`, playable on the page)

Verified against the running firmware (tests in `web/tests`, fixtures recorded with the tools in `tools/`):

| What | Evidence |
| --- | --- |
| 100 ms tick; wave schedule of all eight levels (first wave 20 ticks after the level starts, then the record's delay byte) | `spaceimpact-schedule.json` |
| Ordinary enemies: every wave record of all eight levels (159 isolated records, ship parked at three heights) puts every enemy on the same pixel on every tick: spawn position, random start height, speed, all movement modes (straight, curve, small wave, rise, fall, dive, climb, stop-and-sweep, the two mini-bosses) and the removal at the left edge | `spaceimpact-enemies.json`, `spaceimpact-enemies.test.js` |
| The firmware's two random generators (wave heights; effects and firing) | `spaceimpact-random.js`, recorded draws |
| Enemy shooting: which tick runs the shot check for each movement mode, the divisor in wave record byte 7 against a draw, ammunition in byte 8 (bosses need none), shot start `x - 2`, `y + height / 2`, bullet speed 3. 133 of 159 records match tick by tick including every random draw | `spaceimpact-enemy-fire.json`, `spaceimpact-enemy-fire.test.js` |
| Ship movement and main shot; ship contact with enemies; explosion, respawn and shield | existing fixtures |
| Terrain compositing; class-to-sprite table; hit points from the wave records | existing fixtures |
| Texts: the labels and notes of the five PPM B languages and the instruction text of ten languages come from the firmware's text tables | `tools/spaceimpact_generate_texts.py` |

Known differences inside the shooting test (26 records stop early in `spaceimpact-enemy-fire.json`): a bullet that reaches the parked ship or its start shield, the ship object itself missing from the recording, and whether a mini-boss's bullet is moved on the tick it is made.

Approximated, not verified: boss routines (movement, attacks, hit points feedback, death), the level-end sequence, the final boss's turrets, points per class, pickup effect (+1 life up to 5, else +50), the shield's effect on touching enemies and bullets, terrain deaths on levels 2-8 (a decoded module is present, see `spaceimpact-terrain-contact.js`, but its recording is not yet part of the tests), bonus weapons (keys 4/6 do nothing). A held fire key keeps firing (the firmware accepts five repeat messages per press; the page then sends a fresh press); held keys survive a lost life.

Play-test (browser, 2026-11): menu, new game, movement, fire, death and respawn, game over note, pause/continue, reload restore and mobile layout work; a scripted invulnerable bot reaches level 8 without console errors. Sounds and vibration were not heard or felt in this test. Nothing here has been compared with a real phone.
