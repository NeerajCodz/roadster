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
  assert.equal(Object.keys(records).length, 9);
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
  assert.equal(Object.keys(records).length, 9);
  assert.deepEqual(records['normal:medium'], { bestScore: 0, bestDistance: 0, bolts: 9, runs: 0 });
  assert.deepEqual(records['two-way:hard'], {
    bestScore: 128,
    bestDistance: 56.75,
    bolts: 0,
    runs: 2,
  });
  for (const corrupt of [null, [], 'broken', 42]) {
    const fresh = sanitizeRunRecords(corrupt);
    assert.equal(Object.keys(fresh).length, 9);
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
