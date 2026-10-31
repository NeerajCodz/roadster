import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, type Entity, type PickupKind } from '../src/game/simulation.ts';
import { roadFor, type RunOptions } from '../src/game/run-settings.ts';

interface CourseInsertion {
  add(
    kind: Entity['kind'],
    lane: number,
    z: number,
    y?: number,
    pickup?: PickupKind,
    selectedVariant?: number,
  ): boolean;
  leavesEscapeLane(entity: Entity, destination: number): boolean;
}

// Empty-course fixtures use the generator's real insertion guard before start adds its opening.
const insert = (game: Simulation) => (game as unknown as CourseInsertion).add.bind(game);

test('a rocket cannot be inserted into an existing ramp takeoff and landing runway', () => {
  for (const options of [
    { mode: 'normal', laneCount: 1, difficulty: 'medium' },
    { mode: 'normal', laneCount: 3, difficulty: 'medium' },
    { mode: 'two-way', laneCount: 2, difficulty: 'hard' },
    { mode: 'opposite', laneCount: 7, difficulty: 'easy' },
  ] satisfies RunOptions[]) {
    const game = new Simulation(61, options);
    const lane = roadFor(options.mode, options.laneCount).startLane;
    const add = insert(game);
    assert.equal(add('ramp', lane, -240), true, JSON.stringify(options));
    assert.equal(add('pickup', lane, -240, 1.15, 'rocket'), false, JSON.stringify(options));
    assert.equal(game.state.entities.length, 1);
  }
});

test('ramp and NPC body conflicts are rejected in both insertion orders', () => {
  for (const mode of ['normal', 'two-way', 'opposite'] as const) {
    for (const laneCount of [2, 3, 7]) {
      for (const first of ['ramp', 'traffic'] as const) {
        const game = new Simulation(19, { mode, laneCount, difficulty: 'medium' });
        const lane = roadFor(mode, laneCount).startLane;
        const add = insert(game);
        const second = first === 'ramp' ? 'traffic' : 'ramp';
        const context = `${mode}/${laneCount}: ${first} before ${second}`;
        assert.equal(add(first, lane, -300, 0, undefined, 0), true, context);
        assert.equal(add(second, lane, -300, 0, undefined, 0), false, context);
        assert.deepEqual(
          game.state.entities.map((entity) => entity.kind),
          [first],
          context,
        );
        assert.ok(game.getCourseRoute(), context);
      }
    }
  }
});

test('an existing rocket also prevents a ramp from claiming the same runway', () => {
  const game = new Simulation(73, { mode: 'normal', laneCount: 3, difficulty: 'medium' });
  const add = insert(game);
  assert.equal(add('pickup', 0, -300, 1.15, 'rocket'), true);
  assert.equal(add('ramp', 0, -300), false);
  assert.deepEqual(
    game.state.entities.map((entity) => entity.pickup),
    ['rocket'],
  );
});

test('an NPC maneuver cannot cross an optional ramp takeoff and landing runway', () => {
  const game = new Simulation(47, { mode: 'normal', laneCount: 5, difficulty: 'medium' });
  const add = insert(game);
  assert.equal(add('ramp', 0, -240), true);
  assert.equal(add('traffic', 1, -350, 0, undefined, 0), true);
  const car = game.state.entities.find((entity) => entity.kind === 'traffic')!;
  assert.ok(game.getCourseRoute(), 'the unmodified course has a reachable ground route');
  assert.equal((game as unknown as CourseInsertion).leavesEscapeLane(car, 0), false);
});

test('staggered rows cannot close the only temporally reachable side of the road', () => {
  for (let laneCount = 2; laneCount <= 7; laneCount++) {
    const game = new Simulation(31, { mode: 'normal', laneCount, difficulty: 'medium' });
    const lanes = roadFor('normal', laneCount).lanes;
    const openings = laneCount >= 4 ? 2 : 1;
    const add = insert(game);
    for (const lane of lanes.slice(openings)) {
      assert.equal(add('barrier', lane, -400), true, `first row, ${laneCount} lanes`);
    }
    for (const lane of lanes.slice(0, openings - 1)) {
      assert.equal(add('barrier', lane, -460), true, `partial second row, ${laneCount} lanes`);
    }
    const count = game.state.entities.length;
    assert.ok(game.getCourseRoute(), `before closing the route, ${laneCount} lanes`);
    assert.equal(
      add('barrier', lanes[openings - 1], -460),
      false,
      `the second row leaves spatial gaps but no reachable lane, ${laneCount} lanes`,
    );
    assert.equal(game.state.entities.length, count, `${laneCount} lanes`);
    assert.ok(game.getCourseRoute(), `rejected blocker preserves the route, ${laneCount} lanes`);
  }
});

test('an NPC turn cannot seal the reachable lane between staggered bodies', () => {
  const game = new Simulation(89, { mode: 'normal', laneCount: 3, difficulty: 'medium' });
  const add = insert(game);
  assert.equal(add('barrier', -1, -300), true);
  assert.equal(add('traffic', 1, -350, 0, undefined, 0), true);
  const car = game.state.entities.find((entity) => entity.kind === 'traffic')!;
  assert.ok(game.getCourseRoute());
  assert.equal((game as unknown as CourseInsertion).leavesEscapeLane(car, 0), false);
});

test('seeded openings retain a reachable steering route across every multilane profile', () => {
  for (const mode of ['normal', 'two-way', 'opposite'] as const) {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let laneCount = 2; laneCount <= 7; laneCount++) {
        const road = roadFor(mode, laneCount);
        for (const seed of [0, 1, 61, 65535, 4294967295]) {
          const game = new Simulation(seed, { mode, difficulty, laneCount });
          game.start();
          const context = `${mode}/${difficulty}/${laneCount} seed=${game.state.seed}`;
          assert.equal(game.state.seed, seed, context);
          const route = game.getCourseRoute();
          assert.ok(route, context);
          assert.equal(route[0].time, 0, context);
          assert.equal(route[0].lane, road.startLane, context);
          for (let index = 0; index < route.length; index++) {
            assert.ok(Number.isFinite(route[index].time), context);
            assert.ok(road.lanes.includes(route[index].lane), context);
            if (index > 0) {
              assert.ok(route[index].time >= route[index - 1].time, context);
              assert.ok(Math.abs(route[index].lane - route[index - 1].lane) <= 1, context);
            }
          }
        }
      }
    }
  }
});
