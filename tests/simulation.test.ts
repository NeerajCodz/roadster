import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_CONTROLS,
  Simulation,
  type Controls,
  type Entity,
  type PickupKind,
} from '../src/game/simulation.ts';

const controls = (changes: Partial<Controls> = {}): Controls => ({ ...EMPTY_CONTROLS, ...changes });
const advance = (game: Simulation, seconds: number, input = controls(), clearRoad = true) => {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    if (clearRoad) game.state.entities = [];
    game.update(seconds / frames, input);
  }
};
const playing = () => {
  const game = new Simulation(123);
  game.start();
  game.state.entities = [];
  return game;
};
const obstacle = (changes: Partial<Entity> = {}): Entity => ({
  id: 999,
  kind: 'traffic',
  x: 0,
  y: 0,
  z: -2,
  lane: 0,
  variant: 0,
  ...changes,
});
const collect = (game: Simulation, pickup: PickupKind, changes: Partial<Entity> = {}) => {
  game.state.entities = [obstacle({ kind: 'pickup', pickup, y: 1, z: 0, ...changes })];
  game.update(1 / 60, controls());
};

test('menu and pause freeze the run; resume continues and menu ends it', () => {
  const game = new Simulation(123);
  game.update(1, controls({ accelerate: true }));
  assert.equal(game.state.distance, 0);
  game.start();
  advance(game, 0.5);
  assert.ok(game.state.distance > 0);
  game.pause();
  const frozen = { time: game.state.time, distance: game.state.distance, air: game.state.air };
  game.update(0.1, controls({ fly: true }));
  assert.deepEqual(
    { time: game.state.time, distance: game.state.distance, air: game.state.air },
    frozen,
  );
  game.resume();
  game.update(0.1, controls());
  assert.ok(game.state.distance > frozen.distance);
  game.menu();
  assert.equal(game.state.status, 'menu');
  game.update(0.1, controls());
  assert.equal(game.state.distance, 0);
});

test('a held lane key changes one lane, release permits another, and road edges clamp', () => {
  const game = playing();
  advance(game, 0.5, controls({ right: true }));
  assert.equal(game.state.lane, 1);
  assert.ok(game.state.x > 3.2 && game.state.x <= 3.6);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ right: true }));
  assert.equal(game.state.lane, 2);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ right: true }));
  assert.equal(game.state.lane, 2);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ left: true, right: true }));
  assert.equal(game.state.lane, 2);
});

test('acceleration raises speed and releasing settles toward cruise', () => {
  const game = playing();
  const initial = game.state.speed;
  advance(game, 2, controls({ accelerate: true }));
  assert.ok(game.state.speed > initial + 12);
  assert.equal(game.state.boosting, true);
  const boosted = game.state.speed;
  advance(game, 2);
  assert.ok(game.state.speed < boosted - 8);
  assert.equal(game.state.boosting, false);
});

test('holding flight climbs with finite air; releasing lands and recharges', () => {
  const game = playing();
  advance(game, 1, controls({ fly: true }));
  assert.ok(game.state.y > 3);
  assert.ok(game.state.air > 70 && game.state.air < 90);
  advance(game, 3);
  assert.equal(game.state.y, 0);
  assert.ok(game.state.air > 90);
});

test('exhausted flight lands even with the button held and never escapes altitude limits', () => {
  const game = playing();
  let highest = 0;
  for (let i = 0; i < 600; i++) {
    game.state.entities = [];
    game.update(1 / 60, controls({ fly: true }));
    highest = Math.max(highest, game.state.y);
    assert.ok(game.state.air >= 0 && game.state.air <= 100);
  }
  assert.ok(highest <= 18);
  assert.equal(game.state.y, 0);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ fly: true }));
  assert.ok(game.state.y > 0, 'releasing resets the exhausted flight latch');
});

test('dive brings a flying car down faster', () => {
  const normal = playing();
  const diving = playing();
  normal.state.y = diving.state.y = 12;
  advance(normal, 0.5);
  advance(diving, 0.5, controls({ dive: true }));
  assert.ok(diving.state.y < normal.state.y - 2);
});

test('traffic collision crashes and later updates cannot resume a crashed run', () => {
  const game = playing();
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
  assert.ok(game.state.events.some((event) => event.type === 'crash'));
  const distance = game.state.distance;
  game.resume();
  game.update(1, controls({ fly: true }));
  assert.equal(game.state.status, 'crashed');
  assert.equal(game.state.distance, distance);
});

