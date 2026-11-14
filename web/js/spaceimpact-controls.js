/* Firmware input messages for the ship's four-direction movement.
 * The initial playfield bounds are observed at the start of level 1. Terrain
 * changes can alter the vertical limits, so the caller supplies current bounds.
 */
(function (root) {
  'use strict';

  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var movement = {
    9: [0, 1], 17: [0, -1], 20: [1, 0], 22: [-1, 0],
    137: [0, 2], 145: [0, -2], 148: [2, 0], 150: [-2, 0]
  };
  var keys = { '0': 9, '1': 10, '3': 12, '4': 13, '6': 15,
    '8': 17, '#': 20, '*': 22, fireMain: 10, fireBonus: 13 };
  var INITIAL_BOUNDS = Object.freeze({ left: 1, right: 73, top: 6, bottom: 41 });

  // Firmware has high-valued message variants for motion and main fire.
  // The phone's timing for producing those variants is not established here.
  function messageForKey(key, highVariant) {
    if (!Object.prototype.hasOwnProperty.call(keys, key)) return null;
    var msg = keys[key];
    if (!highVariant) return msg;
    return msg === 9 || msg === 10 || msg === 12 || msg === 17 || msg === 20 || msg === 22 ? msg + 128 : null;
  }

  function move(position, message, bounds) {
    var step = movement[message];
    if (!step) return { x: position.x, y: position.y };
    var x = position.x + step[0], y = position.y + step[1];
    if ((step[0] && (x < bounds.left || x > bounds.right)) ||
        (step[1] && (y < bounds.top || y > bounds.bottom))) {
      return { x: position.x, y: position.y };
    }
    return { x: x, y: y };
  }

  ns.Controls = { move: move, messageForKey: messageForKey, INITIAL_BOUNDS: INITIAL_BOUNDS };
  if (typeof module === 'object' && module.exports) module.exports = ns.Controls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
