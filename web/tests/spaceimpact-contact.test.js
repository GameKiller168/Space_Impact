'use strict';

/*
 * Ship contact against the original player-contact routine (entry 0x259d30).
 *
 * tests/fixtures/spaceimpact-contact.json holds, for 16 scripted runs, the routine's inputs on every tick where
 * another object was near the ship, and whether the firmware then set its player-hit flag. The first group of tests
 * compares the model with that. The second group checks rules that were read from the disassembly and that the
 * recorded runs cannot tell apart (the guard word, the class filter, class 4 and the pickup classes); they pin the
 * module to that reading, they do not prove it against the firmware.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Contact = require('../js/spaceimpact-contact.js');
const { images } = require('../js/spaceimpact-assets.js');
const fixture = require('./fixtures/spaceimpact-contact.json');

const romPages = new Map();
for (const image of images) {
  if (!romPages.has(image.data)) romPages.set(image.data, Contact.pagesFromRows(image.rows));
}

function pagesOf(object) {
  if (object.pages !== undefined) return Contact.pagesFromHex(object.pages);
  assert.ok(romPages.has(object.data), `image ${object.data} is not in the extracted table`);
  return romPages.get(object.data);
}

// Evaluate one recorded tick. `options` can change how the data is read, to see whether the data would notice.
function verdict(tick, options = {}) {
  const ship = Object.assign({}, tick.ship, { pages: pagesOf(tick.ship) });
  const list = tick.objects.slice().sort((a, b) => a.order - b.order)
    .filter((object) => options.searchFromFirstEntry || object.order > tick.ship.order);
  const objects = list.map((object) => Object.assign({}, object, { pages: object.order > tick.ship.order ? pagesOf(object) : undefined }));
  const state = { mode: options.mode === undefined ? tick.mode : options.mode, guard: tick.guard };
  return Contact.shipContact(ship, objects, state).outcome;
}

function mismatches(options) {
  let count = 0;
  for (const scenario of fixture.scenarios) {
    for (const tick of scenario.ticks) {
      let outcome;
      try { outcome = verdict(tick, options); } catch (error) { outcome = 'error'; }
      if (outcome !== (tick.hit ? 'hit' : 'none')) count += 1;
    }
  }
  return count;
}

test('the model reproduces the firmware verdict on every recorded tick', () => {
  for (const scenario of fixture.scenarios) {
    const predicted = [];
    for (const tick of scenario.ticks) {
      const outcome = verdict(tick);
      assert.equal(outcome, tick.hit ? 'hit' : 'none', `${scenario.name}, tick ${tick.tick}`);
      if (outcome === 'hit') predicted.push(tick.tick);
    }
    assert.deepEqual(predicted, scenario.hit_ticks, scenario.name);
  }
});

test('the recorded runs cover hits, near misses, a second life, the terrain layer and the ship\'s own shots', () => {
  assert.equal(fixture.scenarios.length, 16);
  const ticks = fixture.scenarios.flatMap((scenario) => scenario.ticks);
  const classes = new Set(ticks.flatMap((tick) => tick.objects.map((object) => object.class)));
  for (const objectClass of [1, 2, 5, 8, 50]) assert.ok(classes.has(objectClass), `class ${objectClass}`);
  assert.equal(ticks.filter((tick) => tick.hit).length, 17);
  assert.ok(fixture.scenarios.some((scenario) => scenario.hit_ticks.length === 2));
  assert.ok(fixture.scenarios.some((scenario) => scenario.hit_ticks.length === 0 && scenario.ticks.length > 100));
  assert.ok(ticks.some((tick) => tick.guard !== 0) && ticks.some((tick) => tick.guard === 0));
  assert.deepEqual([...new Set(ticks.map((tick) => tick.mode))], [2]);
});

test('the recorded runs notice a wrong pixel polarity and a wrong search start', () => {
  assert.equal(mismatches({}), 0);
  assert.ok(mismatches({ mode: 1 }) > 0, 'collision mode 1 (both bits set) would not match the firmware');
  assert.ok(mismatches({ searchFromFirstEntry: true }) > 0, 'searching from the first list entry would not match');
});

test('mode 2 counts a pixel where both bitmaps are clear, mode 1 where both are set, other modes never', () => {
  const clear = { x: 0, y: 0, width: 2, height: 2, pages: Contact.pagesFromRows(['..', '..']) };
  const set = { x: 0, y: 0, width: 2, height: 2, pages: Contact.pagesFromRows(['##', '##']) };
  assert.equal(Contact.pixelContact(clear, clear, 2), true);
  assert.equal(Contact.pixelContact(set, clear, 2), false);
  assert.equal(Contact.pixelContact(set, set, 2), false);
  assert.equal(Contact.pixelContact(set, set, 1), true);
  assert.equal(Contact.pixelContact(clear, set, 1), false);
  assert.equal(Contact.pixelContact(clear, clear, 0), false);
  assert.equal(Contact.pixelContact(set, set, 3), false);
});

test('page bitmaps round-trip through rows, with the least significant bit on top', () => {
  const rows = ['#.', '.#', '..', '..', '..', '..', '..', '#.', '.#'];
  const pages = Contact.pagesFromRows(rows);
  assert.deepEqual(pages, [0x81, 0x02, 0x00, 0x01]);
  assert.deepEqual(Contact.pagesFromHex('810200ff'), [0x81, 0x02, 0x00, 0xff]);
});

// ---- rules read from the disassembly -------------------------------------------------------------------------------

const shipRows = Array(7).fill('..........');
const ship = { x: 5, y: 20, width: 10, height: 7, pages: Contact.pagesFromRows(shipRows) };
function other(properties, rows) {
  const width = properties.width === undefined ? rows[0].length : properties.width;
  return Object.assign({ class: 5, x: 5, y: 20, width, height: rows.length, pages: Contact.pagesFromRows(rows) }, properties);
}
const state = { mode: 2, guard: 0 };

test('the class filter ignores classes 0, 1, 2, 8, 9, 10, 0x16 and 0x24 and nothing else', () => {
  const ignored = [];
  for (let objectClass = 0; objectClass < 256; objectClass++) if (!Contact.collidable(objectClass)) ignored.push(objectClass);
  assert.deepEqual(ignored, [0, 1, 2, 8, 9, 10, 0x16, 0x24]);
  assert.equal(Contact.shipContact(ship, [other({ class: 8 }, ['..', '..'])], state).outcome, 'none');
  assert.equal(Contact.shipContact(ship, [other({ class: 5 }, ['..', '..'])], state).outcome, 'hit');
});

test('a non-zero guard word suppresses contact', () => {
  const touching = [other({ class: 5 }, ['..', '..'])];
  assert.equal(Contact.shipContact(ship, touching, { mode: 2, guard: 17 }).outcome, 'none');
  assert.equal(Contact.shipContact(ship, touching, { mode: 2, guard: 0 }).outcome, 'hit');
});

test('only the first entry whose box touches the ship is examined, even when its pixels miss', () => {
  const miss = other({ class: 5 }, ['##', '##']);
  const would = other({ class: 5 }, ['..', '..']);
  const result = Contact.shipContact(ship, [miss, would], state);
  assert.equal(result.outcome, 'none');
  assert.equal(result.object, miss);
  assert.equal(Contact.shipContact(ship, [would, miss], state).outcome, 'hit');
});

test('box edges count as touching; class 4 needs no pixel contact, other classes need pixel overlap', () => {
  const edge = { x: 15, y: 20, width: 3, height: 3, pages: Contact.pagesFromRows(['...', '...', '...']) };
  assert.equal(Contact.boxesTouch(ship, edge), true);
  assert.equal(Contact.boxesTouch(ship, Object.assign({}, edge, { x: 16 })), false);
  assert.equal(Contact.boxesTouch(ship, Object.assign({}, edge, { x: 15, y: 27 })), true);
  assert.equal(Contact.boxesTouch(ship, Object.assign({}, edge, { x: 15, y: 28 })), false);
  assert.equal(Contact.shipContact(ship, [Object.assign({ class: 4 }, edge)], state).outcome, 'hit');
  assert.equal(Contact.shipContact(ship, [Object.assign({ class: 5 }, edge)], state).outcome, 'none');
});

test('classes 0x11 and 0x21 are pickups, not hits', () => {
  for (const objectClass of [0x11, 0x21]) {
    const result = Contact.shipContact(ship, [other({ class: objectClass }, ['..', '..'])], state);
    assert.equal(result.outcome, 'pickup');
  }
  assert.equal(Contact.shipContact(ship, [other({ class: 0x11 }, ['##', '##'])], state).outcome, 'none');
});

test('the other object\'s box is read as signed bytes and its bitmap bytes are never guessed', () => {
  const left = { class: 4, x: 254, y: 20, width: 11, height: 3, pages: Contact.pagesFromRows(['...........', '...........', '...........']) };
  assert.equal(Contact.boxesTouch(ship, left), true, 'x = 254 is -2 and reaches the ship');
  assert.equal(Contact.shipContact(ship, [left], state).outcome, 'hit');
  assert.throws(() => Contact.shipContact(ship, [Object.assign({}, left, { class: 5 })], state), RangeError);
  assert.throws(() => Contact.shipContact(ship, [other({ class: 5, pages: [] }, ['..'])], state), RangeError);
});
