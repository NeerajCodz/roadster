import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_MODES,
  DIFFICULTIES,
  roadFor,
  difficultyFor,
  directionForLane,
  sanitizeRunOptions,
  runKey,
} from '../src/game/run-settings.ts';

test('three centred road modes have the requested direction counts and a legal starting lane', () => {
  assert.equal(ROAD_MODES.length, 3);
  for (const [id, count, oncoming] of [
    ['normal', 5, 0],
    ['two-way', 4, 2],
    ['opposite', 3, 3],
  ] as const) {
    const road = roadFor(id);
    assert.equal(road.lanes.length, count);
    assert.ok(road.lanes.includes(road.startLane));
    assert.equal(
      road.lanes.reduce((sum, lane) => sum + lane, 0),
      0,
    );
    assert.equal(road.lanes.filter((lane) => directionForLane(id, lane) === -1).length, oncoming);
    for (let i = 1; i < road.lanes.length; i++) assert.equal(road.lanes[i] - road.lanes[i - 1], 1);
  }
  assert.equal(directionForLane('two-way', roadFor('two-way').startLane), 1);
});

test('run options validate persisted values and identify all nine record buckets', () => {
  assert.deepEqual(sanitizeRunOptions(null), {
    mode: 'normal',
    difficulty: 'medium',
    laneCount: 5,
  });
  assert.deepEqual(sanitizeRunOptions({ mode: 'invented', difficulty: 42 }), {
    mode: 'normal',
    difficulty: 'medium',
    laneCount: 5,
  });
  assert.deepEqual(sanitizeRunOptions({ mode: 'two-way', difficulty: 'easy' }), {
    mode: 'two-way',
    difficulty: 'easy',
    laneCount: 4,
  });
  assert.equal(
    new Set(
      ROAD_MODES.flatMap((m) => DIFFICULTIES.map((d) => runKey({ mode: m.id, difficulty: d.id }))),
    ).size,
    9,
  );
});

test('difficulty increases road pressure and energy cost while preserving warning time', () => {
  assert.equal(DIFFICULTIES.length, 3);
  const [easy, medium, hard] = ['easy', 'medium', 'hard'].map((id) =>
    difficultyFor(id as 'easy' | 'medium' | 'hard'),
  );
  assert.ok(easy.cruiseSpeed < medium.cruiseSpeed && medium.cruiseSpeed < hard.cruiseSpeed);
  assert.ok(easy.flightDrain < medium.flightDrain && medium.flightDrain < hard.flightDrain);
  assert.ok(
    easy.groundRecharge > medium.groundRecharge && medium.groundRecharge > hard.groundRecharge,
  );
});

test('custom lane counts are centred, validated and isolated in saved record keys', () => {
  for (const mode of ['normal', 'two-way', 'opposite'] as const) {
    const minimum = mode === 'two-way' ? 2 : 1;
    for (let count = minimum; count <= 7; count++) {
      const options = sanitizeRunOptions({ mode, difficulty: 'medium', laneCount: count });
      assert.equal(options.laneCount, count);
      const road = roadFor(mode, count);
      assert.equal(road.lanes.length, count);
      assert.equal(
        road.lanes.reduce((sum, lane) => sum + lane, 0),
        0,
      );
      assert.ok(road.lanes.includes(road.startLane));
      assert.equal(roadFor(mode, count), road, 'the same immutable layout is cached');
    }
  }
  assert.equal(sanitizeRunOptions({ mode: 'two-way', laneCount: 1 }).laneCount, 2);
  assert.equal(sanitizeRunOptions({ mode: 'normal', laneCount: 99 }).laneCount, 7);
  assert.equal(sanitizeRunOptions({ mode: 'opposite', laneCount: -2 }).laneCount, 1);
  assert.equal(runKey({ mode: 'normal', difficulty: 'medium', laneCount: 5 }), 'normal:medium');
  assert.notEqual(runKey({ mode: 'normal', difficulty: 'medium', laneCount: 7 }), 'normal:medium');
});
