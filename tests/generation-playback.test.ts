import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, EMPTY_CONTROLS, type Controls } from '../src/game/simulation.ts';
import {
  DIFFICULTIES,
  ROAD_MODES,
  difficultyFor,
  type RunOptions,
} from '../src/game/run-settings.ts';
import { createCourseDriver } from './helpers/course-driver.ts';

/** Uses only public observations and ordinary controls. Never edits the run state. */
function play(seed: number, options: RunOptions, seconds: number) {
  const game = new Simulation(seed, options);
  game.start();
  let previous: Controls = { ...EMPTY_CONTROLS },
    encounters = 0;
  const drive = createCourseDriver(options),
    rules = difficultyFor(options.difficulty);
  for (let frame = 0; frame < seconds * 60; frame++) {
    const s = game.state,
      input = drive(game);
    if (input.left || input.right || (input.fly && !previous.fly)) encounters++;
    game.update(1 / 60, input);
    previous = input;
    assert.equal(
      game.state.status,
      'playing',
      JSON.stringify({
        seed,
        options,
        frame,
        distance: s.distance,
        x: s.x,
        y: s.y,
        air: s.air,
        near: s.entities.filter((e) => Math.abs(e.z) < 35),
      }),
    );
  }
  assert.ok(game.state.distance > seconds * rules.cruiseSpeed * 0.98);
  return { game, encounters };
}

test('all 60 road/lane/difficulty combinations admit ordinary control playback without test invincibility', () => {
  let encounters = 0;
  for (const mode of ROAD_MODES)
    for (const difficulty of DIFFICULTIES) {
      for (let laneCount = mode.id === 'two-way' ? 2 : 1; laneCount <= 7; laneCount++) {
        const result = play(
          271 + laneCount,
          { mode: mode.id, difficulty: difficulty.id, laneCount },
          35,
        );
        encounters += result.encounters;
      }
    }
  assert.ok(encounters > 40, 'the driver must encounter and navigate hazards');
});

test('long narrow oncoming and wide hard runs remain playable across different seeds', () => {
  for (const seed of [0, 1, 19, 999])
    for (const laneCount of [1, 2, 7]) {
      play(seed, { mode: 'opposite', difficulty: 'hard', laneCount }, 70);
    }
});

test('later rocket pickups and traffic preserve the oncoming three-lane route', () => {
  play(274, { mode: 'opposite', difficulty: 'hard', laneCount: 3 }, 35);
});
