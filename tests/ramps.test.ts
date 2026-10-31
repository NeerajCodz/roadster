import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, EMPTY_CONTROLS, type Entity, type Controls } from '../src/game/simulation.ts';
import { RAMP_KINDS, sampleRamp, type RampKind } from '../src/game/ramp-layout.ts';
import type { RoadModeId } from '../src/game/run-settings.ts';

function fixture(kind: RampKind = 'straight', z = -4.5) {
  const game = new Simulation(123);
  game.start();
  const ramp: Entity = {
    id: 999,
    kind: 'ramp',
    rampKind: kind,
    x: 0,
    y: 0,
    z,
    lane: 0,
    variant: 0,
  };
  game.state.entities = [ramp];
  return { game, ramp };
}
function frames(game: Simulation, count: number, changes: Partial<Controls> = {}) {
  for (let i = 0; i < count; i++) game.update(1 / 120, { ...EMPTY_CONTROLS, ...changes });
}
for (const kind of RAMP_KINDS) {
  test(`${kind}: tyres follow the deck, then launch once with the correct free trick`, () => {
    const { game, ramp } = fixture(kind);
    let hops = 0,
      rolls = 0,
      sawDeck = false,
      sawRoll = false;
    for (let i = 0; i < 120; i++) {
      game.update(1 / 120, EMPTY_CONTROLS);
      hops += game.state.events.filter((e) => e.type === 'hop').length;
      rolls += game.state.events.filter((e) => e.type === 'roll').length;
      if (ramp.z > -3 && ramp.z < 3) {
        const p = sampleRamp(kind, (ramp.z + 4) / 8);
        assert.ok(Math.abs(game.state.y - p.y) < 0.02, 'tyres follow the curved surface');
        assert.ok(Math.abs(game.state.rampBank - p.bank) < 0.02);
        assert.equal(game.getRollReadiness(), 'grounded');
        sawDeck = true;
      }
      if (game.state.roll > 0) {
        assert.ok(ramp.z > 6.15, 'rear bumper clears the lip before rolling');
        assert.equal(game.state.lane, 0, 'ramp trick holds its lane');
        assert.equal(game.state.rollDirection, kind === 'roll-left' ? -1 : 1);
        sawRoll = true;
      }
    }
    assert.ok(sawDeck);
    assert.equal(hops, 1);
    assert.equal(rolls, kind === 'straight' ? 0 : 1);
    assert.equal(sawRoll, kind !== 'straight');
    assert.equal(game.state.air, 100);
  });
}
test('Q/E cannot roll while riding a banked deck, even above road roll clearance', () => {
  const { game, ramp } = fixture('roll-left');
  while (ramp.z < 2.8) frames(game, 1);
  frames(game, 1, { rollRight: true });
  assert.equal(game.state.roll, 0);
  assert.equal(game.state.lane, 0);
  assert.equal(game.state.air, 100);
});
test('flying early or steering off cancels the ramp automatic trick', () => {
  for (const action of ['fly', 'right'] as const) {
    const { game } = fixture('roll-right');
    frames(game, 7);
    frames(game, 110, { [action]: true });
    assert.equal(game.state.roll, 0);
    assert.equal(game.state.rollDirection, 1);
  }
});
test('passing above or beside a ramp never activates it', () => {
  for (const side of ['above', 'beside']) {
    const { game } = fixture('roll-left');
    if (side === 'above') {
      game.state.y = 10;
      game.state.vy = 0;
    } else {
      game.state.x = 3.6;
      game.state.lane = 1;
    }
    let triggered = false;
    for (let i = 0; i < 70; i++) {
      frames(game, 1);
      triggered ||= game.state.events.some((e) => e.type === 'hop' || e.type === 'roll');
    }
    assert.equal(triggered, false);
  }
});

test('steering under the raised side cannot teleport a grounded car onto the ramp', () => {
  for (const kind of ['roll-left', 'roll-right'] as RampKind[]) {
    const { game } = fixture(kind, 1.7);
    game.state.x = kind === 'roll-left' ? 1.5 : -1.5;
    frames(game, 4);
    assert.equal(game.state.y, 0);
    assert.equal(game.state.rampBank, 0);
    assert.equal(game.state.roll, 0);
  }
});

test('a descending car crossing the deck can land without falling through the curved surface', () => {
  const { game, ramp } = fixture('straight', 0);
  game.state.y = sampleRamp('straight', 0.5).y + 0.04;
  game.state.vy = -28;
  frames(game, 1);
  assert.ok(Math.abs(game.state.y - sampleRamp('straight', (ramp.z + 4) / 8).y) < 0.01);
  assert.equal(game.state.vy, 0);
});
test('pause freezes ramp contact and retry clears bank, pitch and pending roll', () => {
  const { game, ramp } = fixture('roll-left');
  while (ramp.z < 1) frames(game, 1);
  game.pause();
  const y = game.state.y,
    z = ramp.z,
    bank = game.state.rampBank;
  game.update(0.1, EMPTY_CONTROLS);
  assert.equal(game.state.y, y);
  assert.equal(ramp.z, z);
  assert.equal(game.state.rampBank, bank);
  game.resume();
  frames(game, 1);
  assert.ok(ramp.z > z);
  game.start();
  assert.equal(game.state.rampBank, 0);
  assert.equal(game.state.rampPitch, 0);
  assert.equal(game.state.roll, 0);
});
test('legacy ramps without kind remain straight and high-speed steps cannot skip the lip', () => {
  const { game, ramp } = fixture('straight', -4.1);
  delete ramp.rampKind;
  game.state.speed = 105;
  game.update(0.1, EMPTY_CONTROLS);
  assert.ok(ramp.passed);
  assert.ok(game.state.y > 1.6);
  assert.ok(game.state.vy > 0);
  assert.equal(game.state.roll, 0);
});

test('generated ramps vary across seeds on narrow and wide roads and explicit seeds replay on retry', () => {
  for (const mode of ['normal', 'two-way', 'opposite'] as RoadModeId[]) {
    for (const laneCount of [mode === 'two-way' ? 2 : 1, 7]) {
      const kinds = new Set<RampKind>();
      for (let seed = 0; seed < 24; seed++) {
        const game = new Simulation(seed, { mode, laneCount, difficulty: 'easy' });
        game.start();
        const ramp = game.state.entities.find((entity) => entity.kind === 'ramp')!;
        kinds.add(ramp.rampKind!);
        const initial = { ...ramp };
        game.start();
        assert.deepEqual(
          game.state.entities.find((entity) => entity.kind === 'ramp'),
          initial,
        );
      }
      assert.deepEqual([...kinds].sort(), [...RAMP_KINDS].sort(), `${mode}/${laneCount}`);
    }
  }
});
