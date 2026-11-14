'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const levels = require('../js/spaceimpact-levels.js');

// Hashes are from the original ROM through the firmware startup pointer table:
// SHA-256 of each 16-byte descriptor followed by its exact 12-byte records.
const expected = [
  ['0x00312084', '0x00311820', 20, '7609070e232d949e446c2402d805d98bcf3337a01bdbdbf46277fa0080559ac6'],
  ['0x00312094', '0x00311910', 23, '6de2cee30fe3eb7b46ceb36c3bb5105e93f08a9957ea1294835a0b631cbc9689'],
  ['0x003120a4', '0x00311a24', 23, '9344a96306b30820eb8788c2aca4a20fa5dd981b41faf991d39f88f67deab9ab'],
  ['0x003120b4', '0x00311b38', 20, 'ae0ef11fddc2b3837a205b15ba5af7e979e741552772e2568dc465911da6df0e'],
  ['0x003120c4', '0x00311c28', 19, '76d57bf98ec1858b30846506222a7fa0c35e10f1716d65dc99ac826e861e36be'],
  ['0x003120d4', '0x00311d0c', 40, 'b225f2b03a38dd70643b28ddae8a287e251b66d398dac87502fa7ad10c4fdd9f'],
  ['0x003120e4', '0x00311eec', 28, 'a9561ac63b4ad550a09c89072bed36942fe278ef477a691a9240938501e1f576'],
  ['0x003120f4', '0x0031203c', 6, 'e442f707826c0f449af8db4b48c59720be43bb80bcf4e835cd7c0a173b6b3fa9']
];

test('all eight descriptors and 179 wave records preserve the firmware bytes', () => {
  assert.equal(levels.allLevels.length, 8);
  assert.equal(levels.firstLevel, levels.allLevels[0]);
  let total = 0;
  for (let i = 0; i < expected.length; i++) {
    const level = levels.allLevels[i];
    const [descriptorAddress, tableAddress, count, sha256] = expected[i];
    assert.equal(level.descriptorAddress, descriptorAddress);
    assert.equal(level.waveTableAddress, tableAddress);
    assert.equal(level.descriptor.length, 16);
    assert.equal(level.descriptor[0], count);
    assert.equal(Buffer.from(level.descriptor).readUInt32BE(4), Number(tableAddress));
    assert.equal(level.waveRecords.length, count);
    assert.ok(level.waveRecords.every((row) => row.length === 12));
    const bytes = Buffer.from([...level.descriptor, ...level.waveRecords.flat()]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `level ${i + 1}`);
    total += count;
  }
  assert.equal(total, 179);
});
