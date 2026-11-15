/* Space Impact uses two firmware random streams (Nokia 3310 v6.39 PPM B).
 * 0x2f1b44 supplies random wave heights; 0x2dd7d0 supplies game effects and
 * firing. Both update a 32-bit word in RAM. Callers choose the initial seed;
 * the phone's time-derived seed itself is outside the game oracle.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  function create(seed) {
    seed = seed >>> 0;
    return { spawn: seed, effects: seed };
  }
  function spawn(state) {
    state.spawn = (Math.imul(state.spawn, 0x41c64e6d) + 0x3039) >>> 0;
    return (state.spawn >>> 16) & 0x7fff;
  }
  function effects(state) {
    state.effects = ((Math.imul(state.effects, 0x625f) + 0x3623) >>> 0) % 0xfff1;
    return state.effects;
  }
  function valid(state) {
    return !!state && Number.isInteger(state.spawn) && state.spawn >= 0 && state.spawn <= 0xffffffff &&
      Number.isInteger(state.effects) && state.effects >= 0 && state.effects <= 0xffffffff;
  }

  ns.Random = { create: create, spawn: spawn, effects: effects, valid: valid };
  if (typeof module === 'object' && module.exports) module.exports = ns.Random;
})(typeof globalThis !== 'undefined' ? globalThis : this);
