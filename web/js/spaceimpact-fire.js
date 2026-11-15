/* Shots of ordinary enemies, Nokia 3310 v6.39 PPM B.
 *
 * check() is the routine at 0x25865a: the wave's divisor (wave record byte 7, kept in the object at +7) is tested against a
 * draw of the firmware's effects generator; no divisor, or 0x7f, never shoots. shoot() is 0x2586b2: a shot needs ammunition
 * (wave record byte 8, at +4) unless the shooter is a boss, appears two pixels in front of the enemy (x - 2) at half its height
 * and uses one round. Which ticks run the check depends on the movement mode, see spaceimpact-enemies.js.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var req = typeof require === 'function';
  var Random = ns.Random || (req ? require('./spaceimpact-random.js') : null);
  var Classes = ns.Classes || (req ? require('./spaceimpact-classes.js') : null);

  function check(rng, object) {
    var divisor = object.div;
    if (!divisor || divisor === 0x7f) return false;
    return Random.effects(rng) % divisor === 0;
  }

  // returns the position of the new bullet before its first move, or null when the enemy cannot shoot now
  function shoot(object) {
    var x = object.x & 255;
    if (!Classes.isBoss(object.cls) && object.ammo === 0) return null;
    if (x > 84) return null;
    object.ammo = (object.ammo + 255) & 255;
    return { x: x - 2, y: object.y + (object.h >> 1) };
  }

  ns.Fire = { check: check, shoot: shoot };
  if (typeof module === 'object' && module.exports) module.exports = ns.Fire;
})(typeof globalThis !== 'undefined' ? globalThis : this);
