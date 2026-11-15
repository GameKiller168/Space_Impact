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
 * shoot, the boss routines, points for classes that were never seen shot, pickup flight, some bonus targeting and
 * collisions, the final boss's turrets, and the level-end sequence's exact motion.
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
  var Pickups = ns.Pickups || (req ? require('./spaceimpact-pickups.js') : null);
  var Bonus = ns.Bonus || (req ? require('./spaceimpact-bonus.js') : null);
  var Font = common.Font || (req ? require('./font.js') : null);
  var Controls = ns.Controls || (req ? require('./spaceimpact-controls.js') : null);
  var Weapons = ns.Weapons || (req ? require('./spaceimpact-weapons.js') : null);
  var Render = ns.Render || (req ? require('./spaceimpact-render.js') : null);
  var Classes = ns.Classes || (req ? require('./spaceimpact-classes.js') : null);
  var Random = ns.Random || (req ? require('./spaceimpact-random.js') : null);
  var Enemies = ns.Enemies || (req ? require('./spaceimpact-enemies.js') : null);
  var Fire = ns.Fire || (req ? require('./spaceimpact-fire.js') : null);
  var EnemyHits = ns.EnemyHits || (req ? require('./spaceimpact-enemy-hits.js') : null);
  var Bosses = ns.Bosses || (req ? require('./spaceimpact-bosses.js') : null);
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
  function blitIndex(fb, index, x, y, opaque) { return Render.blit(fb, images[index], x, y, opaque, Render.NEGATIVE[index] === true); }
  function shipPicture(level) { return level === 0 ? 0 : 1; }          // the ship has its own picture on level 1
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
      y0: y, phase: 0, dir: 1, dead: 0, stop: 0, held: 0, div: 0, ammo: 0 };
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
        phase: 0, dir: vm === 24 ? -1 : (cls & 1) ? -1 : 1, stop: boss ? Classes.stopX(cls) : 0, div: record[7], ammo: record[8] });
      if (object && boss) { game.bossSeen = true; game.bossState = 1; }
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

  // what the boss routines need from the engine: the size and the touch test of the picture the boss shows on this tick
  function bossFrame(object) {
    var list = Classes.frames(object.cls);
    return list[object.age % list.length];
  }
  // what a new object does to the display list: the firmware takes the next entry before it handles the current one, and a new
  // object stands at the end of its layer, so it is reached on the same tick unless its shooter was the last entry: then it comes
  // right behind it and waits for the next tick.
  var SPECIAL_SHOTS = { 21: { hp: 2, vm: 3, speed: 3 }, 16: { hp: 1, vm: 6, speed: 2 }, 14: { hp: 1, vm: 6, speed: 2 }, 6: { hp: 1, vm: 14, speed: 2 } };
  function makeObject(game, shooter, cls, x, y, extra) {
    var lastOne = game.objects.indexOf(shooter) === game.objects.length - 1;
    var made = addObject(game, cls, x, y, extra);
    if (made && lastOne) made.skip = 1;
    return made;
  }
  function bossContext(game) {
    return {
      size: function (o) { var img = image(bossFrame(o)); return { w: img.width, h: img.height }; },
      classSize: function (cls) { return sizeOf(cls); },
      terrainHit: function (o, y, size) {
        return TerrainContact.hits(game.level + 1, game.scroll, { x: o.x, y: y, width: size.w, height: size.h, pages: pagesOf(bossFrame(o)) }, true);
      },
      check: function (o) { return Fire.check(game.rng, o); },
      fire: function (o, y, h) {
        if (!Fire.check(game.rng, o)) return;
        var shot = Fire.shoot({ x: o.x, y: y, h: h, cls: o.cls, ammo: o.ammo, shootY: -1 });
        if (shot) makeObject(game, o, CLASS_BULLET, shot.x, shot.y, { speed: 3 });
      },
      spawn: function (o, cls, x, y) {
        var t = SPECIAL_SHOTS[cls];
        makeObject(game, o, cls, x, y, { hp: t.hp, vm: t.vm, speed: t.speed, y0: y, div: 127, ammo: 0 });
      }
    };
  }

  function moveObject(game, object) {
    var boss = Classes.isBoss(object.cls);
    if (object.cls === CLASS_BULLET) { object.x -= 3; return; }
    if (boss) {
      if (Bosses.step(game, object, bossContext(game))) return;
      object.shoot = undefined;
      if (object.x > object.stop) { object.x -= Math.max(1, object.speed); return; }
      var bottom = 48 - object.h;
      object.y += object.dir;
      if (object.y <= PLAYFIELD_TOP) { object.y = PLAYFIELD_TOP; object.dir = 1; }
      if (object.y >= bottom) { object.y = bottom; object.dir = -1; }
      return;
    }
    if (object.vm === 24) object.dir = game.bossDir;
    var decoded = Enemies.step(object, game.level, game.ship.y);
    if (object.vm === 24) game.bossDir = object.dir;
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
      mode: 'play', modeTick: 0, ship: { x: START_X, y: START_Y }, lives: START_LIVES, score: 0, guard: SHIELD_TICKS, guardDelay: false, clearArrive: 0, bossDir: -1, bossState: 1, bossCool: 0,
      weapons: Weapons.initial(), bonus: { type: 10, ammo: 3, shots: [] }, objects: [], nextId: 1, extra: [] };
  }

  function startLevel(game, index) {
    var data = LevelData.allLevels[index];
    game.level = index; game.tick = 1; game.wavesLeft = data.waveRecords.length; game.wait = FIRST_WAVE_WAIT;
    game.waveIndex = 0; game.bossSeen = false; game.objects = []; game.extra = [];
    game.ship = { x: START_X, y: START_Y }; game.guard = SHIELD_TICKS; game.guardDelay = false; game.mode = 'play'; game.modeTick = 0;
    game.weapons = Weapons.initial();
    game.bonus.shots = [];
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
    if (code === 13 || code === 15) {
      var fired = Bonus.message(this.bonus, code, this.ship, this.weapons.cooldown, this.level + 1);
      this.bonus = fired.state; this.weapons.cooldown = fired.cooldown;
      if (fired.event) this.emit(fired.event);
      return;
    }
    var before = this.weapons.shots.length;
    this.weapons = Weapons.message(this.weapons, code, this.ship);
    if (this.weapons.shots.length > before && (code === 10 || code === 12)) this.emit(24);
  };

  var MOVE = { '8': 17, '0': 9, '*': 22, '#': 20 }, MOVE_REPEAT = { '8': 145, '0': 137, '*': 150, '#': 148 };
  var FIRE = { '1': 10, '3': 12, '4': 13, '6': 15, fireMain: 10, fireBonus: 13 }, FIRE_REPEAT = { '1': 138, '3': 140, fireMain: 138 };

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
    if (!Classes.isBoss(object.cls)) object.killFrame = Classes.frames(object.cls)[object.age % Classes.frames(object.cls).length];
    object.dead = 1;
    if (Classes.isBoss(object.cls)) this.score += Classes.points(object.cls);     // boss points are an estimate
  };

  Game.prototype.step = function () {
    var i, object, record, terrainScroll = this.scroll, data = LevelData.allLevels[this.level];
    if (this.mode === 'won' || this.mode === 'over') { this.stepEnd(); return; }
    this.tick += 1;
    var wasDying = this.mode === 'dying';
    if (this.mode === 'play' || this.mode === 'dying') {
      // the terrain stops when the last wave has been sent and the boss is there (level 6 keeps scrolling until its two empty records are used up)
      if (!(this.bossPresent() && this.wavesLeft <= 0)) this.scroll = (this.scroll + 1) % 512;
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
        if (object.skip) { object.skip = 0; continue; }        // a bullet made right behind its shooter is not reached on that tick
        object.age += 1;
        moveObject(this, object);
        if (object.cls === CLASS_BULLET) {
          /* bullets do not shoot */
        } else if (Enemies.handles(object.vm) || (Classes.isBoss(object.cls) && object.shoot !== undefined)) {
          // an ordinary enemy shoots by the firmware's rule: the movement mode says when the check runs
          if (!object.gone && (object.shoot === 2 || (object.shoot === 1 && Fire.check(this.rng, object)))) {
            var shot = Fire.shoot(object);
            if (shot) {
              makeObject(this, object, CLASS_BULLET, shot.x, shot.y, { speed: 3 });
            }
          }
        } else {
          var rate = Classes.fireRate(object.cls);
          if (rate && object.x <= 79 && object.x + object.w > 0 && nextRandom(this) < rate && this.countBullets() < 14) {
            addObject(this, CLASS_BULLET, object.x - 5, object.y + Math.floor(object.h / 2), { speed: 3 });
          }
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
      this.bonus = Bonus.message(this.bonus, 1, this.ship, this.weapons.cooldown, this.level + 1, this.objects).state;
      if (this.mode === 'play') this.heldKeys();
      this.shotsHit();
      if (this.mode === 'play' && this.guard > 0) {
        if (this.guardDelay) this.guardDelay = false; else this.guard -= 1;
      }
      if (this.mode === 'play') this.shipContact(terrainScroll);
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
      else if (FIRE[key] === 13 || FIRE[key] === 15) this.fire(FIRE[key]);
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
        if (o.dead || Classes.isPickup(o.cls) || !EnemyHits.collidable(o.cls)) continue;
        if (Classes.isBoss(o.cls)) {
          // the boss path is still the engine's own: a box test and one hit point per shot
          if (o.x >= 84 || !(shot.x + 2 > o.x && shot.x < o.x + o.w && shot.y >= o.y && shot.y < o.y + o.h)) continue;
          hitSomething = true;
          o.hp -= 1;
          if (o.hp <= 0) this.kill(o); else this.score = EnemyHits.addScore(this.score, 5);   // a boss hit scores 5, the kill 100
        } else if (EnemyHits.touches({ x: shot.x, y: shot.y, w: 2, h: 1 }, o)) {
          // ordinary enemies: the firmware's rule, first object whose box touches the shot (see spaceimpact-enemy-hits.js)
          hitSomething = true;
          var target = { hp: o.hp, noScore: Classes.noScore(o.cls) };
          var result = EnemyHits.damage(target, this.score);
          o.hp = target.hp;
          this.score = result.score;
          if (result.killed) this.kill(o);
        }
      }
      if (!hitSomething) kept.push(shot);
    }
    this.weapons = { cooldown: this.weapons.cooldown, repeats: this.weapons.repeats, shots: kept };
    // Ordinary-target damage and sweep radius match isolated oracle cases; boss interactions remain estimates.
    var remaining = [];
    for (s = 0; s < this.bonus.shots.length; s++) {
      var shotBonus = this.bonus.shots[s], shape = Bonus.display(shotBonus), consumed = false;
      for (i = 0; i < this.objects.length; i++) {
        o = this.objects[i];
        if (o.dead || !Contact.collidable(o.cls)) continue;
        if (shotBonus.type === 22) {
          if (Math.abs(o.x - shape.x) > 3) continue;
          if (Classes.isPickup(o.cls)) { this.collectPickup(o); i--; continue; }
          if (Classes.isBoss(o.cls)) { o.hp -= 2; if (o.hp <= 0) { o.hp = 0; o.dead = 1; } }
          else { o.hp = 0; o.dead = 1; }
          this.score += 10;
        } else if (!Classes.isPickup(o.cls) && shape.x <= o.x + o.w && shape.x + shape.width >= o.x &&
                   shape.y <= o.y + o.h && shape.y + shape.height >= o.y) {
          o.hp = Math.max(0, o.hp - 4);
          if (!o.hp) { o.dead = 1; this.score += 10; } else this.score += 5;
          if (shotBonus.type === 10) consumed = true;
          break;
        }
      }
      if (!consumed) remaining.push(shotBonus);
    }
    this.bonus.shots = remaining;
  };

  Game.prototype.collectPickup = function (object) {
    var index = this.objects.indexOf(object), game = this;
    if (index >= 0) this.objects.splice(index, 1);
    var reward = Pickups.apply({ lives: this.lives, type: this.bonus.type, ammo: this.bonus.ammo }, object.cls, function () { return randomInt(game, 4); });
    this.lives = reward.lives; this.bonus.type = reward.type; this.bonus.ammo = reward.ammo;
    if (reward.event) this.emit(reward.event);
  };

  Game.prototype.shipContact = function (terrainScroll) {
    var shipFrame = this.level === 0 ? 0 : 1;
    var ship = { x: this.ship.x, y: this.ship.y, width: image(shipFrame).width, height: image(shipFrame).height, pages: pagesOf(shipFrame) };
    var terrainHit = TerrainContact.hits(this.level + 1, terrainScroll === undefined ? this.scroll : terrainScroll, ship);
    if (terrainHit) this.beginDying();
    if (this.guard === 0 && !terrainHit) {
      var list = [];
      for (var i = 0; i < this.objects.length; i++) {
        var o = this.objects[i];
        if (o.dead) continue;
        var frame = o.cls === CLASS_BULLET ? BULLET_FRAME : frameOf(o);
        list.push({ id: o.id, class: o.cls === CLASS_BULLET ? CLASS_BULLET : o.cls, x: o.x & 255, y: o.y & 255, width: o.w, height: o.h, pages: pagesOf(frame) });
      }
      var result;
      try { result = Contact.shipContact(ship, list, { mode: LevelData.allLevels[this.level].descriptor[13], guard: 0 }); } catch (ignore) { result = { outcome: 'none' }; }
      if (result.outcome === 'pickup') {
        for (var j = 0; j < this.objects.length; j++) if (this.objects[j].id === result.object.id) { this.collectPickup(this.objects[j]); break; }
      } else if (result.outcome === 'hit') {
        for (var k = 0; k < this.objects.length; k++) {
          if (this.objects[k].id === result.object.id) {
            this.objects[k].hp = (this.objects[k].hp - 1) & 255;
            if (this.objects[k].hp === 0) {
              this.objects[k].dead = 1;
              if (!Classes.isBoss(this.objects[k].cls)) this.score += 10;
            }
          }
        }
        this.beginDying();
        return;
      }
    }
    if (this.guard > 0) {
      var shieldFrame = SHIELD_FRAMES[(this.tick + 1) % 2], shieldImage = image(shieldFrame);
      var shield = { x: this.ship.x - 2, y: this.ship.y - 2, width: shieldImage.width, height: shieldImage.height, pages: pagesOf(shieldFrame) };
      if (TerrainContact.hits(this.level + 1, terrainScroll === undefined ? this.scroll : terrainScroll, shield))
        this.ship.y += (this.level === 4 || this.level === 5) ? 2 : -2;
    }
  };

  Game.prototype.terrainContact = function () {
    var frame = this.level === 0 ? 0 : 1;
    return TerrainContact.hits(this.level + 1, this.scroll, { x: this.ship.x, y: this.ship.y,
      width: image(frame).width, height: image(frame).height, pages: pagesOf(frame) });
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
      this.ship = { x: START_X, y: START_Y }; this.guard = SHIELD_TICKS; this.guardDelay = true; this.mode = 'play'; this.modeTick = 0;
      this.weapons = Weapons.initial();
    } else { this.mode = 'over'; this.modeTick = 0; this.lives = 0; }
  };

  // The level end, read from the firmware's recordings of all seven levels that have a next level: after the boss is gone the
  // ship flies one pixel per tick to the top row (y 6, or 16 on the two levels with terrain above), stays there for one more
  // tick, then flies right with these x positions, one per tick; the tick after the last one the next level starts.
  var CLEAR_X = [6, 8, 10, 12, 15, 19, 23, 27, 32, 37, 42, 48, 55, 62, 69, 77, 85, 93, 102];

  Game.prototype.beginClear = function () {
    this.mode = 'clear'; this.modeTick = 0; this.clearArrive = 0;
    this.objects = [];
  };

  Game.prototype.stepClear = function () {
    this.modeTick += 1;
    var top = (this.level === 4 || this.level === 5) ? 16 : PLAYFIELD_TOP;
    if (this.ship.y !== top) {
      this.ship.y += this.ship.y > top ? -1 : 1;
      if (this.ship.y === top) this.clearArrive = this.modeTick;
    } else {
      var index = this.modeTick - this.clearArrive - 2;
      if (index >= 0 && index < CLEAR_X.length) this.ship.x = CLEAR_X[index];
      else if (index >= CLEAR_X.length) {
        if (this.level + 1 >= LevelData.allLevels.length) { this.mode = 'won'; this.modeTick = 0; }
        else startLevel(this, this.level + 1);
      }
    }
    this.weapons = Weapons.message(this.weapons, 1, this.ship);
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
      if (o.dead) blitIndex(fb, o.killFrame !== undefined && o.killFrame >= 0 ? EnemyHits.explosionFrame(o.killFrame, Math.min(o.dead, ENEMY_EXPLOSION.length)) : ENEMY_EXPLOSION[Math.min(o.dead - 1, ENEMY_EXPLOSION.length - 1)], o.x, o.y, false);
      else blitIndex(fb, o.cls === CLASS_BULLET ? BULLET_FRAME : frameOf(o), o.x, o.y, false);
    }
    for (i = 0; i < this.bonus.shots.length; i++) {
      var bonusShot = this.bonus.shots[i], visual = Bonus.display(bonusShot);
      if (bonusShot.type === 22) fb.fillRect(visual.x, visual.y, 1, Math.max(0, visual.endY - visual.y), 1);
      else {
        var spriteIndex = bonusShot.type === 10 ? 8 : (bonusShot.age === 0 ? 10 : (bonusShot.age === 1 || bonusShot.age === 5 ? 11 : 12));
        blitIndex(fb, spriteIndex, visual.x, visual.y, false);
      }
    }
    for (i = 0; i < this.weapons.shots.length; i++) fb.fillRect(this.weapons.shots[i].x, this.weapons.shots[i].y, 2, 1, 1);
    if (this.mode === 'dying') blitIndex(fb, SHIP_EXPLOSION[Math.min(this.modeTick, SHIP_EXPLOSION.length - 1)], this.ship.x, this.ship.y, false);
    else if (this.mode !== 'over') {
      blitIndex(fb, shipPicture(this.level), this.ship.x, this.ship.y, false);
      if (this.guard > 0 && this.mode === 'play') blitIndex(fb, SHIELD_FRAMES[this.tick % 2], this.ship.x - 2, this.ship.y - 2, false);
    }
    // 0x257798 lays out the HUD at y=0, or y=43 when the terrain is above the ship.
    var hudY = (this.level === 4 || this.level === 5) ? 43 : 0;
    fb.clearRect(0, hudY, 84, 5);
    for (i = 0; i < this.lives && i < MAX_LIVES; i++) blitIndex(fb, HEART, i * 6, hudY, true);
    blitIndex(fb, this.bonus.type === 10 ? 81 : (this.bonus.type === 9 ? 82 : 83), 36, hudY, true);
    if (Font) {
      var ammo = Math.max(0, this.bonus.ammo) % 100;
      Font.drawDigit(fb, Math.floor(ammo / 10), 42, hudY); Font.drawDigit(fb, ammo % 10, 46, hudY);
      for (i = 0; i < 5; i++) Font.drawDigit(fb, Math.floor(this.score / Math.pow(10, 4 - i)) % 10, 56 + i * 4, hudY);
    }
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
  var KEYS = ['v', 'rng', 'level', 'tick', 'scroll', 'wavesLeft', 'wait', 'waveIndex', 'bossSeen', 'mode', 'modeTick', 'lives', 'score', 'guard', 'guardDelay', 'nextId', 'clearArrive', 'bossDir', 'bossState', 'bossCool'];

  Game.prototype.snapshot = function () {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) out[KEYS[i]] = this[KEYS[i]];
    out.ship = { x: this.ship.x, y: this.ship.y };
    out.bonus = { type: this.bonus.type, ammo: this.bonus.ammo, shots: this.bonus.shots.map(function (s) {
      return { type: s.type, x: s.x, y: s.y, age: s.age, endY: s.endY };
    }) };
    out.weapons = { cooldown: this.weapons.cooldown, repeats: this.weapons.repeats, shots: this.weapons.shots.map(function (s) { return { x: s.x, y: s.y }; }) };
    out.objects = this.objects.map(function (o) {
      return { id: o.id, cls: o.cls, x: o.x, y: o.y, hp: o.hp, age: o.age, vm: o.vm, speed: o.speed, y0: o.y0, phase: o.phase, dir: o.dir, dead: o.dead, stop: o.stop, held: o.held, div: o.div, ammo: o.ammo, killFrame: o.killFrame === undefined ? -1 : o.killFrame };
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
    if (s.guardDelay !== undefined && typeof s.guardDelay !== 'boolean') return null;
    if (s.bossState === undefined) s.bossState = 1;
    if (s.bossCool === undefined) s.bossCool = 0;
    if (!isInt(s.bossState, 0, 127) || !isInt(s.bossCool, 0, 6)) return null;
    if (s.bossDir === undefined) s.bossDir = -1;
    if (s.bossDir !== 1 && s.bossDir !== -1) return null;
    if (s.clearArrive === undefined) s.clearArrive = 0;
    if (!isInt(s.clearArrive, 0, 1e6)) return null;
    if (!s.ship || !isInt(s.ship.x, -10, 200) || !isInt(s.ship.y, -10, 100)) return null;
    var bonus = s.bonus === undefined ? { type: 10, ammo: 3, shots: [] } : s.bonus;
    if (!bonus || [9, 10, 22].indexOf(bonus.type) < 0 || !isInt(bonus.ammo, -128, 127) || !Array.isArray(bonus.shots) || bonus.shots.length > 40) return null;
    for (i = 0; i < bonus.shots.length; i++) {
      var b = bonus.shots[i];
      if (!b || [9, 10, 22].indexOf(b.type) < 0 || !isInt(b.x, 0, 255) || !isInt(b.y, -10, 100) || !isInt(b.age, 0, 1e9) || !isInt(b.endY, 0, 48)) return null;
    }
    var w = s.weapons;
    if (!w || !isInt(w.cooldown, 0, 2) || !isInt(w.repeats, 0, 100) || !Array.isArray(w.shots) || w.shots.length > 40) return null;
    for (i = 0; i < w.shots.length; i++) if (!w.shots[i] || !isInt(w.shots[i].x, -10, 200) || !isInt(w.shots[i].y, -10, 100)) return null;
    if (!Array.isArray(s.objects) || s.objects.length > MAX_OBJECTS) return null;
    for (i = 0; i < s.objects.length; i++) {
      o = s.objects[i];
      if (!o || !isInt(o.id, 1, 1e9) || !isInt(o.cls, 0, 255) || !Classes.known(o.cls) || !isInt(o.x, -200, 400) || !isInt(o.y, -50, 100) ||
          !isInt(o.hp, -100, 255) || !isInt(o.age, 0, 1e9) || !isInt(o.vm, 0, 255) || !isInt(o.speed, 0, 255) || !isInt(o.y0, -50, 100) ||
          !isInt(o.phase, 0, 255) || (o.dir !== 1 && o.dir !== -1) || !isInt(o.dead, 0, 20) || !isInt(o.stop, 0, 255) || !isInt(o.held, 0, 1e6) ||
          !isInt(o.div, 0, 255) || !isInt(o.ammo, 0, 255) ||
          (o.killFrame !== undefined && !isInt(o.killFrame, -1, images.length - 1))) return null;
    }
    var game = new Game({});
    for (i = 0; i < KEYS.length; i++) game[KEYS[i]] = s[KEYS[i]];
    game.rng = { spawn: s.rng.spawn, effects: s.rng.effects };
    game.guardDelay = s.guardDelay === true;
    game.ship = { x: s.ship.x, y: s.ship.y };
    game.bonus = { type: bonus.type, ammo: bonus.ammo, shots: bonus.shots.map(function (b) {
      return { type: b.type, x: b.x, y: b.y, age: b.age, endY: b.endY };
    }) };
    game.weapons = { cooldown: w.cooldown, repeats: w.repeats, shots: w.shots.map(function (shot) { return { x: shot.x, y: shot.y }; }) };
    game.objects = s.objects.map(function (obj) {
      var size = sizeOf(obj.cls);
      return { id: obj.id, cls: obj.cls, x: obj.x, y: obj.y, w: size.w, h: size.h, hp: obj.hp, age: obj.age, vm: obj.vm, speed: obj.speed,
        y0: obj.y0, phase: obj.phase, dir: obj.dir, dead: obj.dead, stop: obj.stop, held: obj.held, div: obj.div, ammo: obj.ammo, killFrame: obj.killFrame === undefined ? -1 : obj.killFrame };
    });
    game.extra = [];
    return game;
  }

  ns.Engine = { create: function (seed) { return create(seed); }, restore: restore, startLevel: startLevel, TICK_MS: TICK_MS, Game: Game };
  if (typeof module === 'object' && module.exports) module.exports = ns.Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