test('flying over ground traffic avoids collision but a sky barricade still hits', () => {
  const game = playing();
  game.state.y = 8;
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'playing');
  game.state.entities = [obstacle({ kind: 'barrier', y: 8 })];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
});

test('barrel roll grants collision protection and cannot repeat from a held key', () => {
  const game = playing();
  game.state.y = 5;
  game.state.entities = [obstacle({ kind: 'barrier', y: 5 })];
  game.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(game.state.status, 'playing');
  assert.ok(game.state.roll > 0 && game.state.invincible > 0);
  assert.equal(game.state.rollDirection, -1);
  advance(game, 3, controls({ rollLeft: true }));
  assert.equal(game.state.roll, 0);
  assert.equal(game.state.invincible, 0);
  game.update(1 / 60, controls());
  game.state.y = 5;
  game.update(1 / 60, controls({ rollRight: true }));
  assert.ok(game.state.roll > 0);
  assert.equal(game.state.rollDirection, 1);
});

test('Q and E on the road cannot roll, spend air, change lane or award protection and tricks', () => {
  for (const action of ['rollLeft', 'rollRight'] as const) {
    const game = playing();
    game.update(1 / 60, controls({ [action]: true }));
    assert.equal(game.state.y, 0);
    assert.equal(game.state.roll, 0);
    assert.equal(game.state.rollCooldown, 0);
    assert.equal(game.state.lane, 0);
    assert.equal(game.state.air, 100);
    assert.equal(game.state.invincible, 0);
    assert.equal(game.state.combo, 1);
    assert.ok(!game.state.events.some((event) => event.type === 'roll'));
  }
});

test('holding a rejected ground roll while taking off does not queue a later flip', () => {
  const game = playing();
  advance(game, 0.5, controls({ fly: true, rollRight: true }));
  assert.ok(game.state.y > 2);
  assert.equal(game.state.roll, 0);
  assert.equal(game.state.lane, 0);
  game.update(1 / 60, controls({ fly: true }));
  game.update(1 / 60, controls({ fly: true, rollRight: true }));
  assert.ok(game.state.roll > 0, 'pressing again after takeoff accepts an airborne roll');
});

test('a car resting on a traffic roof cannot barrel roll', () => {
  const game = playing();
  game.state.y = 2.21;
  game.state.vy = -2;
  game.state.entities = [obstacle({ variant: 4, z: 0 })];
  game.update(1 / 60, controls());
  assert.equal(game.state.y, 2.2, 'fixture lands on the van roof');
  game.update(1 / 60, controls({ rollRight: true }));
  assert.equal(game.state.roll, 0);
  assert.equal(game.state.lane, 0);
  assert.equal(game.state.air, 100);
});

test('landing on the road immediately stops an active airborne roll', () => {
  const game = playing();
  game.state.y = 2;
  game.state.vy = -20;
  game.update(1 / 60, controls({ rollRight: true }));
  assert.ok(game.state.roll > 0);
  advance(game, 0.15);
  assert.equal(game.state.y, 0);
  assert.equal(game.state.roll, 0);
});

test('landing on a traffic roof immediately stops an active airborne roll', () => {
  const game = playing();
  game.state.y = 2.21;
  game.state.vy = -2;
  game.state.roll = 0.4;
  game.state.invincible = 0.5;
  game.state.entities = [obstacle({ variant: 4, z: 0 })];
  game.update(1 / 60, controls());
  assert.equal(game.state.y, 2.2);
  assert.equal(game.state.roll, 0);
});

test('shield absorbs one collision and expires; an unprotected later hit crashes', () => {
  const game = playing();
  collect(game, 'shield');
  assert.ok(game.state.shield > 0);
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.shield, 0);
  assert.ok(game.state.events.some((event) => event.type === 'shield'));
  advance(game, 2);
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
});

test('bolts add currency and score exactly once and update events are transient', () => {
  const game = playing();
  const baseline = game.state.score;
  collect(game, 'bolt');
  assert.equal(game.state.bolts, 1);
  assert.ok(game.state.score > baseline + 20);
  assert.equal(game.state.entities.length, 0);
  assert.ok(game.state.events.some((event) => event.type === 'pickup'));
  game.update(1 / 60, controls());
  assert.equal(game.state.bolts, 1);
  assert.equal(game.state.events.length, 0);
});

