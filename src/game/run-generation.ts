import { roadFor, type ResolvedRunOptions } from './run-settings';
import type { PickupKind } from './simulation';

export interface SpawnSpec {
  kind: 'traffic' | 'pickup' | 'ramp';
  lane: number;
  z: number;
  y?: number;
  pickup?: PickupKind;
}

/** Vary encounter timing without shortening the caller's minimum reaction gap. */
export function randomGap(base: number, minimum: number, random: () => number): number {
  const low = Math.max(minimum, base * 0.85);
  const high = Math.max(minimum, base * 1.25);
  return low + (high - low) * random();
}

/** Every item appears before a bag refills; each refill gets a new shuffle. */
export function createShuffledBag<T>(items: readonly T[], random: () => number): () => T {
  if (!items.length) throw new RangeError('A shuffled bag needs at least one item.');
  const source = [...items];
  let bag: T[] = [];
  let cursor = 0;
  let previous: T | undefined;
  let hasPrevious = false;
  return () => {
    if (cursor >= bag.length) {
      bag = [...source];
      for (let index = bag.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [bag[index], bag[other]] = [bag[other], bag[index]];
      }
      if (bag.length > 1 && hasPrevious && Object.is(bag[0], previous)) {
        const other = 1 + Math.floor(random() * (bag.length - 1));
        [bag[0], bag[other]] = [bag[other], bag[0]];
      }
      cursor = 0;
    }
    previous = bag[cursor++];
    hasPrevious = true;
    return previous;
  };
}

/** Reserve an approachable opening before adding NPCs around its reward routes. */
export function generateOpening(options: ResolvedRunOptions, random: () => number): SpawnSpec[] {
  const road = roadFor(options.mode, options.laneCount);
  const pickLane = () => road.lanes[Math.floor(random() * road.lanes.length)];
  const trailLane = pickLane();
  const boltCount = 4 + Math.floor(random() * 4);
  let boltDepth = 35 + random() * 20;
  const opening: SpawnSpec[] = [];
  for (let index = 0; index < boltCount; index++) {
    if (index) boltDepth += 9 + random() * 8;
    opening.push({ kind: 'pickup', lane: trailLane, z: -boltDepth, y: 1.15, pickup: 'bolt' });
  }
  const rampLane = pickLane();
  const rampDepth = 210 + random() * 90;
  opening.push({ kind: 'ramp', lane: rampLane, z: -rampDepth });

  // The starting lane remains readable even at the fastest oncoming closure.
  const npcLanes = road.lanes.filter((lane) => lane !== road.startLane);
  if (!npcLanes.length) return opening;
  const nextLane = createShuffledBag(npcLanes, random);
  const count = 1 + Math.floor(random() * Math.min(3, npcLanes.length));
  for (let index = 0; index < count; index++) {
    const lane = nextLane();
    let depth = 150 + random() * 110;
    if (lane === trailLane) depth = Math.max(depth, boltDepth + 38 + random() * 18);
    if (lane === rampLane && Math.abs(depth - rampDepth) < 38)
      depth = rampDepth + 38 + random() * 45;
    opening.push({ kind: 'traffic', lane, z: -depth });
  }
  return opening;
}
