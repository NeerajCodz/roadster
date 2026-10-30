import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, EMPTY_CONTROLS, type Controls, type Entity } from '../src/game/simulation.ts';
import {
  DEFAULT_RUN_OPTIONS,
  sanitizeRunOptions,
  type RunOptions,
} from '../src/game/run-settings.ts';
import { trafficBounds } from '../src/game/traffic-catalog.ts';
import { PLAYER_BODY } from '../src/game/road-layout.ts';

const roads = [
  { mode: 'normal', lanes: [-2, -1, 0, 1, 2], start: 0 },
  { mode: 'two-way', lanes: [-1.5, -0.5, 0.5, 1.5], start: 0.5 },
  { mode: 'opposite', lanes: [-1, 0, 1], start: 0 },
] as const;
const difficulties = ['easy', 'medium', 'hard'] as const;
const input = (changes: Partial<Controls> = {}): Controls => ({ ...EMPTY_CONTROLS, ...changes });
const direction = (mode: RunOptions['mode'], lane: number) =>
  mode === 'opposite' || (mode === 'two-way' && lane < 0) ? -1 : 1;
const tick = (game: Simulation, seconds: number, controls = input(), clearRoad = false) => {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) {
    if (clearRoad) game.state.entities = [];
    game.update(seconds / frames, controls);
  }
};
const edge = (game: Simulation, changes: Partial<Controls>) => {
  game.state.entities = [];
  game.update(1 / 60, input());
  game.update(1 / 60, input(changes));
};
const traffic = (changes: Partial<Entity> = {}): Entity => ({
  id: 9999,
  kind: 'traffic',
  lane: 0,
  x: 0,
  y: 0,
  z: -180,
  variant: 0,
  ...changes,
});

test('run options sanitize unknown values and can only configure a run from its menu', () => {
  assert.deepEqual(sanitizeRunOptions(null), DEFAULT_RUN_OPTIONS);
  assert.deepEqual(
    sanitizeRunOptions({ mode: 'six-way', difficulty: 'impossible' }),
    DEFAULT_RUN_OPTIONS,
  );
  const game = new Simulation(14);
  assert.equal(game.configure({ mode: 'two-way', difficulty: 'easy' }), true);
  assert.deepEqual(game.state.options, { mode: 'two-way', difficulty: 'easy' });
  game.start();
  assert.equal(game.configure({ mode: 'opposite', difficulty: 'hard' }), false);
  game.pause();
  assert.equal(game.configure({ mode: 'opposite', difficulty: 'hard' }), false);
  game.resume();
  game.state.entities = [traffic({ lane: 0.5, x: 1.8, z: -1, direction: 1 })];
  game.update(1 / 60, input());
  assert.equal(game.state.status, 'crashed');
  assert.equal(game.configure({ mode: 'normal', difficulty: 'hard' }), false);
  assert.deepEqual(game.state.options, { mode: 'two-way', difficulty: 'easy' });
  game.menu();
  assert.equal(game.configure({ mode: 'opposite', difficulty: 'hard' }), true);
  game.start();
  assert.deepEqual(game.state.options, { mode: 'opposite', difficulty: 'hard' });
});

