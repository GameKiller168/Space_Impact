/* Ordinary main-shot contacts in 0x259d30 (v6.39 PPM B).
 * The first collidable display-list entry with an inclusive box overlap wins;
 * unlike ship contact, this path does not call the pixel test. Damage is one
 * hit point, with five points for damage and ten for a kill. The object's
 * template byte +10 suppresses scoring (the ordinary enemy projectile has it).
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var ignored = { 0: true, 1: true, 2: true, 8: true, 9: true, 10: true, 22: true, 36: true, 50: true };
  function signed(value) { value &= 255; return value >= 128 ? value - 256 : value; }
  function collidable(cls) { return !ignored[cls & 255]; }
  function touches(shot, target) {
    var x = signed(target.x), y = signed(target.y), w = signed(target.w), h = signed(target.h);
    return (shot.x & 255) <= x + w && (shot.x & 255) + (shot.w & 255) >= x &&
      (shot.y & 255) <= y + h && (shot.y & 255) + (shot.h & 255) >= y;
  }
  // 0x2592b0 uses a strict comparison with 0x7b0c - increment.
  function addScore(score, increment) { return score < 0x7b0c - increment ? score + increment : score; }
  function damage(target, score) {
    target.hp = (target.hp - 1) & 255;
    var killed = target.hp === 0;
    if (!target.noScore) score = addScore(score, killed ? 10 : 5);
    return { killed: killed, score: score };
  }
  function explosionFrame(oldFrame, stage) {
    return stage === 1 ? oldFrame : [18, 19, 20, 21][stage - 1];
  }
  ns.EnemyHits = { collidable: collidable, touches: touches, addScore: addScore, damage: damage, explosionFrame: explosionFrame };
  if (typeof module === 'object' && module.exports) module.exports = ns.EnemyHits;
})(typeof globalThis !== 'undefined' ? globalThis : this);
