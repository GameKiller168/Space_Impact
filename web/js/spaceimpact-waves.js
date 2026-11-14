/* The first three level-one enemy waves, measured against the v6.39 firmware.
 * Collisions and later wave types are outside this model.
 */
(function (root) {
  'use strict';
  var levels = root.SpaceImpactLevels || (typeof require === 'function' ? require('./spaceimpact-levels.js') : null);
  var FIRST_FRAME = '0x003122e0', SECOND_FRAME = '0x003122d4';

  function FirstThree() {
    this.tick = 0;
    this.scroll = 0;
    this.wavesLeft = 20;
    this.waitTicks = 20;
    this.spawned = 0;
    this.enemies = [];
  }

  FirstThree.prototype.advance = function () {
    if (this.tick >= 92) throw new RangeError('Firmware trace covers only the first 92 ticks');
    this.tick += 1;
    if (this.tick === 1) return;
    this.scroll += 1;
    this.waitTicks -= 1;
    if (this.waitTicks === 0 && this.spawned < 3) {
      var row = levels.firstLevel.waveRecords[this.spawned++];
      for (var i = 0; i < row[0]; i++) {
        this.enemies.push({ x: 84 + row[2] * i, y: row[6], speed: row[3], age: -1 });
      }
      this.wavesLeft -= 1;
      this.waitTicks = row[5];
    }
    this.enemies.forEach(function (enemy) { enemy.x -= enemy.speed; enemy.age += 1; });
    this.enemies = this.enemies.filter(function (enemy) { return enemy.x >= 0; });
  };

  FirstThree.prototype.snapshot = function () {
    return {
      tick: this.tick, scroll: this.scroll, wavesLeft: this.wavesLeft, waitTicks: this.waitTicks,
      enemies: this.enemies.map(function (enemy) {
        return { x: enemy.x, y: enemy.y, data: enemy.age % 2 === 0 ? FIRST_FRAME : SECOND_FRAME, width: 11, height: 5 };
      })
    };
  };

  var api = { FirstThree: FirstThree };
  root.SpaceImpactWaves = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
