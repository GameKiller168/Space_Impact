/* Space Impact game engine for the Nokia 3310 v6.39 PPM B reconstruction (v0.1).
 *
 * This is a playable engine built from firmware-derived data, not a port of the firmware's game code. What follows the
 * firmware and is checked against it: the 100 ms tick, the wave schedule of all eight levels (the first wave comes 20
 * ticks after a level starts and every later wave comes as many ticks after the previous one as that record's delay
 * byte says), spawn positions and straight flight, the ship's movement and main shot, whether an object touches the
 * ship (spaceimpact-contact.js), the ship's explosion sequence, the shield after a respawn, the scrolling terrain, the
 * class-to-sprite table and the hit points taken from the wave records.
 *
 * What is approximated, and says so in FIDELITY.md: the vertical movement of enemies, how often and from where they
 * shoot, the boss routines, points for classes that were never seen shot, pickup effects, terrain deaths, the final
 * boss's turrets, the level-end sequence's exact motion, and the bonus weapons (keys 4 and 6 do nothing yet).
 */
(function (root) {
  'use strict';
  var ns = (root.SpaceImpact = root.SpaceImpact || {});
  var common = root.SnakeII || {};
  var req = typeof require === 'function';
  var Assets = root.SpaceImpactAssets || (req ? require('./spaceimpact-assets.js') : null);
  var LevelData = root.SpaceImpactLevels || (req ? require('./spaceimpact-levels.js') : null);
  var Terrain = root.SpaceImpactTerrain || (req ? require('./spaceimpact-terrain.js') : null);
  var Contact = ns.Contact || (req ? require('./spaceimpact-contact.js') : null);
  var TerrainContact = ns.TerrainContact || (req ? require('./spaceimpact-terrain-contact.js') : null);
  var Controls = ns.Controls || (req ? require('./spaceimpact-controls.js') : null);
  var Weapons = ns.Weapons || (req ? require('./spaceimpact-weapons.js') : null);
  var Render = ns.Render || (req ? require('./spaceimpact-render.js') : null);
  var Classes = ns.Classes || (req ? require('./spaceimpact-classes.js') : null);
  var Random = ns.Random || (req ? require('./spaceimpact-random.js') : null);
  var Enemies = ns.Enemies || (req ? require('./spaceimpact-enemies.js') : null);
  var Text = common.Text || (req ? require('./text.js') : null);

  var TICK_MS = 100, MAX_ACC = 1000;
  var START_X = 5, START_Y = 20, START_LIVES = 3, MAX_LIVES = 5, SHIELD_TICKS = 30, FIRST_WAVE_WAIT = 20;
  var SHIP_FRAME = 0, HEART = 79, SHIELD_FRAMES = [56, 57], BULLET_FRAME = 17;
  var SHIP_EXPLOSION = [18, 18, 19, 18, 21];          // descriptor per tick, then the life is lost (firmware recovery stages)
  var ENEMY_EXPLOSION = [18, 19, 20, 21];
  var OVER_TICKS = 12, WON_TICKS = 40, REPEAT_AFTER = 3, MAX_OBJECTS = 80;
  var PLAYFIELD_TOP = 6, PLAYFIELD_BOTTOM = 41, CLASS_BULLET = 4, CLASS_EXPLOSION = 2;
  var images = Assets.images, pagesCache = {};

  function image(index) { return images[index]; }
  function pagesOf(index) {
    if (!pagesCache[index]) pagesCache[index] = Contact.pagesFromRows(images[index].rows);
    return pagesCache[index];
  }

  // ---- random numbers ----------------------------------------------------------------------------------------------
  function nextRandom(game) { return Random.effects(game.rng) / 0xfff1; }
  function randomInt(game, n) { return Random.spawn(game.rng) % n; }

  // ---- objects -----------------------------------------------------------------------------------------------------
  function frameOf(object) {
    var list = Classes.frames(object.cls);
    return list[object.age % list.length];     // the spawn tick already counts as age 1 and shows the second frame
  }
  function sizeOf(cls) { var first = image(Classes.frames(cls)[0]); return { w: first.width, h: first.height }; }

  function addObject(game, cls, x, y, extra) {
    if (game.objects.length >= MAX_OBJECTS) return null;
    var size = sizeOf(cls);
    var object = { id: game.nextId++, cls: cls, x: x, y: y, w: size.w, h: size.h, hp: 1, age: 0, vm: 6, speed: 0,
      y0: y, phase: 0, dir: 1, dead: 0, stop: 0, held: 0 };
    for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) object[key] = extra[key];
    game.objects.push(object);
    return object;
  }

  function spawnWave(game, record) {
    var count = record[0], cls = record[1], spacing = record[2], speed = record[3], vm = record[4], fixedY = record[6], range = record[8], hp = record[9];
    for (var i = 0; i < count; i++) {
      var boss = Classes.isBoss(cls);
      var y = Enemies.spawnY(record, game.level, sizeOf(cls).h, fixedY === 63 ? Random.spawn(game.rng) : 0);
      if (boss) y = Math.max(PLAYFIELD_TOP, Math.min(y, 48 - sizeOf(cls).h));
      var object = addObject(game, cls, 84 + spacing * i, y, { hp: Math.max(1, hp), vm: vm, speed: speed, y0: y,
        phase: 0, dir: vm === 24 ? -1 : (cls & 1) ? -1 : 1, stop: boss ? Classes.stopX(cls) : 0 });
      if (object && boss) game.bossSeen = true;
    }
  }

  // Vertical movement. Straight flight is verified; the rest imitates the recorded patterns by their wave-record byte.
  function verticalOffset(game, object) {
    var vm = object.vm, t = object.age;
    if (vm === 1) return object.y0 + Math.round(10 * Math.sin(2 * Math.PI * (t + object.phase) / 48)) - object.y;
    if (vm === 2 || vm === 3 || vm === 4) {
      if (object.x > 57 || object.held > 24) return 0;
      var target = Math.max(PLAYFIELD_TOP, Math.min(PLAYFIELD_BOTTOM - 2, game.ship.y + 2)), step = vm === 4 ? 2 : 1;
      var delta = target - object.y;
      if (delta === 0) return 0;
      object.held += 1;
      return Math.max(-step, Math.min(step, delta));
    }
    if (vm === 7) return 0;
    if (vm >= 10 && vm <= 24) return object.y0 + Math.round(5 * Math.sin(2 * Math.PI * (t + object.phase) / 40)) - object.y;
    return 0;
  }

  function moveObject(game, object) {
    var boss = Classes.isBoss(object.cls);
    if (object.cls === CLASS_BULLET) { object.x -= 3; return; }
    if (boss) {
      if (object.x > object.stop) { object.x -= Math.max(1, object.speed); return; }
      var bottom = 48 - object.h;
      object.y += object.dir;
      if (object.y <= PLAYFIELD_TOP) { object.y = PLAYFIELD_TOP; object.dir = 1; }
      if (object.y >= bottom) { object.y = bottom; object.dir = -1; }
      return;
    }
    var decoded = Enemies.step(object, game.level, game.ship.y);
    if (decoded !== null) {
      if (object.x > 127) object.x -= 256;            // the display record holds x as a byte, the picture is drawn with it signed
      if (decoded === false) object.gone = true;
      return;
    }
    if (object.vm === 7 && object.x <= 42 && object.held < 60) {      // stop, sweep down and up, then go on
      object.held += 1;
      var phase = object.held;
      if (phase <= 21) object.y += 1; else if (phase > 34 && phase <= 54) object.y -= 1;
      object.y = Math.max(PLAYFIELD_TOP, Math.min(PLAYFIELD_BOTTOM - 2, object.y));
      return;
    }
    object.x -= object.speed;
    var dy = verticalOffset(game, object);
    if (dy) object.y = Math.max(PLAYFIELD_TOP, Math.min(PLAYFIELD_BOTTOM - 2, object.y + dy));
  }

  // ---- game --------------------------------------------------------------------------------------------------------
  function Game(state) {
    this.acc = 0;
    this.held = {};
    this.events = [];
    this.result = null;
    for (var key in state) if (Object.prototype.hasOwnProperty.call(state, key)) this[key] = state[key];
  }

  function newState(seed) {
    return { v: 1, rng: Random.create(seed), level: 0, tick: 1, scroll: 0, wavesLeft: 0, wait: 0, waveIndex: 0, bossSeen: false,
      mode: 'play', modeTick: 0, ship: { x: START_X, y: START_Y }, lives: START_LIVES, score: 0, guard: SHIELD_TICKS,
      weapons: Weapons.initial(), objects: [], nextId: 1, extra: [] };
  }

  function startLevel(game, index) {
    var data = LevelData.allLevels[index];
    game.level = index; game.tick = 1; game.wavesLeft = data.waveRecords.length; game.wait = FIRST_WAVE_WAIT;
    game.waveIndex = 0; game.bossSeen = false; game.objects = []; game.extra = [];
    game.ship = { x: START_X, y: START_Y }; game.guard = SHIELD_TICKS; game.mode = 'play'; game.modeTick = 0;
    game.weapons = Weapons.initial();
  }

  function create(seed) {
    var game = new Game(newState(seed === undefined ? (Date.now() ^ 0x5a17) : seed));
    startLevel(game, 0);
    return game;
  }

  Game.prototype.emit = function (event) { this.events.push(event); };
  Game.prototype.bossPresent = function () {
    for (var i = 0; i < this.objects.length; i++) if (Classes.isBoss(this.objects[i].cls) && !this.objects[i].dead) return true;
    return false;
  };

  Game.prototype.moveShip = function (code) {
    if (this.mode !== 'play') return;
    var upperTerrain = this.level === 4 || this.level === 5;
    var bounds = { left: Controls.INITIAL_BOUNDS.left, right: Controls.INITIAL_BOUNDS.right,
      top: upperTerrain ? 1 : 6, bottom: upperTerrain ? 35 : 41 };
    this.ship = Controls.move(this.ship, code, bounds);
  };

  Game.prototype.fire = function (code) {
    if (this.mode !== 'play') return;
    var before = this.weapons.shots.length;
    this.weapons = Weapons.message(this.weapons, code, this.ship);
    if (this.weapons.shots.length > before) this.emit(24);
  };

  var MOVE = { '8': 17, '0': 9, '*': 22, '#': 20 }, MOVE_REPEAT = { '8': 145, '0': 137, '*': 150, '#': 148 };
  var FIRE = { '1': 10, '3': 12, fireMain: 10 }, FIRE_REPEAT = { '1': 138, '3': 140, fireMain: 138 };

  Game.prototype.press = function (key) {
    if (this.mode === 'play') {
      if (MOVE[key]) this.moveShip(MOVE[key]);
      else if (FIRE[key]) this.fire(FIRE[key]);
    }
    if (MOVE[key] || FIRE[key]) this.held[key] = 0;
    return this.flush();
  };
  Game.prototype.release = function (key) { delete this.held[key]; return this.flush(); };

  Game.prototype.flush = function () {
    var out = {};
    if (this.events.length) { out.events = this.events; this.events = []; }
    if (this.result) { out.ended = true; out.score = this.result.score; if (this.result.won) out.won = true; }
    return out.events || out.ended ? out : null;
  };

  Game.prototype.advance = function (ms) {
    this.acc = Math.min(MAX_ACC, this.acc + ms);
    while (this.acc >= TICK_MS && !this.result) { this.acc -= TICK_MS; this.step(); }
    return this.flush();
  };

  Game.prototype.kill = function (object) {
    object.dead = 1;
    this.score += Classes.points(object.cls);
  };

  Game.prototype.step = function () {
    var i, object, record, data = LevelData.allLevels[this.level];
    if (this.mode === 'won' || this.mode === 'over') { this.stepEnd(); return; }
    this.tick += 1;
    var wasDying = this.mode === 'dying';
    if (this.mode === 'play' || this.mode === 'dying') {
      if (!this.bossPresent()) this.scroll = (this.scroll + 1) % 512;
      // spawn
      if (this.waveIndex < data.waveRecords.length) {
        this.wait -= 1;
        while (this.wait <= 0 && this.waveIndex < data.waveRecords.length) {
          record = data.waveRecords[this.waveIndex++];
          spawnWave(this, record);
          this.wavesLeft -= 1;
          this.wait = record[5];
          if (this.wait > 0) break;
        }
      }
      // move and animate
      for (i = 0; i < this.objects.length; i++) {
        object = this.objects[i];
        if (object.dead) { object.dead += 1; continue; }
        object.age += 1;
        moveObject(this, object);
        var rate = Classes.fireRate(object.cls);
        if (rate && object.x <= 79 && object.x + object.w > 0 && nextRandom(this) < rate && this.countBullets() < 14) {
          addObject(this, CLASS_BULLET, object.x - 5, object.y + Math.floor(object.h / 2), { speed: 3 });
        }
      }
      this.objects = this.objects.filter(function (o) {
        if (o.gone) return false;
        if (o.dead) return o.dead <= ENEMY_EXPLOSION.length;
        if (Classes.isBoss(o.cls)) return true;
        if (o.cls !== CLASS_BULLET && Enemies.handles(o.vm)) return true;      // the decoded modes remove their objects themselves
        return o.x + (o.cls === CLASS_BULLET ? 2 : 0) >= 0;
      });
      // the ship's shots move first, then the held keys act
      this.weapons = Weapons.message(this.weapons, 1, this.ship);
      if (this.mode === 'play') this.heldKeys();
      this.shotsHit();
      if (this.mode === 'play') this.shipContact();
      if (this.mode === 'play' && this.guard > 0) this.guard -= 1;
    }
    if (wasDying) this.stepDying();
    else if (this.mode === 'dying') { /* the hit tick itself is stage 0 */ }
    else if (this.mode === 'play' && this.bossSeen && !this.bossPresent() && this.waveIndex >= data.waveRecords.length) this.beginClear();
    else if (this.mode === 'clear') this.stepClear();
  };

  Game.prototype.countBullets = function () {
    var n = 0;
    for (var i = 0; i < this.objects.length; i++) if (this.objects[i].cls === CLASS_BULLET && !this.objects[i].dead) n++;
    return n;
  };

  Game.prototype.heldKeys = function () {
    for (var key in this.held) {
      if (!Object.prototype.hasOwnProperty.call(this.held, key)) continue;
      this.held[key] += 1;
      if (MOVE_REPEAT[key] && this.held[key] >= REPEAT_AFTER) this.moveShip(MOVE_REPEAT[key]);
      else if (FIRE_REPEAT[key]) {
        this.fire(FIRE_REPEAT[key]);
        // The firmware accepts five repeat messages per press (counter 0x10a202); a held key goes on firing here
        // with a fresh press message, which restarts that counter. Holding fire is how the game is played.
        if (this.weapons.repeats >= 5) this.fire(FIRE[key]);
      }
    }
  };

  Game.prototype.shotsHit = function () {
    var shots = this.weapons.shots, kept = [];
    for (var s = 0; s < shots.length; s++) {
      var shot = shots[s], hitSomething = false;
      for (var i = 0; i < this.objects.length && !hitSomething; i++) {
        var o = this.objects[i];
        if (o.dead || Classes.isPickup(o.cls) || o.x >= 84) continue;
        if (shot.x + 2 > o.x && shot.x < o.x + o.w && shot.y >= o.y && shot.y < o.y + o.h) {
          hitSomething = true;
          o.hp -= 1;
          if (o.hp <= 0) this.kill(o);
        }
      }
      if (!hitSomething) kept.push(shot);
    }
    this.weapons = { cooldown: this.weapons.cooldown, repeats: this.weapons.repeats, shots: kept };
  };

  Game.prototype.shipContact = function () {
    var ship = { x: this.ship.x, y: this.ship.y, width: image(SHIP_FRAME).width, height: image(SHIP_FRAME).height, pages: pagesOf(SHIP_FRAME) };
    if (this.guard === 0) {
      var list = [];
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.dead) continue;
        var frame = o.cls === CLASS_BULLET ? BULLET_FRAME : frameOf(o);
        list.push({ id: o.id, class: o.cls === CLASS_BULLET ? CLASS_BULLET : o.cls, x: o.x & 255, y: o.y & 255, width: o.w, height: o.h, pages: pagesOf(frame) });
      }
      var result;
      try { result = Contact.shipContact(ship, list, { mode: 2, guard: 0 }); } catch (ignore) { result = { outcome: 'none' }; }
      if (result.outcome === 'pickup') {
        for (var j = 0; j < this.objects.length; j++) if (this.objects[j].id === result.object.id) this.objects.splice(j, 1);
        if (this.lives < MAX_LIVES) this.lives += 1; else this.score += 50;
      } else if (result.outcome === 'hit') {
        for (var k = 0; k < this.objects.length; k++) {
          if (this.objects[k].id === result.object.id && !Classes.isBoss(this.objects[k].cls)) this.objects[k].dead = 1;
        }
        this.beginDying();
        return;
      }
    }
    if (this.terrainContact()) this.beginDying();
  };

  Game.prototype.terrainContact = function () {
    return TerrainContact.hits(this.level + 1, this.scroll, { x: this.ship.x, y: this.ship.y,
      width: image(SHIP_FRAME).width, height: image(SHIP_FRAME).height, pages: pagesOf(SHIP_FRAME) });
  };

  Game.prototype.beginDying = function () {
    this.mode = 'dying'; this.modeTick = 0;
    this.emit(23); this.emit('vibration');
  };

  Game.prototype.stepDying = function () {
    this.modeTick += 1;
    if (this.modeTick < SHIP_EXPLOSION.length) return;
    this.lives -= 1;
    if (this.lives > 0) {
      this.ship = { x: START_X, y: START_Y }; this.guard = SHIELD_TICKS; this.mode = 'play'; this.modeTick = 0;
      this.weapons = Weapons.initial();
    } else { this.mode = 'over'; this.modeTick = 0; this.lives = 0; }
  };

  Game.prototype.beginClear = function () {
    this.mode = 'clear'; this.modeTick = 0;
    this.objects = [];
  };

  Game.prototype.stepClear = function () {
    this.modeTick += 1;
    if (this.modeTick < 16) { if (this.ship.y > PLAYFIELD_TOP) this.ship.y -= 1; }
    else this.ship.x += 3;
    this.weapons = Weapons.message(this.weapons, 1, this.ship);
    if (this.ship.x >= 93) {
      if (this.level + 1 >= LevelData.allLevels.length) { this.mode = 'won'; this.modeTick = 0; }
      else startLevel(this, this.level + 1);
    }
  };

  Game.prototype.stepEnd = function () {
    this.modeTick += 1;
    if (this.mode === 'over' && this.modeTick >= OVER_TICKS) this.result = { score: this.score };
    if (this.mode === 'won' && this.modeTick >= WON_TICKS) this.result = { score: this.score + 1000, won: true };
  };

  // ---- drawing -----------------------------------------------------------------------------------------------------
  Game.prototype.draw = function (fb) {
    fb.clear();
    var i, o, bytes, originY, bit;
    if (this.level >= 0) {
      bytes = Terrain.renderBytes(this.level + 1, this.scroll); originY = Terrain.originY(this.level + 1);
      for (var page = 0; page < 2; page++) for (var x = 0; x < 84; x++) {
        var value = bytes[page * 84 + x];
        for (bit = 0; bit < 8; bit++) if (value & (1 << bit)) fb.set(x, originY + page * 8 + bit, 1);
      }
    }
    for (i = 0; i < this.objects.length; i++) {
      o = this.objects[i];
      if (o.dead) Render.blit(fb, image(ENEMY_EXPLOSION[Math.min(o.dead - 1, ENEMY_EXPLOSION.length - 1)]), o.x, o.y, false);
      else Render.blit(fb, image(o.cls === CLASS_BULLET ? BULLET_FRAME : frameOf(o)), o.x, o.y, false);
    }
    for (i = 0; i < this.weapons.shots.length; i++) fb.fillRect(this.weapons.shots[i].x, this.weapons.shots[i].y, 2, 1, 1);
    if (this.mode === 'dying') Render.blit(fb, image(SHIP_EXPLOSION[Math.min(this.modeTick, SHIP_EXPLOSION.length - 1)]), this.ship.x, this.ship.y, false);
    else if (this.mode !== 'over') {
      Render.blit(fb, image(SHIP_FRAME), this.ship.x, this.ship.y, true);
      if (this.guard > 0 && this.mode === 'play') Render.blit(fb, image(SHIELD_FRAMES[this.tick % 2]), this.ship.x - 2, this.ship.y - 2, false);
    }
    fb.clearRect(0, 0, 84, 6);
    for (i = 0; i < this.lives && i < MAX_LIVES; i++) Render.blit(fb, image(HEART), i * 6, 0, true);
    if (Text) { try { Text.drawHeader(fb, String(this.score)); } catch (ignore) {} }
    return fb;
  };

  Game.prototype.drawNote = function (fb, lines) {
    if (!Text) return;
    for (var i = 0; i < lines.length; i++) {
      var x = Math.max(0, Math.floor((84 - Text.widthLargeEst(lines[i])) / 2));
      try { Text.drawNoteLine(fb, lines[i], x, 12 + i * 13); } catch (ignore) {}
    }
  };

  // ---- snapshot ----------------------------------------------------------------------------------------------------
  var KEYS = ['v', 'rng', 'level', 'tick', 'scroll', 'wavesLeft', 'wait', 'waveIndex', 'bossSeen', 'mode', 'modeTick', 'lives', 'score', 'guard', 'nextId'];

  Game.prototype.snapshot = function () {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) out[KEYS[i]] = this[KEYS[i]];
    out.ship = { x: this.ship.x, y: this.ship.y };
    out.weapons = { cooldown: this.weapons.cooldown, repeats: this.weapons.repeats, shots: this.weapons.shots.map(function (s) { return { x: s.x, y: s.y }; }) };
    out.objects = this.objects.map(function (o) {
      return { id: o.id, cls: o.cls, x: o.x, y: o.y, hp: o.hp, age: o.age, vm: o.vm, speed: o.speed, y0: o.y0, phase: o.phase, dir: o.dir, dead: o.dead, stop: o.stop, held: o.held };
    });
    return JSON.parse(JSON.stringify(out));
  };

  function isInt(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }

  function restore(snapshot) {
    var s = snapshot, i, o;
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    if (!Random.valid(s.rng) || !isInt(s.level, 0, LevelData.allLevels.length - 1) || !isInt(s.tick, 1, 1e9) ||
        !isInt(s.scroll, 0, 511) || !isInt(s.wavesLeft, -100, 100) || !isInt(s.wait, -100, 1000) || !isInt(s.waveIndex, 0, LevelData.allLevels[s.level].waveRecords.length) ||
        typeof s.bossSeen !== 'boolean' || ['play', 'dying', 'clear', 'over', 'won'].indexOf(s.mode) < 0 || !isInt(s.modeTick, 0, 1e6) ||
        !isInt(s.lives, 0, MAX_LIVES) || !isInt(s.score, 0, 1e9) || !isInt(s.guard, 0, SHIELD_TICKS) || !isInt(s.nextId, 1, 1e9)) return null;
    if (!s.ship || !isInt(s.ship.x, -10, 200) || !isInt(s.ship.y, -10, 100)) return null;
    var w = s.weapons;
    if (!w || !isInt(w.cooldown, 0, 2) || !isInt(w.repeats, 0, 100) || !Array.isArray(w.shots) || w.shots.length > 40) return null;
    for (i = 0; i < w.shots.length; i++) if (!w.shots[i] || !isInt(w.shots[i].x, -10, 200) || !isInt(w.shots[i].y, -10, 100)) return null;
    if (!Array.isArray(s.objects) || s.objects.length > MAX_OBJECTS) return null;
    for (i = 0; i < s.objects.length; i++) {
      o = s.objects[i];
      if (!o || !isInt(o.id, 1, 1e9) || !isInt(o.cls, 0, 255) || !Classes.known(o.cls) || !isInt(o.x, -200, 400) || !isInt(o.y, -50, 100) ||
          !isInt(o.hp, -100, 255) || !isInt(o.age, 0, 1e9) || !isInt(o.vm, 0, 255) || !isInt(o.speed, 0, 255) || !isInt(o.y0, -50, 100) ||
          !isInt(o.phase, 0, 255) || (o.dir !== 1 && o.dir !== -1) || !isInt(o.dead, 0, 20) || !isInt(o.stop, 0, 255) || !isInt(o.held, 0, 1e6)) return null;
    }
    var game = new Game({});
    for (i = 0; i < KEYS.length; i++) game[KEYS[i]] = s[KEYS[i]];
    game.rng = { spawn: s.rng.spawn, effects: s.rng.effects };
    game.ship = { x: s.ship.x, y: s.ship.y };
    game.weapons = { cooldown: w.cooldown, repeats: w.repeats, shots: w.shots.map(function (shot) { return { x: shot.x, y: shot.y }; }) };
    game.objects = s.objects.map(function (obj) {
      var size = sizeOf(obj.cls);
      return { id: obj.id, cls: obj.cls, x: obj.x, y: obj.y, w: size.w, h: size.h, hp: obj.hp, age: obj.age, vm: obj.vm, speed: obj.speed,
        y0: obj.y0, phase: obj.phase, dir: obj.dir, dead: obj.dead, stop: obj.stop, held: obj.held };
    });
    game.extra = [];
    return game;
  }

  ns.Engine = { create: function (seed) { return create(seed); }, restore: restore, startLevel: startLevel, TICK_MS: TICK_MS, Game: Game };
  if (typeof module === 'object' && module.exports) module.exports = ns.Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
