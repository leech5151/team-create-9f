import test from 'node:test';
import assert from 'node:assert/strict';

import { laneCountFor } from './assign';

const members = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `m${index + 1}`,
  name: `Member ${index + 1}`,
  avg: 150,
  gender: index % 2 === 0 ? '남' : '여',
}));

test('lane count stays even and never exceeds 3 players per lane', () => {
  assert.equal(laneCountFor(members(6)), 2);
  assert.equal(laneCountFor(members(10)), 4);
  assert.equal(laneCountFor(members(20)), 8);
  assert.equal(laneCountFor(members(21)), 8);
});
