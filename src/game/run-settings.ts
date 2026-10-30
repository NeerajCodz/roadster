export type RoadModeId = 'normal' | 'two-way' | 'opposite';
export type DifficultyId = 'easy' | 'medium' | 'hard';
export interface RunOptions {
  readonly mode: RoadModeId;
  readonly difficulty: DifficultyId;
  readonly laneCount?: number;
}
export interface ResolvedRunOptions extends RunOptions {
  readonly laneCount: number;
}
export const LANE_WIDTH = 3.6;
export const LANE_COUNTS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const TWO_WAY_COUNTS = Object.freeze([2, 3, 4, 5, 6, 7]);
export const laneCountsFor = (mode: RoadModeId): readonly number[] =>
  mode === 'two-way' ? TWO_WAY_COUNTS : LANE_COUNTS;
export const DEFAULT_RUN_OPTIONS: ResolvedRunOptions = Object.freeze({
  mode: 'normal',
  difficulty: 'medium',
  laneCount: 5,
});
export interface RoadDefinition {
  readonly id: RoadModeId;
  readonly label: string;
  readonly description: string;
  readonly lanes: readonly number[];
  readonly startLane: number;
}
const road = (
  id: RoadModeId,
  label: string,
  description: string,
  lanes: number[],
  startLane: number,
): RoadDefinition =>
  Object.freeze({ id, label, description, lanes: Object.freeze(lanes), startLane });
