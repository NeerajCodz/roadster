import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, EMPTY_CONTROLS } from '../src/game/simulation.ts';
import { ROAD_MODES, DIFFICULTIES, roadFor } from '../src/game/run-settings.ts';

const signature = (game: Simulation) => JSON.stringify(game.state.entities);

test('normal play starts and retries with new seeds and new opening layouts', () => {
  const game = new Simulation();
  const seeds = new Set<number>(),
    layouts = new Set<string>();
  for (let i = 0; i < 24; i++) {
    game.start();
    seeds.add(game.state.seed);
    layouts.add(signature(game));
  }
  assert.equal(seeds.size, 24);
  assert.equal(layouts.size, 24);
});

test('explicit seeds still reproduce a run and retry for debugging', () => {
  const first = new Simulation(123),
    second = new Simulation(123);
  first.start();
  second.start();
  assert.equal(signature(first), signature(second));
  const initial = signature(first);
  for (let i = 0; i < 120; i++) first.update(1 / 60, EMPTY_CONTROLS);
  first.start();
  assert.equal(signature(first), initial);
});

test('opening ramps vary in lane, distance and kind across seeds, including every difficulty', () => {
  for (const difficulty of DIFFICULTIES) {
    const lanes = new Set<number>(),
      depths = new Set<number>(),
      kinds = new Set<string>();
    for (let seed = 0; seed < 36; seed++) {
      const game = new Simulation(seed, { difficulty: difficulty.id });
      game.start();
      const ramp = game.state.entities.find((entity) => entity.kind === 'ramp');
      assert.ok(ramp);
      lanes.add(ramp.lane);
      depths.add(ramp.z);
      kinds.add(ramp.rampKind!);
    }
    assert.ok(lanes.size >= 4);
    assert.ok(depths.size >= 30);
    assert.equal(kinds.size, 3);
  }
});

test('every generated opening has a certified reachable route on multi-lane roads', () => {
  for (const mode of ROAD_MODES)
    for (const difficulty of DIFFICULTIES) {
      for (const count of [mode.id === 'two-way' ? 2 : 1, 3, 7])
        for (let seed = 0; seed < 8; seed++) {
          const game = new Simulation(seed, {
            mode: mode.id,
            difficulty: difficulty.id,
            laneCount: count,
          });
          game.start();
          const road = roadFor(mode.id, count);
          if (count > 1)
            assert.ok(game.getCourseRoute(), `${mode.id}/${count}/${difficulty.id}/${seed}`);
          assert.ok(game.state.entities.every((entity) => road.lanes.includes(entity.lane)));
        }
    }
});