test('air pickups replenish without overfilling', () => {
  const game = playing();
  game.state.air = 40;
  collect(game, 'air');
  assert.ok(game.state.air >= 70);
  collect(game, 'air');
  collect(game, 'air');
  assert.equal(game.state.air, 100);
});

test('double-score pickup increases the reward for the next bolt', () => {
  const normal = playing();
  const doubled = playing();
  collect(doubled, 'double');
  assert.ok(doubled.state.double > 0);
  const beforeNormal = normal.state.score;
  const beforeDouble = doubled.state.score;
  collect(normal, 'bolt');
  collect(doubled, 'bolt');
  assert.ok(doubled.state.score - beforeDouble > (normal.state.score - beforeNormal) * 1.8);
});

test('magnet collects nearby off-lane bolts while ordinary collection cannot', () => {
  const normal = playing();
  const magnet = playing();
  collect(magnet, 'magnet');
  assert.ok(magnet.state.magnet > 0);
  collect(normal, 'bolt', { x: 3.6, lane: 1, z: -5 });
  collect(magnet, 'bolt', { x: 3.6, lane: 1, z: -5 });
  assert.equal(normal.state.bolts, 0);
  assert.equal(magnet.state.bolts, 1);
});

test('rocket pickup lifts and accelerates the car with temporary protection', () => {
  const game = playing();
  const speed = game.state.speed;
  collect(game, 'rocket');
  advance(game, 0.8);
  assert.ok(game.state.rocket > 0 && game.state.invincible > 0);
  assert.ok(game.state.y > 3);
  assert.ok(game.state.speed > speed + 15);
});

test('a close pass awards one near miss and combo expires without another', () => {
  const game = playing();
  game.state.entities = [obstacle({ x: 2.6, z: 3 })];
  advance(game, 0.2, controls(), false);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.nearMisses, 1);
  assert.ok(game.state.combo > 1);
  assert.ok(game.state.score >= 100);
  advance(game, 0.2, controls(), false);
  assert.equal(game.state.nearMisses, 1);
  advance(game, 6);
  assert.equal(game.state.combo, 1);
});

test('a ramp automatically hops a grounded car without spending air', () => {
  const game = playing();
  game.state.entities = [obstacle({ kind: 'ramp', z: -1 })];
  game.update(1 / 60, controls());
  advance(game, 0.2);
  assert.ok(game.state.y > 1);
  assert.equal(game.state.air, 100);
});

test('opening traffic leaves a fair straight-ahead start and longer runs add traffic', () => {
  const game = new Simulation(77);
  game.start();
  advance(game, 3, controls(), false);
  assert.equal(game.state.status, 'playing');
  game.state.invincible = 1000;
  advance(game, 30, controls(), false);
  assert.ok(game.state.distance > 1000);
  assert.ok(
    game.state.entities.some((entity) => entity.kind === 'traffic' || entity.kind === 'barrier'),
  );
  assert.ok(game.state.entities.every((entity) => entity.z < 40));
});

test('the same seed and controls replay identically; a different seed changes the road', () => {
  const first = new Simulation(4);
  const second = new Simulation(4);
  const other = new Simulation(5);
  for (const game of [first, second, other]) {
    game.start();
    game.state.invincible = 1000;
  }
  for (let frame = 0; frame < 900; frame++) {
    const input = controls({
      accelerate: frame > 120,
      fly: frame > 240 && frame < 300,
      right: frame === 600,
    });
    for (const game of [first, second, other]) game.update(1 / 60, input);
  }
  assert.deepEqual(first.state, second.state);
  assert.notDeepEqual(first.state.entities, other.state.entities);
});

test('ordinary frame rates produce equivalent travel and a stalled frame is bounded', () => {
  const sixty = playing();
  const thirty = playing();
  for (let i = 0; i < 120; i++) sixty.update(1 / 60, controls({ accelerate: true }));
  for (let i = 0; i < 60; i++) thirty.update(1 / 30, controls({ accelerate: true }));
  assert.ok(sixty.state.distance > 100 && thirty.state.distance > 100);
  assert.ok(Math.abs(sixty.state.distance - thirty.state.distance) < 0.02);
  assert.ok(Math.abs(sixty.state.speed - thirty.state.speed) < 0.02);
  const prior = sixty.state.distance;
  sixty.update(99, controls());
  assert.ok(sixty.state.distance - prior < 10);
  const snapshot = structuredClone(sixty.state);
  sixty.update(Number.NaN, controls());
  sixty.update(-1, controls());
  assert.equal(sixty.state.distance, snapshot.distance);
});

