# Changelog

## 0.2.0-beta.7

- **Key tone is on by default again**, now that the sound is a short click rather than a held beep (settings saved by earlier betas are reset to on once).
- **Softer clicks:** less high-frequency noise, a slightly slower 2 ms attack and a rounder low body.

## 0.2.0-beta.6

- **Key clicks modelled on a real keypad recording:** the click peaks within about 2 ms and is down to 10% in about 12 ms. Key down is a snap (body near 300 Hz, mid noise near 800 Hz, a little 3-4 kHz), key up a softer, lower thump near 225 Hz at about two thirds of the level; four down and three up variants with a little random pitch and level.

## 0.2.0-beta.5

- **Softer key clicks:** the key sounds were too sharp. They are now a low, rounded "thock" (lower pitch, longer body, much less hiss, soft attack); the release click is a lighter version of it.

## 0.2.0-beta.4

- **Link preview:** sharing the page now shows a proper 1200x630 card (title, ship and level 1 boss on the LCD green) instead of the small app icon.
- **Key tone is off by default.** Keys no longer hold a beep for as long as they are pressed, which was grating in a game where a key is held down constantly; settings saved with the old default are reset to off once.
- **Key sounds are clicks:** a snap when a key goes down and a lighter, higher one when it comes back up, with four down and three up variants and a little random pitch and level, so repeated presses sound like a real keypad. (The click sounds are an estimate, not firmware data.)

## 0.2.0-beta.3

- **Pictures:** the ship of level 1 and the bosses of levels 1, 5 and 6 are stored as negatives in the firmware and were drawn as boxes with a hole. They are drawn the right way round now, the ship has its own picture on level 1, and the app icon shows the real ship and the level 1 boss (reported with reference footage of the real game).
- **Bosses of levels 1 to 7 are exact:** entry, bounce off the terrain, the charge attacks, bullets and the special shots (homing, straight and wave missiles), all random draws, tick by tick against the firmware; boss hits score 5, the kill 100.
- The ship's flight at the end of a level is the firmware's (checked on seven levels); the terrain keeps scrolling on level 6 until its last empty waves are used up.
- Bullets made right behind their shooter in the display list wait one tick, as in the firmware (20 instead of 26 early stops in the enemy-fire comparison).
- The service worker revalidates requests, so a new release shows up at once.

## 0.2.0-beta.2

- Your shots hit by the firmware's rule: the first object whose box touches the shot takes one hit point; 5 points for a hit, 10 for a kill, none for an enemy bullet; the explosion shows the enemy's own picture first.
- Terrain contact decoded from the firmware (all eight levels; none on level 2), including the start shield pushing the ship away from the terrain and the upper-terrain movement limits.
- Pickups (reward rolls, flight and sound), the bonus weapon on keys 4 and 6 (ammunition, shared cooldown, targeting, damage), lives, respawn position and shield, ship sounds and vibration, with the ammunition shown next to the score.
- New fixtures and tools for all of these (`tools/spaceimpact_record_enemy_hits.py` and others), see `tools/README.md`.

## 0.2.0-beta.1

- New page: the look, the tactile keypad and the multi-touch input of the sister project Snake II; installable, works offline.
- Ordinary enemies move exactly as in the firmware: all 159 ordinary wave records of the eight levels match the original handler on every tick (spawn, random start height, all movement modes, the two mini-bosses). The firmware's two random generators are used.
- Enemies shoot by the firmware's rule (shot check per movement mode, divisor and ammunition from the wave record); 133 of 159 records match tick by tick including every random draw.
- A held fire key keeps firing; held keys survive a lost life.
- The phone shows the original game-over, top-score and won notes; labels of five languages and the instruction text of ten languages come from the firmware text tables.
- The Snake II engine, tests and fixtures were removed from the repository.

## 0.1.0

- First playable version: engine with firmware-verified wave schedule, ship, shots and contact; approximated enemy movement, shooting and bosses.
