import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findReachableRoute,
  contactWindow,
  flightCycleSeconds,
  requiredEncounterGap,
  type RouteBody,
  type RouteContext,
} from '../src/game/route-planner.ts';
import { EMPTY_CONTROLS, Simulation } from '../src/game/simulation.ts';
import { difficultyFor } from '../src/game/run-settings.ts';
import { TRAFFIC_CATALOG } from '../src/game/traffic-catalog.ts';

const context = (lanes = [-0.5, 0.5]): RouteContext => ({
  lanes,
  startX: lanes[0] * 3.6,
  playerMinSpeed: 10,
  playerMaxSpeed: 10,
});
const body = (lane: number, encounter: number, extra: Partial<RouteBody> = {}): RouteBody => ({
  x: lane * 3.6,
  z: -encounter * 10,
  width: 1.9,
  length: 1,
  speedMin: 0,
  speedMax: 0,
  ...extra,
});

test('a free lane in each row is insufficient when the escape switches too quickly', () => {
  assert.equal(findReachableRoute(context(), [body(-0.5, 1.5), body(0.5, 2.3)]), null);
});

test('separated alternating rows return a connected route from the actual starting lane', () => {
  const route = findReachableRoute(context(), [body(-0.5, 1.5), body(0.5, 3.3)]);
  assert.ok(route);
  assert.equal(route[0].lane, -0.5);
  assert.equal(route[0].time, 0);
  const changes = route.filter((point, index) => index && point.lane !== route[index - 1].lane);
  assert.deepEqual(
    changes.map((point) => point.lane),
    [0.5, -0.5],
  );
  assert.ok(changes[0].time >= 1.1 - 1e-8, 'reaction and steering both consume time');
});

test('different longitudinal rows can coincide because oncoming traffic closes faster', () => {
  const sameDirection = body(-0.5, 2, { speedMin: 5, speedMax: 5 });
  const oncoming = body(0.5, 6, { speedMin: -5, speedMax: -5 });
  assert.equal(findReachableRoute(context(), [sameDirection, oncoming]), null);
});

test('contact windows use signed traffic speeds and detect compressed encounter order', () => {
  const sameDirection = contactWindow(context(), body(-0.5, 2, { speedMin: 5, speedMax: 5 }));
  const oncoming = contactWindow(context(), body(0.5, 6, { speedMin: -5, speedMax: -5 }));
  assert.ok(sameDirection && oncoming);
  assert.ok(Math.abs(sameDirection.start - 3.44) < 0.00001);
  assert.ok(Math.abs(sameDirection.end - 4.56) < 0.00001);
  assert.ok(oncoming.start < sameDirection.end && oncoming.end > sameDirection.start);
  const near = contactWindow(context(), body(0, 10, { speedMin: 5, speedMax: 5 }));
  const far = contactWindow(context(), body(0, 30, { speedMin: -10, speedMax: -10 }));
  assert.ok(near && far);
  assert.ok(far.end < near.start, 'a farther body can reach the player before a nearer body');
  assert.equal(contactWindow(context(), body(-0.5, -1)), null);
});

test('a lane change reserves the full source-to-target sweep', () => {
  const changing = body(-0.5, 3);
  assert.ok(findReachableRoute(context(), [changing]));
  assert.equal(findReachableRoute(context(), [{ ...changing, targetX: 1.8 }]), null);
});

test('wide bodies block every geometrically intersected lane rather than only their centre', () => {
  assert.equal(findReachableRoute(context([-1, 0, 1]), [body(0, 4, { width: 13 })]), null);
});

test('a narrow body between lane centres still reserves a continuous steering sweep', () => {
  assert.equal(findReachableRoute(context(), [body(0, 1, { width: 0 }), body(-0.5, 1.7)]), null);
});

test('initial recentering checks the swept body at the actual x position', () => {
  const betweenLanes = { ...context(), startX: 0 };
  assert.equal(findReachableRoute(betweenLanes, [body(0.5, 0.5)]), null);
  assert.ok(findReachableRoute(betweenLanes, [body(0.5, 3)]));
});

test('passed bodies are ignored and an obstacle already overlapping the player is rejected', () => {
  assert.ok(findReachableRoute(context(), [body(-0.5, -1)]));
  assert.equal(findReachableRoute(context(), [body(-0.5, 0)]), null);
});

test('a reachable witness clears every blocked interval during every steering transition', () => {
  const bodies = [body(-0.5, 1.5), body(0.5, 3.3)];
  const route = findReachableRoute(context(), bodies);
  assert.ok(route);
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1];
    const to = route[index];
    assert.ok(to.time >= from.time);
    for (const hazard of bodies) {
      const depth = (4.3 + hazard.length) / 2 + 0.15;
      const enter = (-hazard.z - depth) / 10;
      const exit = (-hazard.z + depth) / 10;
      if (to.time < enter || from.time > exit) continue;
      assert.notEqual(from.lane * 3.6, hazard.x);
      assert.notEqual(to.lane * 3.6, hazard.x);
    }
  }
});

test('flight spacing includes the full recharge cycle and physical obstacle lengths', () => {
  for (const [flightDrain, groundRecharge] of [
    [16, 34],
    [20, 28],
    [24, 24],
  ]) {
    assert.ok(flightCycleSeconds({ flightDrain, groundRecharge }) >= 2.9);
  }
  assert.ok(flightCycleSeconds({ flightDrain: 48, groundRecharge: 12 }) > 4.9);
  assert.ok(requiredEncounterGap(100, 16.12, 15.2) >= 290 + (16.12 + 15.2) / 2);
});

test('the flight cycle clears the real fleet without protection and fully recharges', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const rules = difficultyFor(difficulty);
    for (const [variant, spec] of TRAFFIC_CATALOG.entries()) {
      const game = new Simulation(123, { mode: 'normal', difficulty, laneCount: 1 });
      game.start();
      const closing = rules.cruiseSpeed - spec.cruiseSpeed * rules.trafficSpeed;
      const collisionDepth = (4.3 + spec.length) / 2 - 0.45;
      game.state.entities = [
        {
          id: 900,
          kind: 'traffic',
          x: 0,
          y: 0,
          z: -closing * 0.58 - collisionDepth,
          lane: 0,
          variant,
          direction: 1,
          speed: spec.cruiseSpeed * rules.trafficSpeed,
        },
      ];
      let peak = 0;
      for (let frame = 0; frame < 348; frame++) {
        game.update(1 / 120, { ...EMPTY_CONTROLS, fly: frame < 90 });
        peak = Math.max(peak, game.state.y);
        assert.equal(
          game.state.status,
          'playing',
          `${difficulty}/${spec.id} must have a real flight escape`,
        );
        assert.equal(game.state.invincible, 0);
        assert.equal(game.state.shield, 0);
      }
      assert.ok(peak < 6.3, 'the flight remains below gantries and 8m sky barricades');
      assert.equal(game.state.y, 0);
      assert.equal(
        game.state.air,
        100,
        `${difficulty}/${spec.id} must restore its spent flight energy`,
      );
    }
  }
});