for (const road of roads)
  for (const difficulty of difficulties) {
    const options: RunOptions = { mode: road.mode, difficulty };
    test(`${road.mode}/${difficulty}: starts in its real lane and steering/rolls clamp to road edges`, () => {
      const game = new Simulation(37, options);
      game.start();
      assert.deepEqual(game.state.options, options);
      assert.equal(game.state.lane, road.start);
      assert.equal(game.state.x, road.start * 3.6);
      for (let i = 0; i < 8; i++) edge(game, { left: true });
      assert.equal(game.state.lane, road.lanes[0]);
      tick(game, 0.4, input(), true);
      assert.ok(Math.abs(game.state.x - road.lanes[0] * 3.6) < 0.02);
      game.state.y = 5;
      game.state.vy = 0;
      game.state.air = 100;
      game.state.rollCooldown = 0;
      edge(game, { rollLeft: true });
      assert.equal(game.state.lane, road.lanes[0]);
      assert.ok(game.state.roll > 0, 'a valid airborne roll still executes at the edge');
      for (let i = 0; i < 8; i++) edge(game, { right: true });
      assert.equal(game.state.lane, road.lanes[road.lanes.length - 1]);
      game.state.y = 5;
      game.state.vy = 0;
      game.state.air = 100;
      game.state.rollCooldown = 0;
      edge(game, { rollRight: true });
      assert.equal(game.state.lane, road.lanes[road.lanes.length - 1]);
      assert.ok(road.lanes.includes(game.state.lane as never));
    });

    test(`${road.mode}/${difficulty}: bounded generated traffic respects directions, real gaps and reservations`, () => {
      const game = new Simulation(271, options);
      game.start();
      tick(game, 2);
      assert.equal(game.state.status, 'playing', 'a new driver gets a safe opening');
      game.state.invincible = 1000;
      let observedTraffic = 0,
        observedOncoming = 0;
      let highestId = Math.max(...game.state.entities.map((entity) => entity.id));
      for (let frame = 0; frame < 28 * 60; frame++) {
        game.update(1 / 60, input({ accelerate: frame % 600 > 300 }));
        const entities = game.state.entities;
        const cars = entities.filter((entity) => entity.kind === 'traffic');
        assert.ok(cars.length <= 60 && entities.length <= 200, 'population remains bounded');
        for (const car of cars) {
          assert.ok(road.lanes.includes(car.lane as never), `invalid source lane ${car.lane}`);
          assert.equal(car.y, 0);
          assert.equal(car.direction, direction(road.mode, car.lane));
          assert.ok(
            Number.isFinite(car.speed) && car.speed! >= 0,
            'speed is a nonnegative travel magnitude, including a stop behind a barricade',
          );
          assert.ok(
            car.x >= road.lanes[0] * 3.6 - 1e-6 &&
              car.x <= road.lanes[road.lanes.length - 1] * 3.6 + 1e-6,
          );
          if (car.direction === -1) observedOncoming++;
          if (car.targetLane !== undefined) {
            assert.ok(road.lanes.includes(car.targetLane as never));
            assert.equal(
              direction(road.mode, car.targetLane),
              direction(road.mode, car.lane),
              'NPCs never cross the two-way centreline',
            );
          }
          if (car.id > highestId) {
            assert.ok(car.z < -75, 'new traffic is born beyond reaction distance');
            for (const route of entities.filter(
              (entity) => entity.kind === 'ramp' || (entity.kind === 'pickup' && entity.y < 2),
            )) {
              if (
                Math.abs(route.x - car.x) <
                (trafficBounds(car.variant).width + PLAYER_BODY.width) / 2
              ) {
                assert.ok(
                  Math.abs(route.z - car.z) > trafficBounds(car.variant).length / 2 + 1,
                  'new traffic cannot occupy an existing ground reward/ramp',
                );
              }
            }
          }
        }
        highestId = Math.max(highestId, ...entities.map((entity) => entity.id));
        observedTraffic += cars.length;
        if (frame % 20 === 0) {
          for (let i = 0; i < cars.length; i++)
            for (let j = i + 1; j < cars.length; j++) {
              const a = cars[i],
                b = cars[j];
              const first = trafficBounds(a.variant),
                second = trafficBounds(b.variant);
              const lateralOverlap = Math.abs(a.x - b.x) < (first.width + second.width) / 2 - 0.15;
              const lengthOverlap = Math.abs(a.z - b.z) < (first.length + second.length) / 2 - 0.15;
              assert.ok(!lateralOverlap || !lengthOverlap, `NPC bodies overlap: ${a.id}/${b.id}`);
            }
          for (const slice of [-20, -120, -260, -420]) {
            const blocked = road.lanes.filter((lane) =>
              entities.some((entity) => {
                if (entity.kind !== 'traffic' && (entity.kind !== 'barrier' || entity.y > 0))
                  return false;
                const bounds =
                  entity.kind === 'traffic'
                    ? trafficBounds(entity.variant)
                    : { width: 3, length: 0.85 };
                return (
                  Math.abs(entity.x - lane * 3.6) < (bounds.width + PLAYER_BODY.width) / 2 - 0.15 &&
                  Math.abs(entity.z - slice) < (bounds.length + PLAYER_BODY.length) / 2
                );
              }),
            );
            assert.ok(
              blocked.length < road.lanes.length,
              `all ground lanes blocked near ${slice}m`,
            );
          }
        }
      }
      assert.ok(observedTraffic > 100, 'the fixture samples a populated run');
      if (road.mode !== 'normal') assert.ok(observedOncoming > 0);
    });
  }

