import {
  Simulation,
  EMPTY_CONTROLS,
  type Controls,
  type Entity,
} from '../../src/game/simulation.ts';
import {
  LANE_WIDTH,
  roadFor,
  difficultyFor,
  type RunOptions,
} from '../../src/game/run-settings.ts';
import { PLAYER_BODY } from '../../src/game/road-layout.ts';
import { trafficBounds, trafficSpec } from '../../src/game/traffic-catalog.ts';
import {
  contactWindow,
  ROUTE_STEER_SECONDS,
  type RouteBody,
} from '../../src/game/route-planner.ts';
function physicalBody(entity: Entity, options: RunOptions): RouteBody | null {
  if (entity.passed || entity.y > 1.24 || (entity.kind === 'pickup' && entity.pickup !== 'rocket'))
    return null;
  const bounds =
    entity.kind === 'traffic'
      ? trafficBounds(entity.variant)
      : entity.kind === 'ramp'
        ? { width: 3.1, length: 8 }
        : entity.kind === 'barrier'
          ? { width: 3, length: 0.85 }
          : { width: 0.27, length: 0.3 };
  const speed =
    entity.kind === 'traffic'
      ? trafficSpec(entity.variant).cruiseSpeed * difficultyFor(options.difficulty).trafficSpeed
      : 0;
  return {
    ...bounds,
    x: entity.x,
    z: entity.z,
    speedMin: entity.direction === -1 ? -speed : 0,
    speedMax: entity.direction === -1 ? 0 : speed,
    targetX: entity.targetLane === undefined ? undefined : entity.targetLane * LANE_WIDTH,
  };
}

/** Ordinary controls only: no state edits, invincibility or removed obstacles. */
export function createCourseDriver(options: RunOptions): (game: Simulation) => Controls {
  let previous: Controls = { ...EMPTY_CONTROLS },
    liftUntil = 0;
  const rules = difficultyFor(options.difficulty),
    road = roadFor(options.mode, options.laneCount);
  return (game: Simulation) => {
    const s = game.state;
    const input: Controls = { ...EMPTY_CONTROLS };
    if (road.lanes.length === 1) {
      if (s.time < liftUntil) input.fly = true;
      else if (s.y < 0.01) {
        const nearest = s.entities
          .filter((e) => !e.passed && e.y === 0 && (e.kind === 'traffic' || e.kind === 'barrier'))
          .map((e) => {
            const bounds = e.kind === 'traffic' ? trafficBounds(e.variant) : { length: 0.85 };
            const closing =
              s.speed - (e.kind === 'traffic' ? (e.speed ?? 0) * (e.direction ?? 1) : 0);
            return (-e.z - (bounds.length + PLAYER_BODY.length) / 2) / closing;
          })
          .filter((t) => t >= 0)
          .sort((a, b) => a - b)[0];
        if (nearest !== undefined && nearest <= 0.6) {
          liftUntil = s.time + 0.75;
          input.fly = true;
        }
      }
    } else if (!previous.left && !previous.right && Math.abs(s.x - s.lane * LANE_WIDTH) < 0.13) {
      const route = game.getCourseRoute();
      if (route) {
        const next = route.findIndex(
          (point, index) => index > 0 && point.lane !== route[index - 1].lane,
        );
        if (next > 0 && route[next - 1].time <= 0.46) {
          const target = route[next].lane * LANE_WIDTH;
          const minX = Math.min(s.x, target),
            maxX = Math.max(s.x, target);
          const safe = s.entities.every((entity) => {
            const body = physicalBody(entity, options);
            if (!body) return true;
            const half = (body.width + PLAYER_BODY.width) / 2 + 0.15;
            if (
              Math.min(body.x, body.targetX ?? body.x) - half > maxX ||
              Math.max(body.x, body.targetX ?? body.x) + half < minX
            )
              return true;
            const window = contactWindow(
              { playerMinSpeed: rules.cruiseSpeed, playerMaxSpeed: rules.rocketSpeed },
              body,
            );
            return !window || window.start > ROUTE_STEER_SECONDS;
          });
          if (safe) {
            input.left = target < s.x;
            input.right = target > s.x;
          }
        }
      }
    }

    previous = input;
    return input;
  };
}
