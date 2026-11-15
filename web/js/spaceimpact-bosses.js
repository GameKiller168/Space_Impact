/* The bosses of levels 1 to 7, Nokia 3310 v6.39 PPM B (the final boss and its turrets are not decoded yet).
 *
 * The boss dispatcher at 0x258b0c (wave-record movement mode 23) works with one boss state byte (0x109f0b; here game.bossState):
 * 1 while entering, 30 idle, 20 charging left, 10 returning, 40 leaving to the right. First the entry (0x258882): while the state
 * is neither 20 nor 40 and x is above 56 the boss moves one pixel left per tick and does nothing else, whatever its speed byte.
 * Then, by level:
 *   levels 1, 2   the bounce routine 0x25871c
 *   level 3       the charge routine 0x258a04 (strength 0x64)
 *   level 4       the bounce, then a special shot 0x258808 (class 21, +7, +6)
 *   level 5       the charge (0x64); in the states 10 and 30 a special shot (class 16, +0, +12)
 *   level 6       the charge (0x96); unless the state is 40 a special shot (class 14, +1, +10 when the boss's animation frame is 2 or 3,
 *                 else +4, +6)
 *   level 7       the charge (0x96); in the states 10 and 30 a special shot (class 6, +6, +14)
 *
 * Bounce 0x25871c: y' = y + dir; dir is one signed byte the whole game shares (0x109df0: the two mini-bosses use it too). The boss
 * takes y' on this tick; then dir changes for the next one when the boss's current picture touches the terrain at y' (0x2e7036:
 * to -1, to +1 on the two levels with terrain above), when y' reaches the top limit (levels with terrain at the bottom), when
 * y' + height reaches the bottom limit (levels 5 and 6; also 48 on level 1). It runs the shot check with the position before
 * the move and sets the state to 30.
 *
 * Charge 0x258a04: in the states 1 and 30 it bounces, then (every tick, one draw) with 1 in 50 and x <= 56 and y strictly between
 * the limits it starts the charge: the state becomes 20 (strength 0x64) or 40 (0x96). State 20: two (0x64) or four (0x96) pixels
 * left per tick, nudged by the terrain test, until x <= 8, then state 10. State 10: one pixel right per tick until x reaches
 * 74 minus the boss's width, then 30. State 40: one pixel right per tick until x = 84, then 20.
 *
 * Special shot 0x258808(class, dx, dy): when the shot check passes and a cooldown is zero, a new object of that class appears at
 * x + dx - its width, y + dy (its movement mode and speed are those of its class: homing for class 21, straight for 16 and 14,
 * small wave for 6) and the cooldown becomes 6; otherwise the cooldown falls by one.
 *
 * ctx supplies size(object), terrainHit(object, y, size), fire(object, y, height) (the shot check and a bullet), check(object) (the
 * shot check alone), classSize(cls) and spawn(shooter, cls, x, y).
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var req = typeof require === 'function';
  var Random = ns.Random || (req ? require('./spaceimpact-random.js') : null);
  var STOP_X = 56, FINAL = 7;
  var SPECIAL = { 3: [21, 7, 6], 4: [16, 0, 12], 5: [14, 1, 10], 6: [6, 6, 14] };

  function handles(level, vm) { return vm === 23 && level < FINAL; }
  function upper(level) { return level === 4 || level === 5; }
  function limits(level) { return upper(level) ? { bottom: 42, top: 16 } : { bottom: 32, top: 6 }; }

  function bounce(game, o, ctx) {
    var size = ctx.size(o), y = o.y + game.bossDir, level = game.level, lim = limits(level);
    if (ctx.terrainHit(o, y, size)) game.bossDir = upper(level) ? 1 : -1;
    if (!upper(level)) { if (y <= lim.top) game.bossDir = -game.bossDir; }
    else if (size.h + y >= lim.bottom) game.bossDir = -game.bossDir;
    if (level === 0 && size.h + y >= 48) game.bossDir = -game.bossDir;
    ctx.fire(o, o.y, size.h);                                    // before the move, with the old y
    o.y = y;
    game.bossState = 30;
  }

  function charge(game, o, ctx, strength) {
    var state = game.bossState, x = o.x, y = o.y, lim = limits(game.level);
    if (state === 10) {
      if (x < 74 - ctx.size(o).w) o.x = x + 1; else game.bossState = 30;
    } else if (state === 20) {
      if (x <= 8) game.bossState = 10;
      else {
        var nx = x - (strength === 0x64 ? 2 : 4), size = ctx.size(o);
        if (ctx.terrainHit(o, y, size)) y += upper(game.level) ? 1 : -1;
        o.x = nx; o.y = y;
      }
    } else if (state === 40) {
      if (x < 84) o.x = x + 1; else game.bossState = 20;
    } else {
      bounce(game, o, ctx);
      var draw = Random.effects(game.rng);
      if (draw % 50 === 0 && y < lim.bottom && y > lim.top && x <= STOP_X) game.bossState = strength === 0x64 ? 20 : 40;
    }
  }

  function special(game, o, ctx, entry) {
    var shot = ctx.check(o), size = ctx.classSize(entry[0]);
    if (shot && game.bossCool === 0) {
      ctx.spawn(o, entry[0], o.x + entry[1] - size.w, o.y + entry[2]);
      game.bossCool = 6;
    } else if (game.bossCool > 0) game.bossCool -= 1;
  }

  function step(game, o, ctx) {
    if (!handles(game.level, o.vm)) return false;
    var level = game.level, state = game.bossState;
    o.shoot = 0;
    if (state !== 40 && state !== 20 && o.x > STOP_X) { o.x -= 1; return true; }
    if (level <= 1) bounce(game, o, ctx);
    else if (level === 3) { bounce(game, o, ctx); special(game, o, ctx, SPECIAL[3]); }
    else {
      charge(game, o, ctx, level === 2 || level === 4 ? 0x64 : 0x96);
      var after = game.bossState;
      if (level === 4 && (after === 10 || after === 30)) special(game, o, ctx, SPECIAL[4]);
      else if (level === 5 && after !== 40) {
        // level 6 chooses the start of its shot by the boss's animation frame on this tick: 2 or 3 -> (+1, +10), else (+4, +6)
        var frame = o.age % 4;
        special(game, o, ctx, frame >= 2 ? [14, 1, 10] : [14, 4, 6]);
      }
      else if (level === 6 && (after === 10 || after === 30)) special(game, o, ctx, SPECIAL[6]);
    }
    return true;
  }

  ns.Bosses = { handles: handles, step: step, STOP_X: STOP_X, TOP: 6 };
  if (typeof module === 'object' && module.exports) module.exports = ns.Bosses;
})(typeof globalThis !== 'undefined' ? globalThis : this);
