import { PLAYER_BODY } from './road-layout';
import { LANE_WIDTH } from './run-settings';

/** Signed world speeds; oncoming traffic has a negative speed interval. */
export interface RouteBody {
  x: number;
  z: number;
  width: number;
  length: number;
  speedMin: number;
  speedMax: number;
  targetX?: number;
}
export interface RouteContext {
  lanes: readonly number[];
  startX: number;
  /** The current steering target, when the player is already between lanes. */
  startTargetX?: number;
  playerMinSpeed: number;
  playerMaxSpeed: number;
  reactionSeconds?: number;
  steerSeconds?: number;
}
export interface RouteWaypoint {
  /** Seconds from the supplied state. Repeated lanes mark waiting/departure. */
  time: number;
  lane: number;
}
export interface ContactWindow {
  start: number;
  end: number;
}

export const ROUTE_REACTION_SECONDS = 0.45;
export const ROUTE_STEER_SECONDS = 0.65;
export const ROUTE_BODY_MARGIN = 0.15;
export const FLIGHT_CYCLE_SECONDS = 2.9;
const STEERING_RATE = 11;
const TIME_MARGIN = 1e-6;

/** The full possible physical contact window under signed speed envelopes. */
export function contactWindow(
  context: Pick<RouteContext, 'playerMinSpeed' | 'playerMaxSpeed'>,
  body: RouteBody,
): ContactWindow | null {
  if (
    ![
      context.playerMinSpeed,
      context.playerMaxSpeed,
      body.z,
      body.length,
      body.speedMin,
      body.speedMax,
    ].every(Number.isFinite) ||
    body.length < 0 ||
    body.speedMin > body.speedMax ||
    context.playerMinSpeed > context.playerMaxSpeed
  )
    return null;
  const q = -body.z;
  const depth = (PLAYER_BODY.length + body.length) / 2 + ROUTE_BODY_MARGIN;
  const cMin = context.playerMinSpeed - body.speedMax;
  const cMax = context.playerMaxSpeed - body.speedMin;
  let start = 0;
  let end = Infinity;
  if (cMax > 0) start = Math.max(start, (q - depth) / cMax);
  else if (cMax < 0) end = Math.min(end, (q - depth) / cMax);
  else if (q > depth) return null;
  if (cMin > 0) end = Math.min(end, (q + depth) / cMin);
  else if (cMin < 0) start = Math.max(start, (q + depth) / cMin);
  else if (q < -depth) return null;
  if (end < start || end < 0) return null;
  return { start: Math.max(0, start - TIME_MARGIN), end: end + TIME_MARGIN };
}

interface Interval {
  start: number;
  end: number;
}
interface Reservation extends Interval {
  minX: number;
  maxX: number;
}
interface SafeInterval extends Interval {
  laneIndex: number;
  arrival: number;
  previous: SafeInterval | null;
  departure: number;
  visited: boolean;
}

/**
 * A conservative ground-route certificate, rather than a count of empty lanes.
 *
 * At time t a body's distance ahead is in [q-cMax*t, q-cMin*t], where
 * q=-z and c=[playerMin-speedMax, playerMax-speedMin]. Its contact interval
 * solves q-cMax*t <= depth && q-cMin*t >= -depth. Reserving that entire
 * interval covers every speed history within the supplied envelopes.
 *
 * The graph consists of free time intervals in each lane. Adjacent nodes are
 * connected only while BOTH lanes remain free for the whole steering time.
 * This reserves the continuous lateral sweep, including finite settling.
 * New bodies and every proposed NPC maneuver must pass this same check.
 */