test('restart clears a crash and every transient pickup or movement effect', () => {
  const game = playing();
  Object.assign(game.state, {
    status: 'crashed',
    score: 900,
    bolts: 20,
    y: 9,
    vy: 8,
    air: 0,
    lane: 2,
    x: 7.2,
    shield: 3,
    magnet: 3,
    double: 3,
    rocket: 3,
    invincible: 3,
    combo: 5,
    comboTimer: 3,
    roll: 1,
    rollCooldown: 1,
    nearMisses: 3,
  });
  game.start();
  assert.equal(game.state.status, 'playing');
  for (const value of [
    game.state.score,
    game.state.bolts,
    game.state.distance,
    game.state.y,
    game.state.vy,
    game.state.lane,
    game.state.x,
    game.state.shield,
    game.state.magnet,
    game.state.double,
    game.state.rocket,
    game.state.invincible,
    game.state.roll,
    game.state.rollCooldown,
    game.state.nearMisses,
  ])
    assert.equal(value, 0);
  assert.equal(game.state.air, 100);
  assert.equal(game.state.combo, 1);
});

test('a roll shifts exactly one lane and spends eight air', () => {
  const game = playing();
  game.state.y = 5;
  game.update(1 / 60, controls({ rollRight: true }));
  assert.equal(game.state.lane, 1);
  assert.equal(game.state.air, 92);
  advance(game, 0.5, controls({ rollRight: true }));
  assert.equal(game.state.lane, 1);
  assert.ok(game.state.x > 3.2);
});

test('a roll needs eight air and spending the last eight never makes air negative', () => {
  const low = playing();
  low.state.y = 5;
  low.state.air = 7;
  low.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(low.state.lane, 0);
  assert.equal(low.state.roll, 0);
  assert.equal(low.state.invincible, 0);
  assert.equal(low.state.air, 7);
  const enough = playing();
  enough.state.y = 5;
  enough.state.air = 8;
  enough.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(enough.state.lane, -1);
  assert.equal(enough.state.air, 0);
  advance(enough, 0.2, controls({ fly: true }));
  assert.ok(enough.state.y < 5, 'depleted air cannot sustain flight');
});

test('a combo multiplies distance score and combines with double score', () => {
  const ordinary = playing();
  const combo = playing();
  const both = playing();
  combo.state.combo = both.state.combo = 3;
  combo.state.comboTimer = both.state.comboTimer = 4;
  both.state.double = 4;
  for (const game of [ordinary, combo, both]) advance(game, 0.5);
  assert.ok(Math.abs(combo.state.score - ordinary.state.score * 3) < 0.001);
  assert.ok(Math.abs(both.state.score - ordinary.state.score * 6) < 0.001);
});

test('traffic collision height follows the actual vehicle body', () => {
  const sedan = playing();
  const van = playing();
  for (const game of [sedan, van]) {
    game.state.y = 1.8;
    game.state.vy = 0;
  }
  sedan.state.entities = [obstacle({ variant: 0, z: -1 })];
  van.state.entities = [obstacle({ variant: 4, z: -1 })];
  sedan.update(1 / 120, controls());
  van.update(1 / 120, controls());
  assert.equal(sedan.state.status, 'playing', 'a sedan fits below the player');
  assert.equal(van.state.status, 'crashed', 'a tall van still occupies this height');
});

test('long vehicle collision reaches farther forward without an oversized carrier hitbox', () => {
  const sedan = playing();
  const bus = playing();
  const carrier = playing();
  sedan.state.entities = [obstacle({ variant: 0, z: -4.6 })];
  bus.state.entities = [obstacle({ variant: 7, z: -4.6 })];
  carrier.state.entities = [obstacle({ variant: 8, z: -8 })];
  for (const game of [sedan, bus, carrier]) game.update(1 / 120, controls());
  assert.equal(sedan.state.status, 'playing');
  assert.equal(bus.state.status, 'crashed');
  assert.equal(
    carrier.state.status,
    'playing',
    'the carrier is rendered at no more than six metres long',
  );
});

