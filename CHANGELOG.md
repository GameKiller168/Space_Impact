# Changelog

## 0.2.0-beta.1

- New page: the look, the tactile keypad and the multi-touch input of the sister project Snake II; installable, works offline.
- Ordinary enemies move exactly as in the firmware: all 159 ordinary wave records of the eight levels match the original handler on every tick (spawn, random start height, all movement modes, the two mini-bosses). The firmware's two random generators are used.
- Enemies shoot by the firmware's rule (shot check per movement mode, divisor and ammunition from the wave record); 133 of 159 records match tick by tick including every random draw.
- A held fire key keeps firing; held keys survive a lost life.
- The phone shows the original game-over, top-score and won notes; labels of five languages and the instruction text of ten languages come from the firmware text tables.
- The Snake II engine, tests and fixtures were removed from the repository.

## 0.1.0

- First playable version: engine with firmware-verified wave schedule, ship, shots and contact; approximated enemy movement, shooting and bosses.
