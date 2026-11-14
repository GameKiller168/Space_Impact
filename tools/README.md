# Firmware analysis tools

These tools run parts of a user-supplied Nokia 3310 v6.39 PPM B flash image locally. The firmware image is not included. They require Python 3; the terrain verifier also runs Node.js. `armemu.py` is the ARM7TDMI analysis emulator from the Snake II reference project.

```sh
python3 tools/spaceimpact_oracle.py --flash /path/to/firmware.fls --messages 0x24,17,9,20,22,10,1
python3 tools/spaceimpact_generate_fixture.py --flash /path/to/firmware.fls
python3 tools/spaceimpact_generate_fire.py --flash /path/to/firmware.fls
python3 tools/spaceimpact_generate_levels.py --flash /path/to/firmware.fls
python3 tools/spaceimpact_generate_waves.py --flash /path/to/firmware.fls
python3 tools/spaceimpact_generate_life.py --flash /path/to/firmware.fls
python3 tools/extract_spaceimpact_assets.py /path/to/firmware.fls web/js/spaceimpact-assets.js
python3 tools/extract_spaceimpact_terrain.py /path/to/firmware.fls web/js/spaceimpact-terrain.js
python3 tools/extract_spaceimpact_tones.py /path/to/firmware.fls
python3 tools/verify_spaceimpact_terrain.py --firmware /path/to/firmware.fls --armemu tools/armemu.py
```

The `spaceimpact_generate_*` tools accept `--output` to choose a different output path. Their JSON fixtures identify the source firmware. The level generator follows the firmware startup pointer table and writes all eight 16-byte descriptors and 179 unmodified 12-byte wave records; unverified fields remain uninterpreted. The wave generator records observed screen-object positions and image pointers at the beginning of level 1. The movement generator records independent key sequences and their final ship positions. The life generator captures the first unsteered collision and recovery.

The game app handler is `0x25a52a`. The harness initializes the module's startup RAM from the firmware records at `0x2f30cc` through `0x2f31fb`, including the eight level pointers and the sprite descriptor table. It simulates allocation and the display-object list, and executes the original firmware instructions for the game. The complete phone OS, rendering, sound, vibration and every timing case are not modeled.

The system dispatcher maps the main timer to app message `1` and the secondary timer to message `0`. On initial start the record specifies a 100 ms main interval and a 3000 ms secondary interval. `FirmwareTimers` models dispatcher returns 1, 19, 27 and 33 and stops on an unhandled return code. Return 19 cancels and restarts both timers; return 27 can request a sound and continues the delivered timer. The first main tick and the recovery after the first life loss both return 19. When both timers fall due together, the harness delivers the secondary event first; actual event-queue ordering remains unverified. The selected wave snapshots have been compared under both orders.

The first three wave records have been observed to use bytes 0, 1, 2, 3, 5 and 6 as count, sprite type, horizontal spacing, speed, delay until the next wave, and starting y. Their remaining fields, later enemy behaviors, interactions and collisions remain to be determined. The initial wave trace does not establish whole-level accuracy.
