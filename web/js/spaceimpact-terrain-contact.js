/* Ship/terrain pixel contact from firmware 0x2e7036, called at 0x259d72.
 * The 84x16 terrain buffer uses vertical pages and set bits, as does the ship.
 * The second level bypasses the call at 0x259d5a; the guard word suppresses
 * object contact only, not this test. Firmware traces exercise both orientations.
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var Terrain = root.SpaceImpactTerrain || (typeof require === 'function' ? require('./spaceimpact-terrain.js') : null);

  function hits(level, scroll, ship) {
    if (level === 2) return false;
    var terrain = Terrain.renderBytes(level, scroll), origin = Terrain.originY(level);
    var first = Math.max(0, origin - ship.y), last = Math.min(ship.height, origin + 16 - ship.y);
    for (var row = first; row < last; row++) {
      var terrainRow = ship.y + row - origin;
      for (var col = 0; col < ship.width; col++) {
        var x = ship.x + col;
        if (x < 0 || x >= 84) continue;
        if ((ship.pages[(row >> 3) * ship.width + col] & (1 << (row & 7))) &&
            (terrain[(terrainRow >> 3) * 84 + x] & (1 << (terrainRow & 7)))) return true;
      }
    }
    return false;
  }

  ns.TerrainContact = { hits: hits };
  if (typeof module === 'object' && module.exports) module.exports = ns.TerrainContact;
})(typeof globalThis !== 'undefined' ? globalThis : this);
