import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAFFIC_CATALOG,
  TRAFFIC_PAINTS,
  trafficBounds,
  trafficSpec,
} from '../src/game/traffic-catalog.ts';

test('the fleet has 24 unique, physically usable vehicle definitions and eight finishes', () => {
  assert.equal(TRAFFIC_CATALOG.length, 24);
  assert.equal(new Set(TRAFFIC_CATALOG.map((s) => s.id)).size, 24);
  assert.equal(TRAFFIC_PAINTS.length, 8);
  for (const [i, s] of TRAFFIC_CATALOG.entries()) {
    assert.ok(s.width > 1.6 && s.width < 2.7 && s.height > 1 && s.length > 3.5);
    assert.ok(s.cruiseSpeed >= 12 && s.cruiseSpeed < 40 && s.weight > 0);
    for (const z of s.axles) assert.ok(Math.abs(z) + s.wheelRadius < s.length / 2);
    assert.deepEqual(trafficBounds(i), { width: s.width, height: s.height, length: s.length });
  }
  assert.equal(trafficSpec(-1).id, 'semi');
  assert.equal(trafficSpec(NaN).id, 'sedan');
});
