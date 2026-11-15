/* The bosses that bounce (levels 1, 2 and 4), Nokia 3310 v6.39 PPM B.
 *
 * The boss dispatcher at 0x258b0c (wave-record movement mode 23) first lets the boss enter: while its x is above 56 it moves one
 * pixel left per tick, whatever its speed byte, and does nothing else (0x258882). From then on levels 1 and 2 (and level 4, which
 * adds a special shot elsewhere) run the bounce routine 0x25871c: y' = y + dir, where dir is one signed byte that the whole game
 * shares (0x109df0, +-1; the two mini-bosses use it as well). The position y' is taken on this tick; then dir changes for the next
 * one when the boss's current picture touches the terrain at y' (0x2e7036, spaceimpact-terrain-contact.js; the terrain stands still
 * while a boss is there), when y' reaches the top limit 6, and, on level 1 only, when y' + height reaches 48. The shot check runs
 * on every tick with the position from before the move. The picture used for the touch test and for the height is the one the
 * boss shows on this tick (checked on all three bosses against the recordings).
 *
 * ctx supplies size(object) and terrainHit(object, y, size) for that picture.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var HANDLED = { 0: true, 1: true, 3: true };           // level indexes
  var TOP = 6, STOP_X = 56;

  function handles(level, vm) { return vm === 23 && HANDLED[level] === true; }

  function step(game, o, ctx) {
    if (!handles(game.level, o.vm)) return false;
    o.shoot = 0; o.shootY = -1;
    if (o.x > STOP_X) { o.x -= 1; return true; }
    var size = ctx.size(o), y = o.y + game.bossDir;
    if (ctx.terrainHit(o, y, size)) game.bossDir = -1;                 // away from terrain at the bottom
    if (y <= TOP) game.bossDir = -game.bossDir;
    if (game.level === 0 && size.h + y >= 48) game.bossDir = -game.bossDir;
    o.shoot = 1; o.shootY = o.y; o.shootH = size.h;
    o.y = y;
    return true;
  }

  ns.Bosses = { handles: handles, step: step, STOP_X: STOP_X, TOP: TOP };
  if (typeof module === 'object' && module.exports) module.exports = ns.Bosses;
})(typeof globalThis !== 'undefined' ? globalThis : this);
