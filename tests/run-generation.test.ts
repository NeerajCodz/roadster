import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAYER_BODY } from '../src/game/road-layout.ts';
import {
  difficultyFor,
  directionForLane,
  roadFor,
  sanitizeRunOptions,
} from '../src/game/run-settings.ts';
import { TRAFFIC_CATALOG, trafficBounds } from '../src/game/traffic-catalog.ts';

const modulePromise = import('../src/game/run-generation.ts').catch(() => null);
const generator = async () => {
  const generation = await modulePromise;
  assert.ok(generation, 'run generation helpers must be available');
  return generation;
};
const randomFor = (seed: number) => {
  seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

test('seeded opening layouts replay while every placement dimension varies across seeds', async () => {
  const { generateOpening } = await generator();
  const options = sanitizeRunOptions({ mode: 'normal', difficulty: 'medium', laneCount: 5 });
  const signatures = new Set<string>(),
    trailLanes = new Set<number>(),
    trailStarts = new Set<number>(),
    trailCounts = new Set<number>(),
    npcLanes = new Set<string>(),
    npcDepths = new Set<string>(),
    rampLanes = new Set<number>(),
    rampDepths = new Set<number>();
  for (let seed = 0; seed < 64; seed++) {
    const opening = generateOpening(options, randomFor(seed));
    assert.deepEqual(opening, generateOpening(options, randomFor(seed)));
    signatures.add(JSON.stringify(opening));
    const bolts = opening.filter((entity) => entity.kind === 'pickup');
    const traffic = opening.filter((entity) => entity.kind === 'traffic');
    const ramp = opening.find((entity) => entity.kind === 'ramp')!;
    trailLanes.add(bolts[0].lane);
    trailStarts.add(bolts[0].z);
    trailCounts.add(bolts.length);
    npcLanes.add(traffic.map((entity) => entity.lane).join(','));
    npcDepths.add(traffic.map((entity) => entity.z).join(','));
    rampLanes.add(ramp.lane);
    rampDepths.add(ramp.z);
  }
  assert.equal(signatures.size, 64);
  for (const values of [
    trailLanes,
    trailStarts,
    trailCounts,
    npcLanes,
    npcDepths,
    rampLanes,
    rampDepths,
  ])
    assert.ok(values.size > 1, 'no opening placement dimension should remain fixed');
});

test('narrow and wide road openings use real lanes, readable bolt gaps and clear reservations', async () => {
  const { generateOpening } = await generator();
  for (const mode of ['normal', 'two-way', 'opposite'] as const)
    for (let laneCount = mode === 'two-way' ? 2 : 1; laneCount <= 7; laneCount++)
      for (const seed of [0, 1, 2, 9, 1729, 65535]) {
        const options = sanitizeRunOptions({ mode, difficulty: 'hard', laneCount });
        const before = structuredClone(options);
        const road = roadFor(mode, laneCount);
        const opening = generateOpening(options, randomFor(seed));
        assert.deepEqual(options, before, 'generation must not mutate run options');
        for (const entity of opening) {
          assert.ok(road.lanes.includes(entity.lane));
          assert.ok(Number.isFinite(entity.z) && entity.z < 0);
          assert.ok(entity.y === undefined || Number.isFinite(entity.y));
        }
        const bolts = opening.filter((entity) => entity.kind === 'pickup');
        assert.ok(bolts.length >= 4 && bolts.length <= 7);
        assert.ok(-bolts[0].z >= 35 && -bolts[0].z <= 55);
        for (let index = 0; index < bolts.length; index++) {
          assert.equal(bolts[index].pickup, 'bolt');
          assert.equal(bolts[index].y, 1.15);
          assert.equal(bolts[index].lane, bolts[0].lane, 'the trail remains readable');
          if (index) {
            const gap = bolts[index - 1].z - bolts[index].z;
            assert.ok(gap >= 9 && gap <= 17);
          }
        }
        const ramps = opening.filter((entity) => entity.kind === 'ramp');
        assert.equal(ramps.length, 1);
        assert.ok(-ramps[0].z >= 210 && -ramps[0].z <= 300);
        const cars = opening.filter((entity) => entity.kind === 'traffic');
        assert.equal(new Set(cars.map((entity) => entity.lane)).size, cars.length);
        if (laneCount === 1) assert.equal(cars.length, 0);
        else assert.ok(cars.length > 0);
        for (const car of cars) {
          assert.notEqual(car.lane, road.startLane);
          for (const reservation of [...bolts, ...ramps])
            if (reservation.lane === car.lane)
              assert.ok(
                Math.abs(car.z - reservation.z) >= 34,
                'NPCs leave the reward/ramp route clear',
              );
        }
        const firstCar = opening.findIndex((entity) => entity.kind === 'traffic');
        if (firstCar !== -1)
          assert.ok(opening.slice(firstCar).every((entity) => entity.kind === 'traffic'));
      }
});

test('the opening gives the starting car two seconds at maximum closure without a hazard contact', async () => {
  const { generateOpening } = await generator();
  const maximumWidth = Math.max(...TRAFFIC_CATALOG.map((_, index) => trafficBounds(index).width));
  const maximumLength = Math.max(...TRAFFIC_CATALOG.map((_, index) => trafficBounds(index).length));
  const maximumNpcSpeed = Math.max(...TRAFFIC_CATALOG.map((spec) => spec.cruiseSpeed));
  for (const mode of ['normal', 'two-way', 'opposite'] as const)
    for (const difficulty of ['easy', 'medium', 'hard'] as const)
      for (const laneCount of mode === 'two-way' ? [2, 7] : [1, 2, 7]) {
        const options = sanitizeRunOptions({ mode, difficulty, laneCount });
        const road = roadFor(mode, laneCount),
          rules = difficultyFor(difficulty);
        for (let seed = 0; seed < 16; seed++) {
          const opening = generateOpening(options, randomFor(seed));
          for (const entity of opening) {
            if (entity.kind === 'pickup') continue;
            const sameLateralSpace =
              Math.abs(entity.lane - road.startLane) * 3.6 <
              (PLAYER_BODY.width + (entity.kind === 'traffic' ? maximumWidth : 3.3)) / 2;
            const maximumClosure =
              rules.rocketSpeed +
              (entity.kind === 'traffic' && directionForLane(mode, entity.lane) === -1
                ? maximumNpcSpeed * rules.trafficSpeed
                : 0);
            const depth =
              (PLAYER_BODY.length + (entity.kind === 'traffic' ? maximumLength : 8.2)) / 2;
            const reachesPlayer = entity.z + maximumClosure * 2 >= -depth;
            assert.ok(
              !sameLateralSpace || !reachesPlayer,
              `${mode}/${difficulty}/${laneCount}: unsafe opening`,
            );
          }
        }
      }
});

test('randomized gaps stay inside the requested floor and proportional bounds', async () => {
  const { randomGap } = await generator();
  for (const [base, minimum] of [
    [100, 20],
    [40, 50],
    [0, 12],
  ]) {
    const low = Math.max(minimum, base * 0.85),
      high = Math.max(minimum, base) * 1.25;
    assert.equal(
      randomGap(base, minimum, () => 0),
      low,
    );
    assert.equal(
      randomGap(base, minimum, () => 1),
      high,
    );
    const random = randomFor(19);
    for (let index = 0; index < 100; index++) {
      const gap = randomGap(base, minimum, random);
      assert.ok(gap >= low && gap <= high);
    }
  }
});

test('late-run encounter timing remains random after the difficulty gap reaches its minimum', async () => {
  const { randomGap } = await generator();
  const random = randomFor(24);
  const gaps = Array.from({ length: 40 }, () => randomGap(-100, 55, random));
  assert.ok(new Set(gaps).size > 30);
  assert.ok(gaps.every((gap) => gap >= 55 && gap <= 68.75));
});

test('shuffled bags cover every item once per draw cycle and preserve the input', async () => {
  const { createShuffledBag } = await generator();
  const items = Object.freeze(['straight', 'roll-left', 'roll-right']);
  const orders = new Set<string>();
  for (let seed = 0; seed < 16; seed++) {
    const next = createShuffledBag(items, randomFor(seed));
    let previous: string | undefined;
    for (let cycle = 0; cycle < 8; cycle++) {
      const drawn = items.map(() => next());
      assert.deepEqual([...drawn].sort(), [...items].sort());
      if (previous !== undefined) assert.notEqual(drawn[0], previous);
      previous = drawn.at(-1);
      orders.add(drawn.join(','));
    }
  }
  assert.ok(orders.size > 1, 'ramp bags must not repeat a fixed cycle');
  assert.deepEqual(items, ['straight', 'roll-left', 'roll-right']);
});

test('a one-item bag remains usable and an empty bag fails explicitly', async () => {
  const { createShuffledBag } = await generator();
  const next = createShuffledBag([42], randomFor(1));
  assert.deepEqual([next(), next(), next()], [42, 42, 42]);
  assert.throws(() => createShuffledBag([], randomFor(1)), RangeError);
});
