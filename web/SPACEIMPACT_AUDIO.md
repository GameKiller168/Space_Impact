# Space Impact firmware audio evidence

The data in `js/spaceimpact-tones.js` is decoded from the supplied Nokia 3310 v6.39 PPM B flash. The game writes a sound event number to its record at offset 20; the common phone dispatcher plays the script only for a return code that requests sound and when game sounds are enabled. A change to the record field alone is not sufficient: firing directly after startup can write event `0x18` while returning `0x13`. Once the dispatcher requests sound, its event number can be passed to `audio.playGame(eventCode)`.

| Event | Game write | Tone-table entry | Script address | Observed game context |
| --- | --- | --- | --- | --- |
| `0x17` | `0x259dae`–`0x259db2` and `0x259e26`–`0x259e98` | `0x321f24` | `0x321bac` | collision-handling path, also calls vibration |
| `0x18` | `0x258084`–`0x258088` | `0x321f2c` | `0x321bc8` | main projectile path |
| `0x19` | `0x258022`–`0x258026` | `0x321f34` | `0x321bd4` | bonus-projectile path |
| `0x1a` | `0x257fe6`–`0x257fea` | `0x321f3c` | `0x321bf0` | alternate bonus-weapon path |

The shared tone table begins at `0x321e6c`, with 8-byte entries containing a script pointer. The interpreter at `0x2ca16c` reads a note byte followed by its tick length. Note `b` uses the big-endian frequency entry at `0x32afd0 + 2 * (b - 0x40)`. The common firmware tick conversion is 7.96875 ms. These four scripts contain direct note/length pairs and an end marker; no loop expansion is needed. `tools/extract_spaceimpact_tones.py` reads a local FLS and prints the original bytes, addresses and decoded values for independent comparison; the flash image is not required by the app or committed.

In the local firmware oracle, the sequence `0x24, 1, 1, 10` returns `0x1b` with sound event `0x18`; replacing the final `10` with `12` gives the same result, and replacing it with `13` or `15` returns `0x1b` with sound event `0x19`. Firing immediately after startup can instead return `0x13` while setting the event field, so an adapter must respect the dispatcher's return code rather than play every value found in that field.

The script defines pitch and length. Buzzer loudness and waveform are not established by those values. Further Space Impact sounds, event conditions and vibration durations have not all been identified, so this is not a complete audio reconstruction.

To use only these game sounds with the shared synthesizer, load `spaceimpact-tones.js` and create the synthesizer with `SnakeII.Audio.create({ settings: store, gameTones: SpaceImpact.Tones })`. Pass a confirmed numeric event code to `audio.playGame(code)`. The shared keypad DTMF table remains independent of the injected game scripts. Unknown game-event names are silent; Snake II game tones are not used as a fallback when this tone set is supplied.