test('descending onto a traffic roof lands safely and awards one roof ride', () => {
  const game = playing();
  game.state.y = 1.55;
  game.state.vy = -5;
  game.state.air = 45;
  game.state.entities = [obstacle({ variant: 0, z: -0.6 })];
  game.update(1 / 30, controls());
  assert.equal(game.state.status, 'playing');
  assert.ok(Math.abs(game.state.y - 1.43) < 0.01);
  assert.equal(game.state.vy, 0);
  assert.equal(game.state.events.filter((event) => event.label === 'ROOF RIDE').length, 1);
  assert.ok(game.state.score >= 100);
  advance(game, 0.5, controls(), false);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.y, 0, 'the player drops back to the road after the vehicle passes');
});

test('an aerial barrier can be flown underneath but hits at its occupied altitude', () => {
  const low = playing();
  const high = playing();
  low.state.y = 5;
  high.state.y = 8;
  for (const game of [low, high])
    game.state.entities = [obstacle({ kind: 'barrier', y: 8, z: -1 })];
  low.update(1 / 60, controls());
  high.update(1 / 60, controls());
  assert.equal(low.state.status, 'playing');
  assert.equal(high.state.status, 'crashed');
});

test('generated roads include all traffic styles and aerial hazards with open lanes', () => {
  const game = new Simulation(123);
  game.start();
  game.state.invincible = 1000;
  const variants = new Set<number>();
  let aerialBarrier = false;
  for (let frame = 0; frame < 7200; frame++) {
    game.update(1 / 60, controls());
    for (const entity of game.state.entities) {
      if (entity.kind === 'traffic') variants.add(entity.variant);
      if (entity.kind === 'barrier' && entity.y >= 7) {
        aerialBarrier = true;
        const blocked = new Set(
          game.state.entities
            .filter(
              (other) =>
                other.kind !== 'pickup' &&
                other.kind !== 'ramp' &&
                Math.abs(other.z - entity.z) < 8,
            )
            .map((other) => other.lane),
        );
        assert.ok(blocked.size < 5, 'a hazard row always leaves a lane open');
      }
    }
  }
  assert.equal(variants.size, 9);
  assert.ok(aerialBarrier, 'flight has an overhead hazard to avoid');
});

test('rolls score a trick and extend the chain once per accepted input', () => {
  const game = playing();
  game.state.y = 5;
  game.update(1 / 60, controls({ rollRight: true }));
  assert.equal(game.state.combo, 2);
  assert.ok(game.state.score >= 150);
  assert.equal(game.state.events.filter((event) => event.type === 'roll').length, 1);
  const prior = game.state.score;
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(game.state.combo, 2);
  assert.ok(game.state.score - prior < 5, 'cooldown cannot farm trick points');
  advance(game, 0.5, controls({ rollLeft: true }));
  assert.equal(game.state.combo, 2);
});

test('big air awards one trick per flight and landing permits another', () => {
  const game = playing();
  let bigAir = 0;
  const fly = () => {
    for (let i = 0; i < 180; i++) {
      game.state.entities = [];
      game.update(1 / 60, controls({ fly: true }));
      bigAir += game.state.events.filter((event) => event.type === 'big-air').length;
    }
  };
  fly();
  assert.equal(bigAir, 1);
  assert.equal(game.state.combo, 2);
  advance(game, 4);
  assert.equal(game.state.y, 0);
  fly();
  assert.equal(bigAir, 2);
});

test('roof riding grows the trick chain once for the same vehicle', () => {
  const game = playing();
  game.state.y = 1.55;
  game.state.vy = -5;
  game.state.entities = [obstacle({ z: -0.6 })];
  game.update(1 / 30, controls());
  assert.equal(game.state.combo, 2);
  const before = game.state.score;
  game.update(1 / 60, controls());
  assert.equal(game.state.combo, 2);
  assert.ok(game.state.score - before < 5);
});

