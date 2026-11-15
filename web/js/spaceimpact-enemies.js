/* Ordinary wave movement, Nokia 3310 v6.39 PPM B.
 * The handler's dispatch at 0x2596ee selects these routines. The signed
 * ordinate tables below are the 84-byte tables at 0x312104..0x312253.
 * Coordinates are display-record bytes; off-screen x can wrap to 255.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var CURVE = [19,18,17,16,15,13,12,11,11,10,10,9,9,10,10,11,12,13,14,15,16,18,18,19,21,22,23,24,25,26,26,27,27,26,26,26,25,24,23,22,20,19,18,17,16,15,13,12,11,11,10,10,9,9,10,10,11,12,13,14,15,16,18,18,20,21,22,23,24,25,26,26,27,27,26,26,26,25,24,23,22,20,19,19];
  var SMALL = [0,0,0,1,2,2,3,3,3,4,4,4,4,4,3,3,3,2,1,1,0,0,0,-1,-1,-2,-2,-3,-3,-4,-4,-4,-4,-4,-3,-3,-3,-2,-2,-1,-1,0,0,0,1,2,2,3,3,3,4,4,4,4,4,3,3,3,2,1,1,0,0,0,-1,-1,-2,-2,-3,-3,-4,-4,-4,-4,-4,-3,-3,-3,-2,-2,-1,-1,0,0];
  var RISE = [6,6,7,7,7,8,8,8,9,9,9,10,10,10,11,11,11,11,12,12,12,13,13,13,14,14,14,15,15,15,16,16,16,17,17,17,18,18,18,19,19,19,20,20,20,20,21,21,21,22,22,22,23,23,23,24,24,24,25,25,25,26,26,26,27,27,27,28,28,28,29,29,29,29,30,30,30,31,31,31,32,32,32,33];
  var FALL = [33,32,32,32,30,30,30,29,29,29,29,28,28,28,27,27,27,26,26,26,25,25,25,24,24,24,24,23,23,23,22,22,22,22,21,21,21,20,20,20,20,20,19,19,19,18,18,18,17,17,17,16,16,16,15,15,15,14,14,14,13,13,13,12,12,12,12,11,11,10,10,10,9,9,9,8,8,8,7,7,7,6,6,6];

  function bounds(level) { return level === 4 || level === 5 ? { top: 16, bottom: 42 } : { top: 6, bottom: 32 }; }
  function spawnY(record, level, height, random) {
    if (record[6] !== 63) return record[6];
    var b = bounds(level);
    return Math.min(b.bottom - height, b.top + random % b.bottom);
  }
  function gone(x) { return x === 0 || x > 250; }
  function step(o, level, shipY) {
    var vm = o.vm, speed = o.speed, b = bounds(level), x = o.x & 255, y = o.y & 255;
    if (vm === 6) {
      if (gone(x)) return false;
      o.x = (x - speed) & 255;
      return true;
    }
    if (vm === 8) return true;
    if (vm === 7) {
      if (gone(x)) return false;
      if (x >= 40 && x <= 42) {
        if (y > b.top + speed) y -= speed;
        else x -= speed;
      } else if (x < 40) {
        x -= speed;
        if (y < b.bottom - speed) y += speed;
      } else {
        if (x > 84 - o.w) y = b.top;
        else if (y < b.bottom - o.h) y += speed;
        x -= speed;
      }
      o.x = x & 255; o.y = Math.min(y, b.bottom - o.h) & 255;
      return true;
    }
    if (vm === 1 || (vm >= 10 && vm <= 16)) {
      x = Math.max(0, x - speed);
      var table = CURVE, offset = b.top === 16 ? 10 : 0;
      if (vm >= 10 && vm <= 14) { table = SMALL; offset = [35, 11, 14, 25, 18][vm - 10]; }
      if (vm === 15) { table = FALL; offset = 0; }
      if (vm === 16) { table = RISE; offset = 0; }
      o.x = x; o.y = Math.max(b.top, table[x % 84] + offset) & 255;
      return !gone(o.x);
    }
    if (vm === 2 || vm === 4 || vm === 3 || vm === 17 || vm === 18) {
      x -= speed;
      if (vm === 2) {
        if (x > 56) y = b.top;
        else if (x > 28 && y < b.bottom - o.h) y += speed;
      } else if (vm === 4) {
        if (x > 56) y = b.bottom - o.h;
        else if (x > 28 && y > b.top + speed) y -= speed;
      } else if (vm === 3) {
        if (y < shipY) y += 1; else if (y > shipY) y -= 1;
      } else if (vm === 17) {
        if (x > 84) y = b.top;
        else if (y < 9) y += 1;
      } else {
        if (x > 84) y = b.bottom;
        else if (y >= 28) y -= 1;
      }
      o.x = x & 255; o.y = y & 255;
      return !gone(o.x);
    }
    if (vm === 24) {
      // The two mini-bosses (level 3 wave 22, level 5 wave 18): one pixel left per tick up to x = 56, then up and
      // down one pixel per tick between two limits. The limits were read from the recordings (6..37 on level 3,
      // 7..37 on level 5); the firmware takes them from its terrain routine, which is not decoded.
      var limits = level === 4 ? [7, 37] : [6, 37];
      if (x > 56) { o.x = (x - 1) & 255; return true; }
      var dir = o.dir === 1 ? 1 : -1;
      y += dir;
      if (y <= limits[0]) { y = limits[0]; dir = 1; } else if (y >= limits[1]) { y = limits[1]; dir = -1; }
      o.dir = dir; o.y = y & 255;
      return true;
    }
    // Boss mode 23 belongs to the separate boss implementation.
    return null;
  }

  // the movement modes this module decodes; their objects leave by their own rule (gone), not by the display edge
  var HANDLED = { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 7: 1, 8: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 24: 1 };
  function handles(vm) { return HANDLED[vm] === 1; }

  ns.Enemies = { bounds: bounds, spawnY: spawnY, step: step, handles: handles };
  if (typeof module === 'object' && module.exports) module.exports = ns.Enemies;
})(typeof globalThis !== 'undefined' ? globalThis : this);
