import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, EMPTY_CONTROLS, type Controls } from '../src/game/simulation.ts';
import {
  roadFor,
  sanitizeRunOptions,
  type RunOptions,
  type RoadModeId,
} from '../src/game/run-settings.ts';
import { trafficBounds } from '../src/game/traffic-catalog.ts';

const expectedLanes: Record<number, number[]> = {
  1: [0],
  2: [-0.5, 0.5],
  3: [-1, 0, 1],
  4: [-1.5, -0.5, 0.5, 1.5],
  5: [-2, -1, 0, 1, 2],
  6: [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5],
  7: [-3, -2, -1, 0, 1, 2, 3],
};
const modes = ['normal', 'two-way', 'opposite'] as const;
const difficulties = ['easy', 'medium', 'hard'] as const;
const controls = (changes: Partial<Controls> = {}): Controls => ({ ...EMPTY_CONTROLS, ...changes });
const tick = (game: Simulation, seconds: number, input = controls(), clear = false) => {
  const count = Math.ceil(seconds * 60);
  for (let frame = 0; frame < count; frame++) {
    if (clear) game.state.entities = [];
    game.update(seconds / count, input);
  }
};
const press = (game: Simulation, input: Partial<Controls>) => {
  game.state.entities = [];
  game.update(1 / 60, controls());
  game.update(1 / 60, controls(input));
};
const expectedDirection = (mode: RoadModeId, lane: number) =>
  mode === 'opposite' || (mode === 'two-way' && lane < 0) ? -1 : 1;

test('custom counts normalize invalid saved values and retain the three legacy defaults', () => {
  for (const [mode, fallback] of [
    ['normal', 5],
    ['two-way', 4],
    ['opposite', 3],
  ] as const) {
    assert.equal(sanitizeRunOptions({ mode }).laneCount, fallback);
    for (const laneCount of ['7', null, NaN, Infinity, -Infinity, 3.5]) {
      assert.equal(sanitizeRunOptions({ mode, laneCount }).laneCount, fallback);
    }
    assert.equal(sanitizeRunOptions({ mode, laneCount: 0 }).laneCount, mode === 'two-way' ? 2 : 1);
    assert.equal(sanitizeRunOptions({ mode, laneCount: -5 }).laneCount, mode === 'two-way' ? 2 : 1);
    assert.equal(sanitizeRunOptions({ mode, laneCount: 20 }).laneCount, 7);
    assert.equal(roadFor(mode).lanes.length, fallback);
  }
});

test('one through seven lanes stay centred with constant physical spacing, including odd two-way roads', () => {
  for (const mode of modes)
    for (let count = mode === 'two-way' ? 2 : 1; count <= 7; count++) {
      const road = roadFor(mode, count);
      assert.deepEqual(road.lanes, expectedLanes[count]);
      assert.equal(road.startLane, count % 2 === 0 ? 0.5 : 0);
      const oncoming = road.lanes.filter((lane) => expectedDirection(mode, lane) === -1).length;
      assert.equal(
        oncoming,
        mode === 'opposite' ? count : mode === 'two-way' ? Math.floor(count / 2) : 0,
      );
      for (let index = 1; index < road.lanes.length; index++) {
        assert.ok(Math.abs((road.lanes[index] - road.lanes[index - 1]) * 3.6 - 3.6) < 1e-9);
      }
    }
  assert.deepEqual(
    roadFor('normal', 7).lanes.map((lane) => lane * 3.6),
    [-10.8, -7.2, -3.6, 0, 3.6, 7.2, 10.8],
  );
});