test('oncoming closure adds NPC speed while same-way closure subtracts it', () => {
  const same = new Simulation(9, { mode: 'two-way' });
  const oncoming = new Simulation(9, { mode: 'two-way' });
  same.start();
  oncoming.start();
  same.state.entities = [traffic({ lane: 0.5, x: 1.8, direction: 1 })];
  oncoming.state.entities = [traffic({ lane: -0.5, x: -1.8, direction: -1 })];
  same.update(1 / 120, input());
  oncoming.update(1 / 120, input());
  const a = same.state.entities[0],
    b = oncoming.state.entities[0];
  const sameClosure = a.z + 180,
    oncomingClosure = b.z + 180;
  assert.ok(oncomingClosure > sameClosure * 2);
  assert.ok(Math.abs(sameClosure - (same.state.speed - a.speed!) / 120) < 0.001);
  assert.ok(Math.abs(oncomingClosure - (oncoming.state.speed + b.speed!) / 120) < 0.001);
});

test('fast oncoming traffic cannot tunnel through the player or resume after a crash', () => {
  const game = new Simulation(2, { mode: 'opposite' });
  game.start();
  game.state.speed = 4000;
  game.state.entities = [traffic({ direction: -1, z: -8 })];
  game.update(1 / 120, input());
  assert.equal(game.state.status, 'crashed');
  const distance = game.state.distance;
  game.resume();
  game.update(0.1, input({ fly: true }));
  assert.equal(game.state.status, 'crashed');
  assert.equal(game.state.distance, distance);
});

test('difficulty profiles change actual driving, energy and progressive traffic/hazard pressure', () => {
  const results = difficulties.map((difficulty) => {
    const game = new Simulation(197, { difficulty });
    game.start();
    const cruise = game.state.speed;
    tick(game, 2, input({ accelerate: true }), true);
    const boost = game.state.speed;
    game.start();
    tick(game, 2, input({ fly: true }), true);
    const flightAir = game.state.air;
    game.state.y = 0;
    game.state.vy = 0;
    game.state.air = 20;
    tick(game, 1, input(), true);
    const recharge = game.state.air;
    game.start();
    game.state.invincible = 1000;
    const trafficIds = new Set<number>(),
      hazardIds = new Set<number>();
    let population = 0,
      samples = 0;
    for (let frame = 0; frame < 30 * 60; frame++) {
      game.update(1 / 60, input());
      for (const entity of game.state.entities) {
        if (entity.kind === 'traffic') trafficIds.add(entity.id);
        if (entity.kind === 'barrier') hazardIds.add(entity.id);
      }
      if (frame > 15 * 60 && frame % 30 === 0) {
        population += game.state.entities.filter((entity) => entity.kind === 'traffic').length;
        samples++;
      }
    }
    return {
      cruise,
      boost,
      flightAir,
      recharge,
      traffic: trafficIds.size,
      hazards: hazardIds.size,
      density: population / samples,
    };
  });
  for (let i = 0; i < 2; i++) {
    assert.ok(results[i].cruise < results[i + 1].cruise);
    assert.ok(results[i].boost < results[i + 1].boost);
    assert.ok(results[i].flightAir > results[i + 1].flightAir);
    assert.ok(results[i].recharge > results[i + 1].recharge);
    assert.ok(
      results[i].density < results[i + 1].density,
      `density ordering: ${JSON.stringify(results)}`,
    );
    assert.ok(results[i].traffic < results[i + 1].traffic);
    assert.ok(results[i].hazards <= results[i + 1].hazards);
  }
  assert.ok(results[0].hazards < results[2].hazards, 'hard creates actual extra hazards');
});

