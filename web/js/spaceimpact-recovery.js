/* Collision recovery observed in Nokia 3310 v6.39 PPM B.
 * Call hit() when the game detects a collision. Collision detection, score,
 * and the separate game display during game over are outside this module.
 */
(function (root) {
  'use strict';

  function Recovery(options) {
    options = options || {};
    this.lives = options.lives;
    this.position = { x: options.x, y: options.y };
    this.now = options.now;
    this.delay = options.delay === undefined ? 100 : options.delay;
    this.secondaryInterval = options.secondaryInterval === undefined ? 3000 : options.secondaryInterval;
    this.nextSecondary = options.nextSecondary === undefined ? null : options.nextSecondary;
    this.nextMain = this.now + this.delay;
    this.phase = 10;
    this.hitState = 0;
    this.returnCode = 33;
    this.event = 0;
    this.frame = '0x00312544';
    this.stage = null;
    this.ended = false;
  }

  Recovery.prototype.hit = function () {
    if (this.stage !== null || this.lives < 1) return false;
    this.stage = 0;
    this.hitState = 1;
    this.returnCode = 33;
    this.event = 23;
    this.frame = '0x00312628';
    return true;
  };

  Recovery.prototype.advance = function () {
    if (this.stage === null || this.ended) throw new Error('No active collision recovery');
    this.now = this.nextMain;
    // The separately scheduled message 0 repeats while the game remains active.
    while (this.nextSecondary !== null && this.nextSecondary <= this.now) {
      this.nextSecondary += this.secondaryInterval;
    }
    this.stage += 1;
    this.returnCode = 33;
    if (this.stage === 1) this.returnCode = 27;
    else if (this.stage === 2) this.frame = '0x00312630';
    else if (this.stage === 3) this.frame = '0x00312628';
    else if (this.stage === 4) this.frame = '0x00312620';
    else if (this.stage === 5) {
      this.lives -= 1;
      if (this.lives > 0) {
        this.hitState = 0;
        this.frame = '0x00312544';
        this.position = { x: 5, y: 20 };
      } else {
        this.phase = 20;
        this.delay = 800;
        this.frame = null;
      }
    } else if (this.stage === 6 && this.lives > 0) {
      this.returnCode = 19;
      this.nextSecondary = this.now + this.secondaryInterval;
    } else if (this.stage === 6) this.returnCode = 22;
    else if (this.stage === 12) {
      this.returnCode = 24;
      this.ended = true;
      this.nextMain = this.nextSecondary = null;
      return;
    }
    this.nextMain = this.now + this.delay;
    if (this.stage === 6 && this.lives > 0) this.stage = null;
  };

  Recovery.prototype.snapshot = function () {
    var isHitFrame = this.hitState === 1;
    return {
      ms: this.now, return: this.returnCode, event: this.event, lives: this.lives,
      hit_state: this.hitState, phase: this.phase, delay: this.delay,
      ship: this.frame === null ? null : { x: this.position.x, y: this.position.y, data: this.frame,
        width: isHitFrame ? 7 : 10, height: 7, flags: 2 },
      next_main_ms: this.nextMain, next_secondary_ms: this.nextSecondary
    };
  };

  var api = { Recovery: Recovery };
  root.SpaceImpactRecovery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