for (const mode of modes)
  for (const difficulty of difficulties) {
    const counts = mode === 'two-way' ? [2, 3, 5, 6, 7] : [1, 2, 6, 7];
    for (const laneCount of counts) {
      test(`${mode}/${difficulty}/${laneCount} lanes: real start, steering and airborne rolls stay on the selected road`, () => {
        const game = new Simulation(291, { mode, difficulty, laneCount });
        game.start();
        const lanes = expectedLanes[laneCount];
        assert.equal(game.state.options.laneCount, laneCount);
        assert.equal(game.state.lane, laneCount % 2 === 0 ? 0.5 : 0);
        assert.equal(game.state.x, game.state.lane * 3.6);
        for (const entity of game.state.entities) {
          assert.ok(lanes.includes(entity.lane), `invalid opening lane ${entity.lane}`);
          assert.ok(
            Number.isFinite(entity.x) && Number.isFinite(entity.z),
            'opening never uses an absent neighbouring lane',
          );
        }
        for (let index = 0; index < 9; index++) press(game, { left: true });
        assert.equal(game.state.lane, lanes[0]);
        tick(game, 0.5, controls(), true);
        assert.ok(Math.abs(game.state.x - lanes[0] * 3.6) < 0.02);
        game.state.y = 5;
        game.state.vy = 0;
        game.state.air = 100;
        game.state.rollCooldown = 0;
        press(game, { rollLeft: true });
        assert.equal(game.state.lane, lanes[0]);
        assert.ok(game.state.roll > 0);
        for (let index = 0; index < 9; index++) press(game, { right: true });
        assert.equal(game.state.lane, lanes[lanes.length - 1]);
        game.state.y = 5;
        game.state.vy = 0;
        game.state.air = 100;
        game.state.rollCooldown = 0;
        press(game, { rollRight: true });
        assert.equal(game.state.lane, lanes[lanes.length - 1]);
        assert.ok(game.state.roll > 0);
      });
    }
  }

test('short custom-road runs keep all bodies grounded, finite and legal with a safe opening', () => {
  for (const mode of modes)
    for (const difficulty of difficulties) {
      for (const laneCount of mode === 'two-way' ? [2, 3, 5, 6, 7] : [1, 2, 6, 7]) {
        const game = new Simulation(312, { mode, difficulty, laneCount });
        game.start();
        const lanes = expectedLanes[laneCount];
        assert.equal(game.state.options.laneCount, laneCount);
        tick(game, 2);
        assert.equal(game.state.status, 'playing', `${mode}/${difficulty}/${laneCount}: opening`);
        game.state.invincible = 1000;
        let observed = 0;
        for (let frame = 0; frame < 10 * 60; frame++) {
          game.update(1 / 60, controls({ accelerate: frame > 360 }));
          if (frame % 15 !== 0) continue;
          assert.ok(game.state.entities.length <= 200);
          const cars = game.state.entities.filter((entity) => entity.kind === 'traffic');
          assert.ok(cars.length <= 60);
          for (const entity of game.state.entities) {
            assert.ok(lanes.includes(entity.lane));
            assert.ok(
              Number.isFinite(entity.x) && Number.isFinite(entity.y) && Number.isFinite(entity.z),
            );
            assert.ok(
              entity.x >= lanes[0] * 3.6 - 1e-6 && entity.x <= lanes[lanes.length - 1] * 3.6 + 1e-6,
            );
            if (entity.kind !== 'traffic') continue;
            observed++;
            assert.equal(entity.y, 0);
            assert.equal(entity.direction, expectedDirection(mode, entity.lane));
            assert.ok(entity.speed! >= 0 && Number.isFinite(entity.speed));
            if (entity.targetLane !== undefined) {
              assert.ok(lanes.includes(entity.targetLane));
              assert.equal(
                expectedDirection(mode, entity.targetLane),
                expectedDirection(mode, entity.lane),
                'NPC maneuvers never cross a two-way divider',
              );
            }
          }
          for (let i = 0; i < cars.length; i++)
            for (let j = i + 1; j < cars.length; j++) {
              const a = cars[i],
                b = cars[j],
                first = trafficBounds(a.variant),
                second = trafficBounds(b.variant);
              assert.ok(
                Math.abs(a.x - b.x) >= (first.width + second.width) / 2 - 0.15 ||
                  Math.abs(a.z - b.z) >= (first.length + second.length) / 2 - 0.15,
                `${mode}/${difficulty}/${laneCount}: overlapping cars ${a.id}/${b.id}`,
              );
            }
          // One lane requires flight; two-way two-lane drivers can legitimately meet side by side.
          // Three or more lanes retain a ground escape through sampled traffic rows.
          if (laneCount > 2)
            for (const slice of [-40, -160, -320]) {
              const blocked = lanes.filter((lane) =>
                game.state.entities.some((entity) => {
                  if (entity.y !== 0 || (entity.kind !== 'traffic' && entity.kind !== 'barrier'))
                    return false;
                  const bounds =
                    entity.kind === 'traffic'
                      ? trafficBounds(entity.variant)
                      : { width: 3, length: 0.85 };
                  return (
                    Math.abs(entity.x - lane * 3.6) < (bounds.width + 2.23) / 2 - 0.15 &&
                    Math.abs(entity.z - slice) < (bounds.length + 4.3) / 2
                  );
                }),
              );
              assert.ok(
                blocked.length < laneCount,
                `${mode}/${difficulty}/${laneCount}: no ground escape at ${slice}`,
              );
            }
        }
        assert.ok(
          observed > 0,
          `${mode}/${difficulty}/${laneCount}: a narrow road still generates NPCs`,
        );
      }
    }
});

