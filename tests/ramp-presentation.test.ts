import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

const modulePromise = import('../src/game/ramp-presentation.ts').catch(() => null);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('left and right rolls bank the visible body toward their world-side launch direction', async () => {
  const api = await modulePromise;
  assert.ok(api, 'a shared visual roll helper is required');
  const left = api.rollVisualAngle(-1, 0.75, 1);
  const right = api.rollVisualAngle(1, 0.75, 1);
  near(left, Math.PI / 2);
  near(right, -Math.PI / 2);
  const roof = new THREE.Vector3(0, 1, 0);
  assert.ok(
    roof.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), left).x < 0,
    'left launch roof must move to world left',
  );
  assert.ok(
    roof.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), right).x > 0,
    'right launch roof must move to world right',
  );
});

test('manual and longer ramp rolls use their own duration with equivalent progress', async () => {
  const api = await modulePromise;
  assert.ok(api);
  near(api.rollVisualAngle(1, 0.325, 0.65), -Math.PI);
  near(api.rollVisualAngle(1, 0.5, 1), -Math.PI);
  near(api.rollVisualAngle(-1, 1, 1), 0);
  near(api.rollVisualAngle(-1, 0.01, 1), Math.PI * 2 * 0.99);
  near(api.rollVisualAngle(-1, 0, 1), 0);
});

test('invalid timing cannot invert or poison the player transform', async () => {
  const api = await modulePromise;
  assert.ok(api);
  for (const value of [NaN, Infinity, -1]) near(api.rollVisualAngle(1, value, 1), 0);
  near(api.rollVisualAngle(1, 2, 1), 0);
  assert.ok(Number.isFinite(api.rollVisualAngle(1, 0.2, 0)));
});