export const ROAD_MODES: readonly RoadDefinition[] = Object.freeze([
  road('normal', 'Normal', 'Five lanes of traffic travelling with you.', [-2, -1, 0, 1, 2], 0),
  road(
    'two-way',
    'Two-way',
    'Four lanes: two with you, two oncoming. Watch the centre line.',
    [-1.5, -0.5, 0.5, 1.5],
    0.5,
  ),
  road(
    'opposite',
    'Opposite',
    'Three lanes of oncoming traffic. Headlights ahead, faster closing speeds.',
    [-1, 0, 1],
    0,
  ),
]);
export interface DifficultyProfile {
  readonly id: DifficultyId;
  readonly label: string;
  readonly description: string;
  readonly scoreMultiplier: number;
  readonly cruiseSpeed: number;
  readonly speedRamp: number;
  readonly boostSpeed: number;
  readonly rocketSpeed: number;
  readonly trafficSpeed: number;
  readonly trafficPerLane: number;
  readonly trafficCap: number;
  readonly ambientGap: number;
  readonly waveGap: number;
  readonly waveMinGap: number;
  readonly waveStage: number;
  readonly spawnAhead: number;
  readonly aerialAfter: number;
  readonly aerialChance: number;
  readonly aerialEvery: number;
  readonly signalSeconds: number;
  readonly decisionSeconds: number;
  readonly maneuverChance: number;
  readonly headway: number;
  readonly spawnClearance: number;
  readonly flightDrain: number;
  readonly groundRecharge: number;
  readonly airPickup: number;
  readonly bonusEvery: number;
  readonly rampEvery: number;
}
export const DIFFICULTIES: readonly DifficultyProfile[] = Object.freeze([
  Object.freeze({
    id: 'easy',
    label: 'Easy',
    description: 'Lighter traffic, slower cruising, longer warnings and more flight energy.',
    scoreMultiplier: 0.8,
    cruiseSpeed: 36,
    speedRamp: 6,
    boostSpeed: 18,
    rocketSpeed: 76,
    trafficSpeed: 0.85,
    trafficPerLane: 5,
    trafficCap: 36,
    ambientGap: 24,
    waveGap: 155,
    waveMinGap: 105,
    waveStage: 1400,
    spawnAhead: 300,
    aerialAfter: 1800,
    aerialChance: 0.08,
    aerialEvery: 4,
    signalSeconds: 1.6,
    decisionSeconds: 2.6,
    maneuverChance: 0.4,
    headway: 11,
    spawnClearance: 18,
    flightDrain: 16,
    groundRecharge: 34,
    airPickup: 45,
    bonusEvery: 2,
    rampEvery: 3,
  }),
  Object.freeze({
    id: 'medium',
    label: 'Medium',
    description: 'Balanced traffic, full-speed cruising and the original energy challenge.',
    scoreMultiplier: 1,
    cruiseSpeed: 44,
    speedRamp: 10,
    boostSpeed: 22,
    rocketSpeed: 86,
    trafficSpeed: 1,
    trafficPerLane: 8.4,
    trafficCap: 60,
    ambientGap: 12,
    waveGap: 120,
    waveMinGap: 68,
    waveStage: 950,
    spawnAhead: 240,
    aerialAfter: 950,
    aerialChance: 0.2,
    aerialEvery: 3,
    signalSeconds: 1,
    decisionSeconds: 1.8,
    maneuverChance: 1,
    headway: 7,
    spawnClearance: 12,
    flightDrain: 20,
    groundRecharge: 28,
    airPickup: 35,
    bonusEvery: 3,
    rampEvery: 4,
  }),
  Object.freeze({
    id: 'hard',
    label: 'Hard',
    description: 'Heavier, faster traffic, earlier aerial hazards and tighter energy management.',
    scoreMultiplier: 1.5,
    cruiseSpeed: 50,
    speedRamp: 14,
    boostSpeed: 24,
    rocketSpeed: 96,
    trafficSpeed: 1.18,
    trafficPerLane: 10,
    trafficCap: 60,
    ambientGap: 9,
    waveGap: 95,
    waveMinGap: 55,
    waveStage: 650,
    spawnAhead: 230,
    aerialAfter: 650,
    aerialChance: 0.3,
    aerialEvery: 2,
    signalSeconds: 1,
    decisionSeconds: 1.2,
    maneuverChance: 1,
    headway: 6,
    spawnClearance: 10,
    flightDrain: 24,
    groundRecharge: 24,
    airPickup: 30,
    bonusEvery: 4,
    rampEvery: 5,
  }),
]);
const roadCache = new Map<string, RoadDefinition>();
function normalizeLaneCount(mode: RoadDefinition, value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(mode.id === 'two-way' ? 2 : 1, Math.min(7, value))
    : mode.lanes.length;
}
export function roadFor(id: RoadModeId, laneCount?: number): RoadDefinition {
  const mode = ROAD_MODES.find((road) => road.id === id) ?? ROAD_MODES[0];
  const count = normalizeLaneCount(mode, laneCount),
    key = `${mode.id}:${count}`;
  let result = roadCache.get(key);
  if (!result) {
    const lanes = Array.from({ length: count }, (_, i) => i - (count - 1) / 2);
    const description =
      mode.id === 'two-way'
        ? `${Math.floor(count / 2)} oncoming, ${Math.ceil(count / 2)} with you. Watch the centre line.`
        : mode.id === 'opposite'
          ? `${count} oncoming lane${count === 1 ? '' : 's'}. ${count === 1 ? 'Use flight to clear traffic.' : 'Watch for headlights and faster closing speeds.'}`
          : `${count} lane${count === 1 ? '' : 's'} travelling with you.${count === 1 ? ' Use flight to clear traffic.' : ''}`;
    result = road(mode.id, mode.label, description, lanes, count % 2 ? 0 : 0.5);
    roadCache.set(key, result);
  }
  return result;
}
export const difficultyFor = (id: DifficultyId): DifficultyProfile =>
  DIFFICULTIES.find((level) => level.id === id) ?? DIFFICULTIES[1];
export function directionForLane(mode: RoadModeId, lane: number): 1 | -1 {
  return mode === 'opposite' || (mode === 'two-way' && lane < 0) ? -1 : 1;
}
export function sanitizeRunOptions(value: unknown): ResolvedRunOptions {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const mode = ROAD_MODES.find((road) => road.id === saved.mode) ?? ROAD_MODES[0];
  return Object.freeze({
    mode: mode.id,
    difficulty:
      DIFFICULTIES.find((level) => level.id === saved.difficulty)?.id ??
      DEFAULT_RUN_OPTIONS.difficulty,
    laneCount: normalizeLaneCount(mode, saved.laneCount),
  });
}
export const runKey = (options: RunOptions) => {
  const selected = roadFor(options.mode, options.laneCount);
  const base = `${selected.id}:${options.difficulty}`;
  return selected.lanes.length === roadFor(options.mode).lanes.length
    ? base
    : `${base}:${selected.lanes.length}`;
};
export const runLabel = (options: RunOptions) =>
  `${roadFor(options.mode).label} / ${roadFor(options.mode, options.laneCount).lanes.length} ${roadFor(options.mode, options.laneCount).lanes.length === 1 ? 'lane' : 'lanes'} / ${difficultyFor(options.difficulty).label}`;
