import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunSeed, createSeededRandom } from '../src/game/run-random.ts';

test('run seeds retain the complete unsigned 32-bit entropy range, including zero', () => {
  for (const [entropy, expected] of [
    [0, 0],
    [-1, 4294967295],
    [4294967301, 5],
  ]) {
    assert.equal(
      createRunSeed(undefined, () => entropy),
      expected,
    );
  }
});

test('repeated entropy cannot repeat the immediately previous run seed', () => {
  let previous: number | undefined;
  for (let run = 0; run < 12; run++) {
    const seed = createRunSeed(previous, () => 17);
    assert.notEqual(seed, previous);
    previous = seed;
  }
});

test('duplicate avoidance wraps within the unsigned 32-bit range', () => {
  assert.equal(
    createRunSeed(4294967295, () => 4294967295),
    0,
  );
});

test('default run seeds use browser crypto entropy', (t) => {
  t.mock.method(globalThis.crypto, 'getRandomValues', (values: Uint32Array) => {
    values[0] = 3141592653;
    return values;
  });
  t.mock.method(Math, 'random', () => 0.5);
  assert.equal(createRunSeed(), 3141592653);
});

test('run seeds fall back when browser crypto is unavailable', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  t.mock.method(Math, 'random', () => 0.5);
  try {
    assert.equal(createRunSeed(), 2147483648);
    assert.equal(createRunSeed(2147483648), 2147483649);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
});

test('run seeds fall back when browser crypto rejects the entropy request', (t) => {
  t.mock.method(globalThis.crypto, 'getRandomValues', () => {
    throw new Error('entropy unavailable');
  });
  t.mock.method(Math, 'random', () => 0.25);
  assert.equal(createRunSeed(), 1073741824);
});

test('seeded runs preserve the existing Mulberry32 sequence, including seed zero', () => {
  const random = createSeededRandom(0);
  assert.deepEqual(
    Array.from({ length: 4 }, () => Math.floor(random() * 4294967296)),
    [1144304738, 1416247, 958946056, 627933444],
  );
});

test('equal explicit seeds replay independently while different seeds diverge', () => {
  const first = createSeededRandom(123);
  const replay = createSeededRandom(123);
  const other = createSeededRandom(124);
  const sample = (random: () => number) => Array.from({ length: 20 }, random);
  const original = sample(first);
  assert.deepEqual(sample(replay), original);
  assert.notDeepEqual(sample(other), original);
  assert.ok(original.every((value) => value >= 0 && value < 1));
});