test('pause freezes configured traffic and retry repeats the same seeded run without losing options', () => {
  const options: RunOptions = { mode: 'two-way', difficulty: 'hard' };
  const first = new Simulation(81, options);
  const second = new Simulation(81, options);
  for (const game of [first, second]) {
    game.start();
    game.state.invincible = 1000;
  }
  const play = (game: Simulation) => {
    for (let frame = 0; frame < 12 * 60; frame++)
      game.update(
        1 / 60,
        input({ accelerate: frame > 120, right: frame === 180, fly: frame > 240 && frame < 330 }),
      );
  };
  play(first);
  play(second);
  assert.deepEqual(first.state, second.state);
  first.pause();
  const paused = structuredClone(first.state);
  tick(first, 1, input({ left: true, fly: true }));
  assert.deepEqual(first.state, paused);
  first.resume();
  assert.deepEqual(first.state.options, options);
  first.start();
  first.state.invincible = 1000;
  play(first);
  assert.deepEqual(first.state, second.state);
  first.menu();
  assert.deepEqual(first.state.options, options);
  first.start({ difficulty: 'easy' });
  assert.deepEqual(first.state.options, { mode: 'two-way', difficulty: 'easy' });
  assert.equal(first.state.distance, 0);
});

test('difficulty changes actual pickup rewards and announced maneuver warning time', () => {
  const rewards: number[] = [];
  for (const difficulty of difficulties) {
    const withBolt = new Simulation(37, { difficulty });
    const withoutBolt = new Simulation(37, { difficulty });
    for (const game of [withBolt, withoutBolt]) {
      game.start();
      game.state.entities = [];
    }
    withBolt.state.entities = [traffic({ kind: 'pickup', pickup: 'bolt', y: 1.15, z: 0 })];
    for (const game of [withBolt, withoutBolt]) game.update(1 / 120, input());
    rewards.push(withBolt.state.score - withoutBolt.state.score);
    const game = new Simulation(37, { difficulty });
    game.start();
    const car = traffic({ z: -500 });
    game.state.entities = [car];
    let warnedAt: number | undefined, movedAt: number | undefined;
    for (let i = 0; i < 1800 && movedAt === undefined; i++) {
      game.state.entities = [car];
      game.update(1 / 120, input());
      if (car.signal && warnedAt === undefined) warnedAt = game.state.time;
      if (car.x !== 0) movedAt = game.state.time;
    }
    assert.ok(
      warnedAt !== undefined && movedAt !== undefined,
      'a distant driver makes an announced maneuver',
    );
    assert.ok(movedAt - warnedAt >= (difficulty === 'easy' ? 1.6 : 1) - 1e-8);
  }
  for (const [i, expected] of [20, 25, 37.5].entries())
    assert.ok(Math.abs(rewards[i] - expected) < 1e-8);
});

test('each mode collides with its gantry panel and retains the real outer-lane flight gap', () => {
  for (const road of roads) {
    for (const outer of [false, true]) {
      const game = new Simulation(9, { mode: road.mode });
      game.start();
      game.state.entities = [];
      game.state.distance = 98;
      game.state.y = 10;
      game.state.vy = 0;
      game.state.lane = outer ? road.lanes[road.lanes.length - 1] : road.start;
      game.state.x = game.state.lane * 3.6;
      game.update(1 / 120, input());
      assert.equal(
        game.state.status,
        outer ? 'playing' : 'crashed',
        `${road.mode}: ${outer ? 'outside gap' : 'panel'}`,
      );
    }
  }
});
