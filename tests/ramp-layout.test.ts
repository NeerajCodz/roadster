import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRamp, RAMP_LAYOUT, normalizeRampKind } from '../src/game/ramp-layout.ts';
test('curved decks rise smoothly and their mirrored banking tips the car in the indicated direction', () => {
  const a = sampleRamp('straight', 0),
    b = sampleRamp('straight', 0.5),
    c = sampleRamp('straight', 1);
  assert.equal(a.z, 4);
  assert.equal(c.z, -4);
  assert.ok(c.y > 1.6 && b.y > a.y && c.y - b.y > b.y - a.y);
  assert.ok(c.pitch > 0.3 && c.bank === 0);
  for (const t of [0, 0.2, 0.5, 0.8, 1])
    for (const u of [-1, 0, 1]) {
      const left = sampleRamp('roll-left', t, u),
        right = sampleRamp('roll-right', t, -u);
      assert.ok(Math.abs(left.x + right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9);
      assert.ok(left.y >= 0 && Math.abs(left.x) <= RAMP_LAYOUT.width / 2);
    }
  assert.ok(sampleRamp('roll-left', 1).bank > 0);
  assert.ok(sampleRamp('roll-right', 1).bank < 0);
  assert.equal(normalizeRampKind(undefined), 'straight');
});
