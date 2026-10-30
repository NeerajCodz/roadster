import {
  DEFAULT_RUN_OPTIONS,
  DIFFICULTIES,
  ROAD_MODES,
  runKey,
  type RunOptions,
} from './run-settings';

export interface RunRecord {
  bestScore: number;
  bestDistance: number;
  bolts: number;
  runs: number;
}
export type RunRecords = Record<string, RunRecord>;
const keys = ROAD_MODES.flatMap((mode) =>
  DIFFICULTIES.map((difficulty) => runKey({ mode: mode.id, difficulty: difficulty.id })),
);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const amount = (value: unknown, integer = false): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  const safe = Math.min(value, Number.MAX_SAFE_INTEGER);
  return integer ? Math.floor(safe) : safe;
};
const cleanRecord = (value: unknown): RunRecord => {
  const saved = object(value);
  return {
    bestScore: amount(saved?.bestScore, true),
    bestDistance: amount(saved?.bestDistance),
    bolts: amount(saved?.bolts, true),
    runs: amount(saved?.runs, true),
  };
};

/** Legacy overall records belonged to the original Normal / Medium road only. */
export function sanitizeRunRecords(raw: unknown, legacy?: unknown): RunRecords {
  const saved = object(raw);
  const records = Object.fromEntries(keys.map((key) => [key, cleanRecord(saved?.[key])]));
  if (!keys.some((key) => object(saved?.[key])))
    records[runKey(DEFAULT_RUN_OPTIONS)] = cleanRecord(legacy);
  return records;
}

/** Return a fresh leaderboard; a completed run can only change its own profile. */
export function recordRun(
  records: RunRecords,
  options: RunOptions,
  run: { score: number; distance: number; bolts: number },
): RunRecords {
  const key = runKey(options);
  const previous = cleanRecord(records[key]);
  return {
    ...records,
    [key]: {
      bestScore: Math.max(previous.bestScore, amount(run.score, true)),
      bestDistance: Math.max(previous.bestDistance, amount(run.distance)),
      bolts: amount(previous.bolts + amount(run.bolts, true), true),
      runs: amount(previous.runs + 1, true),
    },
  };
}

export function runRecordFor(records: RunRecords, options: RunOptions): RunRecord {
  return cleanRecord(records[runKey(options)]);
}
