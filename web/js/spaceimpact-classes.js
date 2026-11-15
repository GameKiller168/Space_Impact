/* Enemy classes of Space Impact, v6.39 PPM B.
 *
 * Each wave record names a class (its second byte). The firmware keeps a 37-entry table at 0x10a210 that maps a class
 * to the first of its animation frames in the image-descriptor table (the 84 images of spaceimpact-assets.js); the
 * frames of a class are consecutive descriptors. `frames` below are those descriptor indexes, read from the running
 * firmware. A class with two frames toggles every tick, a boss has four (two images, each shown for two ticks).
 *
 * `points` and `fire` are measured from recorded firmware runs, not decoded: points are the score the firmware added
 * when a class was shot (only classes seen shot are listed; other classes use the default), `fire` is the share of
 * on-screen ticks on which that class released a shot. Real firing is irregular, with bursts, and its rule is not
 * decoded; this is only the average. Vertical movement is also approximated, see spaceimpact-engine.js.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  var BOSS_POINTS = 100, DEFAULT_POINTS = 10;

  // class: [first descriptor, frame count]
  var FRAMES = {
    1: [17, 1], 2: [18, 4], 3: [3, 1], 4: [17, 1], 5: [4, 2], 6: [6, 2], 7: [23, 4], 8: [56, 2], 9: [10, 1], 10: [8, 1],
    11: [76, 1], 12: [77, 1], 13: [78, 1], 14: [62, 2], 15: [64, 2], 16: [66, 2], 17: [58, 2], 18: [35, 4], 19: [27, 4],
    20: [31, 4], 21: [9, 1], 23: [39, 4], 24: [43, 4], 25: [47, 4], 26: [60, 1], 27: [61, 1], 28: [68, 1], 29: [69, 2],
    30: [71, 2], 31: [73, 2], 32: [75, 1], 33: [58, 2], 34: [51, 4], 35: [55, 1], 36: [18, 4]
  };
  var BOSSES = { 7: true, 18: true, 19: true, 20: true, 23: true, 24: true, 25: true, 34: true };
  var PICKUPS = { 17: true, 33: true };
  var POINTS = { 4: 5, 6: 5, 14: 5, 15: 5, 16: 5, 21: 5 };
  var FIRE = { 7: 0.02, 11: 0.01, 14: 0.005, 15: 0.008, 16: 0.004, 18: 0.03, 19: 0.036, 20: 0.042, 23: 0.064, 24: 0.035,
    25: 0.018, 26: 0.02, 27: 0.022, 29: 0.006, 30: 0.011, 31: 0.011, 34: 0.03 };

  function known(cls) { return Object.prototype.hasOwnProperty.call(FRAMES, cls); }
  function frames(cls) {
    var entry = FRAMES[cls], list = [];
    for (var i = 0; i < entry[1]; i++) list.push(entry[0] + i);
    return list;
  }
  function points(cls) {
    if (BOSSES[cls]) return BOSS_POINTS;
    return Object.prototype.hasOwnProperty.call(POINTS, cls) ? POINTS[cls] : DEFAULT_POINTS;
  }

  ns.Classes = {
    known: known, frames: frames, points: points,
    isBoss: function (cls) { return !!BOSSES[cls]; },
    isPickup: function (cls) { return !!PICKUPS[cls]; },
    fireRate: function (cls) { return Object.prototype.hasOwnProperty.call(FIRE, cls) ? FIRE[cls] : 0; },
    // the final boss stops further left than the others
    stopX: function (cls) { return cls === 34 ? 46 : 56; }
  };
  if (typeof module === 'object' && module.exports) module.exports = ns.Classes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