test('kilometre milestones fire once at each crossing and reset on retry', () => {
  const game = playing();
  const labels: string[] = [];
  const cross = () => {
    for (let i = 0; i < 12; i++) {
      game.state.entities = [];
      game.update(1 / 60, controls());
      labels.push(...game.state.events.filter((e) => e.type === 'milestone').map((e) => e.label!));
    }
  };
  game.state.distance = 999;
  cross();
  assert.deepEqual(labels, ['1 KM MILESTONE']);
  game.state.distance = 1999;
  cross();
  assert.deepEqual(labels, ['1 KM MILESTONE', '2 KM MILESTONE']);
  game.start();
  game.state.distance = 999;
  cross();
  assert.equal(labels.filter((label) => label === '1 KM MILESTONE').length, 2);
});

test('traffic warns for a full second before a distant deterministic lane change', () => {
  const first = playing();
  const second = playing();
  for (const game of [first, second]) game.state.entities = [obstacle({ id: 6, z: -280 })];
  let signalAt: number | undefined;
  let moved = false;
  let sawBrakes = false;
  for (let i = 0; i < 480; i++) {
    for (const game of [first, second]) game.update(1 / 120, controls());
    const entity = first.state.entities[0];
    if (entity.signal && signalAt === undefined) signalAt = first.state.time;
    sawBrakes ||= Boolean(entity.braking);
    if (entity.x !== 0 && !moved) {
      assert.ok(signalAt !== undefined);
      assert.ok(first.state.time - signalAt >= 1 - 1e-8);
      assert.ok(entity.z < -75);
      moved = true;
    }
    assert.deepEqual(first.state, second.state);
  }
  assert.ok(moved, 'traffic should make an announced lane change on a clear road');
  assert.ok(sawBrakes, 'traffic should expose a bounded braking phase');
});

test('a newly blocked destination cancels a traffic signal without a close lane swap', () => {
  const game = playing();
  game.state.entities = [obstacle({ id: 6, z: -280 })];
  let destination: number | undefined;
  for (let i = 0; i < 240 && destination === undefined; i++) {
    game.update(1 / 120, controls());
    destination = game.state.entities[0].targetLane;
  }
  assert.notEqual(destination, undefined);
  const leader = game.state.entities[0];
  game.state.entities.push(
    obstacle({ id: 7, x: destination! * 3.6, lane: destination!, z: leader.z, variant: 0 }),
  );
  advance(game, 1.2, controls(), false);
  assert.equal(leader.x, 0);
  assert.equal(leader.targetLane, undefined);
  assert.equal(leader.signal, 0);
  const close = playing();
  close.state.entities = [obstacle({ z: -70, x: -7.2, lane: -2 })];
  advance(close, 1, controls(), false);
  assert.equal(close.state.entities[0].x, -7.2);
  assert.ok(!close.state.entities[0].signal);
});

test('retry clears pending traffic maneuvers and trick state', () => {
  const game = playing();
  game.state.entities = [obstacle({ id: 6, z: -280 })];
  for (let i = 0; i < 180 && !game.state.entities[0].signal; i++) game.update(1 / 120, controls());
  assert.ok(game.state.entities[0].signal);
  game.start();
  game.update(1 / 120, controls());
  const opening = game.state.entities.find((entity) => entity.id === 6)!;
  assert.equal(opening.targetLane, undefined);
  assert.ok(!opening.signal);
  assert.equal(opening.x, -3.6);
  assert.equal(game.state.combo, 1);
});

test('later aerial formations provide paired altitudes and a clear rising/falling bolt route', () => {
  const game = new Simulation(321);
  game.start();
  game.state.invincible = 1000;
  let found = false;
  let oldId = Math.max(...game.state.entities.map((entity) => entity.id));
  for (let i = 0; i < 3600 && !found; i++) {
    game.update(1 / 60, controls());
    const added = game.state.entities.filter((entity) => entity.id > oldId);
    oldId = Math.max(oldId, ...added.map((entity) => entity.id));
    const arc = added
      .filter((entity) => entity.kind === 'pickup' && entity.pickup === 'bolt')
      .sort((a, b) => b.z - a.z);
    if (arc.length >= 7 && arc.some((entity) => entity.y > 5)) {
      assert.ok(arc[0].y < 2 && arc[arc.length - 1].y < 2);
      assert.ok(arc[Math.floor(arc.length / 2)].y > 5);
      assert.equal(new Set(arc.map((entity) => entity.lane)).size, 1);
      assert.ok(added.filter((entity) => entity.kind === 'barrier' && entity.y > 6).length >= 2);
      assert.ok(
        added
          .filter((entity) => entity.kind === 'traffic' || entity.kind === 'barrier')
          .every((entity) => entity.lane !== arc[0].lane),
      );
      found = true;
    }
  }
  assert.ok(found, 'a later wave should deliberately introduce an aerial route');
});

