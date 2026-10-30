import assert from 'node:assert/strict';
import test from 'node:test';
import { recordRun, runRecordFor, sanitizeRunRecords } from '../src/game/run-records.ts';

test('legacy records migrate only into normal medium when there is no per-run record map', () => {
  const records = sanitizeRunRecords(undefined, {
    bestScore: 1200,
    bestDistance: 985.5,
    bolts: 22,
    runs: 4,
  });
  assert.equal(Object.keys(records).length, 60);
  assert.deepEqual(records['normal:medium'], {
    bestScore: 1200,
    bestDistance: 985.5,
    bolts: 22,
    runs: 4,
  });
  assert.deepEqual(records['opposite:hard'], { bestScore: 0, bestDistance: 0, bolts: 0, runs: 0 });
  const existing = sanitizeRunRecords(
    { 'two-way:easy': { bestScore: 80, runs: 1 } },
    { bestScore: 9999 },
  );
  assert.equal(
    existing['normal:medium'].bestScore,
    0,
    'legacy totals must not leak into an existing profile map',
  );
  assert.equal(existing['two-way:easy'].bestScore, 80);
});

test('corrupt storage is sanitized by profile and unknown keys cannot become leaderboard entries', () => {
  const records = sanitizeRunRecords({
    'normal:medium': { bestScore: Infinity, bestDistance: -30, bolts: 9.7, runs: '4' },
    'two-way:hard': { bestScore: 128.9, bestDistance: 56.75, bolts: -1, runs: 2.9 },
    'opposite:easy': null,
    'made-up:hard': { bestScore: 999999 },
  });
  assert.equal(Object.keys(records).length, 60);
  assert.deepEqual(records['normal:medium'], { bestScore: 0, bestDistance: 0, bolts: 9, runs: 0 });
  assert.deepEqual(records['two-way:hard'], {
    bestScore: 128,
    bestDistance: 56.75,
    bolts: 0,
    runs: 2,
  });
  for (const corrupt of [null, [], 'broken', 42]) {
    const fresh = sanitizeRunRecords(corrupt);
    assert.equal(Object.keys(fresh).length, 60);
    assert.equal(fresh['opposite:hard'].bestScore, 0);
  }
});

test('a finished run updates its own best and totals without changing another mode or the input map', () => {
  const initial = sanitizeRunRecords(undefined);
  const first = recordRun(
    initial,
    { mode: 'two-way', difficulty: 'hard' },
    { score: 375.9, distance: 222.5, bolts: 8 },
  );
  const next = recordRun(
    first,
    { mode: 'opposite', difficulty: 'easy' },
    { score: 900, distance: 310, bolts: 2 },
  );
  const replay = recordRun(
    next,
    { mode: 'two-way', difficulty: 'hard' },
    { score: 150, distance: 280, bolts: 3 },
  );
  assert.deepEqual(replay['two-way:hard'], {
    bestScore: 375,
    bestDistance: 280,
    bolts: 11,
    runs: 2,
  });
  assert.deepEqual(replay['opposite:easy'], {
    bestScore: 900,
    bestDistance: 310,
    bolts: 2,
    runs: 1,
  });
  assert.equal(replay['two-way:easy'].bestScore, 0, 'difficulty records must remain separate');
  assert.equal(initial['two-way:hard'].runs, 0);
  assert.equal(first['opposite:easy'].runs, 0);
  assert.equal(runRecordFor(replay, { mode: 'normal', difficulty: 'medium' }).bestScore, 0);
});

test('invalid completion numbers cannot poison a saved record', () => {
  const records = recordRun(
    sanitizeRunRecords(undefined),
    { mode: 'normal', difficulty: 'easy' },
    { score: NaN, distance: -2, bolts: Infinity },
  );
  assert.deepEqual(records['normal:easy'], { bestScore: 0, bestDistance: 0, bolts: 0, runs: 1 });
});

test('custom lane counts replay independently while the original nine default keys retain their records', () => {
  const legacy = sanitizeRunRecords(
    {
      'normal:medium': { bestScore: 900, bestDistance: 400, runs: 3, bolts: 9 },
      'two-way:easy': { bestScore: 300, bestDistance: 200, runs: 2, bolts: 5 },
      'opposite:hard': { bestScore: 600, bestDistance: 120, runs: 1, bolts: 2 },
    },
    { bestScore: 99999 },
  );
  const narrow = recordRun(
    legacy,
    { mode: 'normal', difficulty: 'medium', laneCount: 1 },
    { score: 1500, distance: 90, bolts: 1 },
  );
  const wide = recordRun(
    narrow,
    { mode: 'normal', difficulty: 'medium', laneCount: 7 },
    { score: 120, distance: 600, bolts: 4 },
  );
  const replay = recordRun(
    wide,
    { mode: 'normal', difficulty: 'medium', laneCount: 1 },
    { score: 100, distance: 150, bolts: 2 },
  );
  assert.deepEqual(replay['normal:medium:1'], {
    bestScore: 1500,
    bestDistance: 150,
    bolts: 3,
    runs: 2,
  });
  assert.deepEqual(replay['normal:medium:7'], {
    bestScore: 120,
    bestDistance: 600,
    bolts: 4,
    runs: 1,
  });
  assert.equal(replay['normal:medium'].bestScore, 900);
  assert.equal(replay['two-way:easy'].bestScore, 300);
  assert.equal(replay['opposite:hard'].bestScore, 600);
  assert.equal(
    replay['two-way:hard:1'],
    undefined,
    'a one-lane two-way road is not a record category',
  );
});

test('bad custom keys cannot introduce records or leak overall best into custom roads', () => {
  const records = sanitizeRunRecords(
    {
      'normal:hard:7': { bestScore: 700 },
      'normal:hard:99': { bestScore: 9999 },
      'two-way:easy:1': { bestScore: 5000 },
    },
    { bestScore: 10000 },
  );
  assert.equal(records['normal:hard:7'].bestScore, 700);
  assert.equal(records['normal:medium'].bestScore, 0);
  assert.equal(records['normal:hard:99'], undefined);
  assert.equal(records['two-way:easy:1'], undefined);
  assert.equal(
    runRecordFor(records, { mode: 'normal', difficulty: 'hard', laneCount: 1 }).bestScore,
    0,
  );
});
