/* Whether the player's ship is touched by another display object, as decided by
 * the v6.39 PPM B player-contact routine (entry 0x259d30).
 *
 * Covered: the guard word check, the class filter (0x258e64), the first-match
 * bounding-box search (0x259a60 / 0x259a0e), the pixel test (0x259ab4) and the
 * way the object class selects between ignoring, picking up and being hit. The
 * search starts at the display-list entry after the ship's own, so objects
 * drawn before the ship (such as the terrain layer) are never found by it.
 * Not covered: what the firmware does after a hit or pickup, the other gates
 * of the routine (a level-dependent flag and a state byte at 0x10a1f0), and
 * the second search the firmware runs for the ship's own shots.
 *
 * Bitmaps are vertical 8-pixel pages, one byte per column, least significant
 * bit on top, exactly as the display records point to them.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});

  // Classes for which the firmware filter reports "do not test": 0 and 2 (via mask 0xfd), 1, 8, 9, 10, 0x16, 0x24.
  var IGNORED = { 0: true, 1: true, 2: true, 8: true, 9: true, 10: true, 0x16: true, 0x24: true };
  var PICKUP_CLASSES = { 0x11: true, 0x21: true };
  var BOX_ONLY_CLASS = 4;

  function collidable(objectClass) { return !IGNORED[objectClass & 0xff]; }
  function int8(value) { value &= 0xff; return value > 127 ? value - 256 : value; }
  function u8(value) { return value & 0xff; }

  // The search compares the ship's unsigned box with the other object's signed box; edges count as touching.
  function boxesTouch(ship, other) {
    var ox = int8(other.x), oy = int8(other.y), ow = int8(other.width), oh = int8(other.height);
    return u8(ship.x) <= ox + ow && u8(ship.x) + u8(ship.width) >= ox &&
           u8(ship.y) <= oy + oh && u8(ship.y) + u8(ship.height) >= oy;
  }

  function pageBit(object, row, column) {
    var index = (row >> 3) * u8(object.width) + column;
    if (!object.pages || index >= object.pages.length) {
      throw new RangeError('the firmware would read outside the bitmap at row ' + row + ', column ' + column);
    }
    return object.pages[index] & (1 << (row & 7));
  }

  // Overlap of the other object's bitmap (a) with the ship's (b), following the firmware's byte arithmetic.
  // In collision mode 2 a pixel counts where both bits are clear; in mode 1 where both are set; other modes never touch.
  function pixelContact(other, ship, mode) {
    var ax = u8(other.x), ay = u8(other.y), aw = u8(other.width), ah = u8(other.height);
    var bx = u8(ship.x), by = u8(ship.y), bw = u8(ship.width), bh = u8(ship.height);
    var rowA, rowB, colA, colB;
    if (by < ay) { rowB = u8(ay - by); rowA = 0; } else { rowA = u8(by - ay); rowB = 0; }
    if (bx < ax) { colB = u8(ax - bx); colA = 0; } else { colA = u8(bx - ax); colB = 0; }
    var width = bx + bw < ax + aw ? u8(bw - colB) : u8(aw - colA);
    var height = by + bh < ay + ah ? u8(bh - rowB) : u8(ah - rowA);
    for (var i = 0; i < height; i++, rowA = u8(rowA + 1), rowB = u8(rowB + 1)) {
      var cA = colA, cB = colB;
      for (var j = 0; j < width; j++, cA = u8(cA + 1), cB = u8(cB + 1)) {
        var pixelB = pageBit(ship, rowB, cB), pixelA = pageBit(other, rowA, cA);
        if (mode === 2 ? !(pixelA || pixelB) : (mode === 1 && pixelA && pixelB)) return true;
      }
    }
    return false;
  }

  // objects: the display-list entries that follow the ship's, in list order; each has class, x, y, width,
  // height and pages. state: { mode, guard }. Returns { outcome: 'none' | 'hit' | 'pickup', object }.
  function shipContact(ship, objects, state) {
    if (state.guard !== 0) return { outcome: 'none', object: null };
    var found = null;
    for (var i = 0; i < objects.length && !found; i++) {
      if (collidable(objects[i].class) && boxesTouch(ship, objects[i])) found = objects[i];
    }
    if (!found) return { outcome: 'none', object: null };
    var cls = found.class & 0xff;
    if (cls !== BOX_ONLY_CLASS && !pixelContact(found, ship, state.mode)) return { outcome: 'none', object: found };
    return { outcome: PICKUP_CLASSES[cls] ? 'pickup' : 'hit', object: found };
  }

  function pagesFromRows(rows) {
    var width = rows.length ? rows[0].length : 0, pages = [];
    for (var p = 0; p * 8 < rows.length; p++) {
      for (var x = 0; x < width; x++) {
        var value = 0;
        for (var bit = 0; bit < 8 && p * 8 + bit < rows.length; bit++) {
          if (rows[p * 8 + bit][x] === '#') value |= 1 << bit;
        }
        pages.push(value);
      }
    }
    return pages;
  }

  function pagesFromHex(hex) {
    var pages = [];
    for (var i = 0; i + 1 < hex.length; i += 2) pages.push(parseInt(hex.substr(i, 2), 16));
    return pages;
  }

  ns.Contact = {
    collidable: collidable, boxesTouch: boxesTouch, pixelContact: pixelContact, shipContact: shipContact,
    pagesFromRows: pagesFromRows, pagesFromHex: pagesFromHex
  };
  if (typeof module === 'object' && module.exports) module.exports = ns.Contact;
})(typeof globalThis !== 'undefined' ? globalThis : this);
