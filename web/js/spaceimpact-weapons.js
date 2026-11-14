/* Main-projectile transitions observed in the firmware's initial playfield.
 * Collision handling and bonus-weapon behavior belong to the game engine.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  function initial() { return { cooldown: 0, repeats: 0, shots: [] }; }

  function message(state, code, ship) {
    var shots = state.shots.map(function (shot) { return { x: shot.x, y: shot.y }; });
    var cooldown = state.cooldown, repeats = state.repeats;
    if (code === 1) {
      if (cooldown) cooldown = cooldown === 1 ? 2 : 0;
      shots = shots.map(function (shot) { return { x: shot.x + 2, y: shot.y }; })
        .filter(function (shot) { return shot.x < 84; });
    } else if ((code === 10 || code === 12) && cooldown === 0) {
      shots.push({ x: ship.x + 6, y: ship.y + 3 });
      cooldown = 1;
      repeats = 0;
    } else if ((code === 138 || code === 140) && repeats < 5) {
      if (cooldown === 0) {
        shots.push({ x: ship.x + 6, y: ship.y + 3 });
        cooldown = 1;
      }
      repeats += 1;
    }
    return { cooldown: cooldown, repeats: repeats, shots: shots };
  }

  ns.Weapons = { initial: initial, message: message };
  if (typeof module === 'object' && module.exports) module.exports = ns.Weapons;
})(typeof globalThis !== 'undefined' ? globalThis : this);