test('one-lane progression includes real road traffic and barricades with long reaction headway', () => {
  for (const mode of ['normal', 'opposite'] as const)
    for (const difficulty of difficulties) {
      const game = new Simulation(919, { mode, difficulty, laneCount: 1 });
      game.start();
      tick(game, 2);
      assert.equal(game.state.status, 'playing');
      game.state.invincible = 1000;
      // Exercise late-wave rules without an expensive minute-long warm-up for Easy.
      game.state.distance = 2500;
      let sawTraffic = false,
        sawBarricade = false;
      let highest = Math.max(...game.state.entities.map((entity) => entity.id));
      for (let frame = 0; frame < 18 * 60; frame++) {
        game.update(1 / 60, controls());
        for (const entity of game.state.entities) {
          assert.equal(entity.lane, 0);
          assert.equal(entity.x, 0);
          if (entity.kind === 'traffic') {
            sawTraffic = true;
            if (entity.id > highest) {
              const closing =
                game.state.speed + (entity.direction === -1 ? entity.speed! : -entity.speed!);
              assert.ok(
                -entity.z - (trafficBounds(entity.variant).length + 4.3) / 2 > closing * 2,
                'a single-lane NPC must be visible for at least two seconds before contact',
              );
            }
          }
          if (entity.kind === 'barrier') sawBarricade = true;
        }
        highest = Math.max(highest, ...game.state.entities.map((entity) => entity.id));
      }
      assert.ok(
        sawTraffic && sawBarricade,
        `${mode}/${difficulty}: one-lane roads must not become empty safe corridors`,
      );
    }
});

test('custom count survives pause/retry, is menu-configurable and replays from the same seed', () => {
  const options: Partial<RunOptions> = { mode: 'two-way', difficulty: 'hard', laneCount: 7 };
  const game = new Simulation(444, options);
  const replay = new Simulation(444, options);
  const run = (sim: Simulation) => {
    sim.start();
    sim.state.invincible = 1000;
    tick(sim, 8, controls({ accelerate: true }));
  };
  run(game);
  run(replay);
  assert.deepEqual(game.state, replay.state);
  game.pause();
  const paused = structuredClone(game.state);
  tick(game, 0.5);
  assert.deepEqual(game.state, paused);
  assert.equal(game.configure({ ...options, laneCount: 2 }), false);
  game.resume();
  assert.equal(game.state.options.laneCount, 7);
  run(game);
  assert.deepEqual(game.state, replay.state);
  game.menu();
  assert.equal(game.state.options.laneCount, 7);
  assert.equal(game.configure({ ...options, laneCount: 3 }), true);
  game.start();
  assert.equal(game.state.options.laneCount, 3);
  game.start({ laneCount: 6 });
  assert.deepEqual(game.state.options, { mode: 'two-way', difficulty: 'hard', laneCount: 6 });
  assert.equal(game.state.distance, 0);
  assert.equal(game.state.x, 1.8);
});
