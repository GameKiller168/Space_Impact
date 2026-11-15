/* Bonus key messages 13/15 and projectile movement from 0x257e1c and the
 * original handler. The shared main/bonus cooldown is passed by the caller.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var Assets = root.SpaceImpactAssets || (typeof require === 'function' ? require('./spaceimpact-assets.js') : null);
  function display(shot) {
    if (shot.type === 22) return { type: 22, x: shot.x, y: shot.y, endX: shot.x, endY: shot.endY };
    var index = shot.type === 10 ? 8 : (shot.age === 0 ? 10 : (shot.age === 1 || shot.age === 5 ? 11 : 12));
    var img = Assets.images[index];
    return { type: shot.type, x: shot.x, y: shot.y, data: img.data, width: img.width, height: img.height };
  }
  // Target selection with several moving objects and edge-of-screen removal remain estimates.
  function message(state, code, ship, cooldown, level, objects) {
    var shots = state.shots.map(function (s) { return { type: s.type, x: s.x, y: s.y, age: s.age, endY: s.endY }; });
    var ammo = state.ammo, type = state.type, event = 0, i;
    if (code === 1) {
      for (i = 0; i < shots.length; i++) {
        var s = shots[i]; s.age++;
        if (s.type === 10) {
          var target = null, best = -99;
          for (var j = 0; objects && j < objects.length; j++) {
            var o = objects[j], hp = (o.hp << 24) >> 24;
            if (!o.dead && o.x >= s.x && [0,1,2,8,9,10,22,36,50].indexOf(o.cls) < 0 && hp > best) { target = o; best = hp; }
          }
          s.x = (s.x + (target ? 2 : 1)) & 255;
          if (target) { var aim = target.y + Math.floor(target.h / 2); if (s.y < aim) s.y++; else if (s.y > aim) s.y--; }
        }
        else if (s.type === 9 && s.age === 1) { s.x += 6; s.y -= 2; }
        else if (s.type === 22) {
          if (s.age === 1) { if (level !== 5 && level !== 6) s.endY = 48; }
          else s.x += 2;
        }
      }
      shots = shots.filter(function (s) { return s.type === 9 ? s.age < 6 : (s.type !== 22 || s.x < 84); });
    } else if ((code === 13 || code === 15) && cooldown === 0 && ammo > 0) {
      var active = false;
      for (i = 0; i < shots.length; i++) if (shots[i].type === 22) active = true;
      if (type !== 22 || !active) {
        if (type === 22) {
          var upper = level === 5 || level === 6;
          if (shots.length < 40) shots.push({ type: type, x: ship.x + 10, y: upper ? 0 : 6, age: 0, endY: upper ? 42 : 32 });
          event = 26;
        } else {
          if (shots.length < 40) shots.push({ type: type, x: ship.x + 6, y: ship.y + 3, age: 0, endY: 0 });
          event = 25;
        }
        ammo--;
      }
      cooldown = 1; // even a blocked second class-22 shot starts the cooldown
    }
    return { state: { type: type, ammo: ammo, shots: shots }, cooldown: cooldown, event: event };
  }
  ns.Bonus = { message: message, display: display };
  if (typeof module === 'object' && module.exports) module.exports = ns.Bonus;
})(typeof globalThis !== 'undefined' ? globalThis : this);
