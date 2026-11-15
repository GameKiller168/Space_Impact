/* Pickup rewards at 0x2592b0. RNG values are supplied by the caller so the
 * reward rules can be replayed independently of the game's random stream.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var Tones = ns.Tones || (typeof require === 'function' ? require('./spaceimpact-tones.js') : null);
  function signedByte(value) { value &= 255; return value < 128 ? value : value - 256; }
  function apply(state, cls, random) {
    var lives = state.lives, type = state.type, ammo = state.ammo, event = 0, roll;
    if (cls === 33) ammo = signedByte(ammo + 3);
    else if (cls === 17) {
      event = 31;
      do { roll = random() & 3; } while (roll === 0 && lives >= 5);
      if (roll === 0) lives++;
      else {
        var nextType = roll === 1 ? 10 : (roll === 2 ? 9 : 22);
        var amount = roll === 3 ? 1 : 3;
        ammo = signedByte(type === nextType ? ammo + amount : amount);
        type = nextType;
      }
    }
    return { lives: lives, type: type, ammo: ammo, event: event };
  }
  // Event 0x1f's single-note script at 0x321cbc, decoded with the pickup fixture.
  if (Tones) Tones.GAME[31] = { code: 0x1f, segments: [[2637, 1]] };
  ns.Pickups = { apply: apply };
  if (typeof module === 'object' && module.exports) module.exports = ns.Pickups;
})(typeof globalThis !== 'undefined' ? globalThis : this);