test('an unexpected rocket boost cannot bring a traffic lane change close to the player', () => {
  const game = playing();
  game.state.entities = [obstacle({ id: 6, z: -150 })];
  let started = false;
  let warned = false;
  let finished = false;
  for (let i = 0; i < 480; i++) {
    game.update(1 / 120, controls());
    const entity = game.state.entities[0];
    warned ||= Boolean(entity.signal);
    if (entity.x !== 0 && !started) {
      started = true;
      game.state.rocket = 5;
      game.state.invincible = 6;
    }
    if (started && entity.targetLane === undefined) {
      assert.ok(
        entity.z < -35,
        'a completed maneuver leaves reaction distance even after a sudden boost',
      );
      finished = true;
      break;
    }
  }
  assert.ok(warned, 'the fixture should exercise a pending traffic maneuver');
  assert.ok(
    !started || finished,
    'the change either cancels before starting or completes at a safe distance',
  );
});

test('gantries let ground traffic and high flight pass but stop a body intersecting the panel', () => {
  for (const [height, status] of [
    [0, 'playing'],
    [8.5, 'playing'],
    [9, 'crashed'],
    [13.3, 'playing'],
  ] as const) {
    const game = playing();
    game.state.distance = 98;
    game.state.y = height;
    game.update(1 / 120, controls());
    assert.equal(game.state.status, status, `height ${height}`);
  }
});

test('outer lanes clear the narrower sign panel with their full body but still meet the beam', () => {
  for (const side of [-1, 1]) {
    const panel = playing();
    panel.state.distance = 98;
    panel.state.y = 10;
    panel.state.x = side * 7.2;
    panel.state.lane = side * 2;
    panel.update(1 / 120, controls());
    assert.equal(
      panel.state.status,
      'playing',
      'outer lane body has a real gap beside the 12m panel',
    );
    const beam = playing();
    beam.state.distance = 98;
    beam.state.y = 12.7;
    beam.state.x = side * 7.2;
    beam.state.lane = side * 2;
    beam.update(1 / 120, controls());
    assert.equal(beam.state.status, 'crashed', 'the 24m crossbeam spans every lane');
  }
  const edge = playing();
  edge.state.distance = 98;
  edge.state.y = 10;
  edge.state.x = 7.1;
  edge.state.lane = 2;
  edge.update(1 / 120, controls());
  assert.equal(edge.state.status, 'crashed', 'a body still overlapping the panel edge must hit');
});

test('swept gantry collision catches a fast pass and a crash stays crashed', () => {
  const game = playing();
  game.state.distance = 94;
  game.state.y = 10;
  game.state.speed = 2400;
  game.update(1 / 120, controls());
  assert.equal(game.state.status, 'crashed', 'both frame endpoints can lie outside the thin sign');
  const distance = game.state.distance;
  game.update(1, controls({ fly: true }));
  assert.equal(game.state.status, 'crashed');
  assert.equal(game.state.distance, distance);
});

test('shield or roll protects against one whole gantry and the next gantry remains dangerous', () => {
  for (const effect of ['shield', 'roll'] as const) {
    const game = playing();
    game.state.distance = 98;
    game.state.y = 12.7;
    if (effect === 'shield') game.state.shield = 10;
    game.update(1 / 120, controls(effect === 'roll' ? { rollRight: true } : {}));
    assert.equal(game.state.status, 'playing');
    if (effect === 'shield') {
      assert.equal(game.state.shield, 0);
      assert.equal(game.state.events.filter((event) => event.type === 'shield').length, 1);
    }
    game.state.invincible = 0;
    game.state.y = 12.7;
    game.update(1 / 120, controls());
    assert.equal(game.state.status, 'playing', 'the same protected gantry does not hit twice');
    game.state.distance = 298;
    game.state.y = 12.7;
    game.update(1 / 120, controls());
    assert.equal(game.state.status, 'crashed');
  }
});