export function findReachableRoute(
  context: RouteContext,
  bodies: readonly RouteBody[],
): RouteWaypoint[] | null {
  const { lanes } = context;
  if (
    !lanes.length ||
    !Number.isFinite(context.startX) ||
    !Number.isFinite(context.playerMinSpeed) ||
    !Number.isFinite(context.playerMaxSpeed) ||
    context.playerMinSpeed > context.playerMaxSpeed
  )
    return null;
  const reaction = Math.max(0, context.reactionSeconds ?? ROUTE_REACTION_SECONDS);
  const steer = Math.max(ROUTE_STEER_SECONDS, context.steerSeconds ?? ROUTE_STEER_SECONDS);
  if (!Number.isFinite(reaction) || !Number.isFinite(steer)) return null;
  let startLane = 0;
  for (let i = 1; i < lanes.length; i++) {
    if (!Number.isFinite(lanes[i]) || lanes[i] - lanes[i - 1] !== 1) return null;
    if (
      Math.abs(lanes[i] * LANE_WIDTH - context.startX) <
      Math.abs(lanes[startLane] * LANE_WIDTH - context.startX)
    )
      startLane = i;
  }
  if (!Number.isFinite(lanes[0])) return null;
  const startLaneX = lanes[startLane] * LANE_WIDTH;
  const targetX = context.startTargetX ?? startLaneX;
  if (!Number.isFinite(targetX)) return null;
  const reactionX = targetX + (context.startX - targetX) * Math.exp(-STEERING_RATE * reaction);
  const settleDistance = Math.abs(reactionX - startLaneX);
  const settle =
    settleDistance > ROUTE_BODY_MARGIN
      ? Math.max(steer, Math.log(settleDistance / ROUTE_BODY_MARGIN) / STEERING_RATE)
      : 0;
  const ready = reaction + settle;
  const initialMinX = Math.min(context.startX, reactionX, startLaneX);
  const initialMaxX = Math.max(context.startX, reactionX, startLaneX);
  const reservations: Reservation[] = [];
  let horizon = ready + steer;
  for (const body of bodies) {
    if (
      ![
        body.x,
        body.z,
        body.width,
        body.length,
        body.speedMin,
        body.speedMax,
        body.targetX ?? body.x,
      ].every(Number.isFinite) ||
      body.width < 0 ||
      body.length < 0 ||
      body.speedMin > body.speedMax
    )
      return null;
    const window = contactWindow(context, body);
    if (!window) continue;
    const { start, end } = window;
    // At least one endpoint of any touched adjacent-lane sweep must be reserved,
    // including narrow bodies positioned exactly between the lane centres.
    const halfWidth = Math.max(
      LANE_WIDTH / 2,
      (PLAYER_BODY.width + body.width) / 2 + ROUTE_BODY_MARGIN,
    );
    const minX = Math.min(body.x, body.targetX ?? body.x) - halfWidth;
    const maxX = Math.max(body.x, body.targetX ?? body.x) + halfWidth;
    if (start <= ready && end >= 0 && minX <= initialMaxX && maxX >= initialMinX) return null;
    reservations.push({ start, end, minX, maxX });
    horizon = Math.max(horizon, (Number.isFinite(end) ? end : start) + steer + reaction);
  }

  const byLane: SafeInterval[][] = [];
  const nodes: SafeInterval[] = [];
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
    const x = lanes[laneIndex] * LANE_WIDTH;
    const blocked = reservations
      .filter((entry) => x >= entry.minX && x <= entry.maxX)
      .sort((a, b) => a.start - b.start);
    const safe: SafeInterval[] = [];
    const append = (start: number, end: number) => {
      if (end <= start) return;
      const node: SafeInterval = {
        start,
        end,
        laneIndex,
        arrival: Infinity,
        previous: null,
        departure: 0,
        visited: false,
      };
      safe.push(node);
      nodes.push(node);
    };
    let cursor = 0;
    for (const entry of blocked) {
      if (entry.start > cursor) append(cursor, Math.min(entry.start, horizon));
      cursor = Math.max(cursor, entry.end);
      if (cursor >= horizon) break;
    }
    if (cursor < horizon) append(cursor, horizon);
    byLane.push(safe);
  }
  const initial = byLane[startLane].find((node) => node.start === 0 && node.end >= ready);
  if (!initial) return null;
  initial.arrival = ready;
  let finish: SafeInterval | null = null;
  for (;;) {
    let current: SafeInterval | null = null;
    for (const node of nodes)
      if (
        !node.visited &&
        Number.isFinite(node.arrival) &&
        (!current || node.arrival < current.arrival)
      )
        current = node;
    if (!current) return null;
    if (current.end >= horizon) {
      finish = current;
      break;
    }
    current.visited = true;
    for (const neighborIndex of [current.laneIndex - 1, current.laneIndex + 1]) {
      if (neighborIndex < 0 || neighborIndex >= lanes.length) continue;
      for (const neighbor of byLane[neighborIndex]) {
        if (neighbor.visited || neighbor.end <= current.arrival) continue;
        const depart = Math.max(current.arrival, neighbor.start);
        const arrive = depart + steer;
        if (arrive > Math.min(current.end, neighbor.end) || arrive >= neighbor.arrival) continue;
        neighbor.arrival = arrive;
        neighbor.previous = current;
        neighbor.departure = depart;
      }
    }
  }
  const reverse: SafeInterval[] = [];
  for (let node: SafeInterval | null = finish; node; node = node.previous) reverse.push(node);
  reverse.reverse();
  const route: RouteWaypoint[] = [{ time: 0, lane: lanes[startLane] }];
  const append = (time: number, laneIndex: number) => {
    const last = route[route.length - 1];
    if (last.time !== time || last.lane !== lanes[laneIndex])
      route.push({ time, lane: lanes[laneIndex] });
  };
  append(ready, startLane);
  for (let i = 1; i < reverse.length; i++) {
    append(reverse[i].departure, reverse[i - 1].laneIndex);
    append(reverse[i].arrival, reverse[i].laneIndex);
  }
  append(horizon, finish.laneIndex);
  return route;
}

/**
 * Holding lift for .75s and coasting gives y(t)=5.4t+4.6(1-e^-3.2t)/3.2
 * during lift, followed by gravity 18m/s². At the simulation's 120Hz step it
 * clears 4.1m for >1s, peaks below 6.3m and lands before 2s. This stays below
 * gantries and 8m sky barricades, and covers the longest catalog body at the
 * minimum cruise/traffic closure. Add the energy spent / ground recharge and
 * .15s timing margin; the shipped profiles all fit a 2.9s encounter cycle.
 */
export function flightCycleSeconds(profile: {
  flightDrain: number;
  groundRecharge: number;
}): number {
  return profile.groundRecharge > 0 && profile.flightDrain >= 0
    ? Math.max(
        FLIGHT_CYCLE_SECONDS,
        2 + (0.75 * profile.flightDrain) / profile.groundRecharge + 0.15,
      )
    : Infinity;
}

/**
 * Centre separation for bodies sharing a relative-speed envelope. Different
 * traffic speeds also require checking the earlier body's latest exit against
 * the later body's earliest entry; spatial separation alone cannot certify it.
 */
export function requiredEncounterGap(
  maxClosing: number,
  lengthA: number,
  lengthB: number,
  cycleSeconds = FLIGHT_CYCLE_SECONDS,
): number {
  return (
    maxClosing * cycleSeconds + PLAYER_BODY.length + (lengthA + lengthB) / 2 + 2 * ROUTE_BODY_MARGIN
  );
}