test('gantries repeat after one kilometre and retry restores the first collision', () => {
  const game = playing();
  game.state.distance = 1098;
  game.state.y = 10;
  game.update(1 / 120, controls());
  assert.equal(game.state.status, 'crashed');
  game.start();
  game.state.entities = [];
  game.state.distance = 98;
  game.state.y = 10;
  game.update(1 / 120, controls());
  assert.equal(
    game.state.status,
    'crashed',
    'retry resets passed gantry bookkeeping and distance phase',
  );
});

test('generated traffic stays on the road while airborne barricades retain varied heights', () => {
  const heights = new Set<number>();
  let groundTraffic = 0;
  for (const seed of [0, 1, 2, 4, 19, 42, 123, 321, 999, 1729, 65535, 2147483647]) {
    const game = new Simulation(seed);
    game.start();
    game.state.invincible = 1000;
    for (let frame = 0; frame < 5400; frame++) {
      game.update(1 / 60, controls({ accelerate: frame % 1200 > 600 }));
      for (const entity of game.state.entities) {
        if (entity.kind === 'traffic') {
          assert.equal(
            entity.y,
            0,
            `seed ${seed}, distance ${game.state.distance}: traffic must never fly`,
          );
          groundTraffic++;
        } else if (entity.kind === 'barrier' && entity.y > 0) {
          heights.add(entity.y);
          assert.equal(entity.targetLane, undefined);
          assert.ok(!entity.signal && !entity.braking, 'barricades have no traffic maneuvers');
        }
      }
    }
    assert.ok(game.state.distance > 4000, 'the run must include late waves');
  }
  assert.ok(groundTraffic > 0, 'the change preserves road traffic');
  assert.ok(
    heights.size > 4 && heights.has(7.5) && heights.has(11.5),
    'random sky hazards and high/low pairs remain',
  );
});

test('barricade collision covers the full 1.7m frame and 0.85m foot depth', () => {
  const top = playing();
  top.state.y = 1.45;
  top.state.entities = [obstacle({ kind: 'barrier', z: -1 })];
  top.update(1 / 120, controls());
  assert.equal(top.state.status, 'crashed', 'the upper rail occupies this height');
  const feet = playing();
  feet.state.entities = [obstacle({ kind: 'barrier', z: 2.1 })];
  feet.update(1 / 120, controls());
  assert.equal(
    feet.state.status,
    'crashed',
    'the physical foot still overlaps the back of the player',
  );
  for (const [gap, status] of [
    [2.3, 'crashed'],
    [2.4, 'playing'],
  ] as const) {
    const game = playing();
    game.state.entities = [obstacle({ kind: 'barrier', x: gap, z: -1 })];
    game.update(1 / 120, controls());
    assert.equal(
      game.state.status,
      status,
      'the 3m-wide frame keeps the existing collision forgiveness',
    );
  }
});

test('flying barricades hit only their frame height and their underbody boosters remain noncolliding', () => {
  for (const [height, status] of [
    [0, 'playing'],
    [6.7, 'playing'],
    [8.5, 'crashed'],
    [9.5, 'crashed'],
    [9.8, 'playing'],
  ] as const) {
    const game = playing();
    game.state.y = height;
    game.state.entities = [obstacle({ kind: 'barrier', y: 8, z: -1 })];
    game.update(1 / 120, controls());
    assert.equal(game.state.status, status, `player feet at ${height}m`);
  }
});

test('airborne barricades keep their lane and advance by road travel without traffic AI', () => {
  const game = playing();
  game.state.entities = [obstacle({ kind: 'barrier', x: 7.2, lane: 2, y: 11.5, z: -200 })];
  const entity = game.state.entities[0];
  const before = game.state.distance;
  advance(game, 1, controls(), false);
  assert.ok(Math.abs(entity.z + 200 - (game.state.distance - before)) < 1e-8);
  assert.equal(entity.x, 7.2);
  assert.equal(entity.y, 11.5);
  assert.equal(entity.targetLane, undefined);
  assert.ok(!entity.signal && !entity.braking);
});

test('a kilometre milestone grants its score bonus once, including the active multiplier', () => {
  const game = playing();
  game.state.distance = 999.9;
  game.state.combo = 3;
  game.state.comboTimer = 4;
  game.state.double = 4;
  game.update(1 / 120, controls());
  assert.ok(game.state.score >= 1500, '250 points ×3 chain ×2 boost');
  const score = game.state.score;
  game.update(1 / 120, controls());
  assert.ok(game.state.score - score < 10, 'the same milestone cannot grant its bonus twice');
});
