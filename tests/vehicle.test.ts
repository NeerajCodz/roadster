import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Vector3 } from 'three';
import { spinWheels } from '../src/game/vehicle.ts';

test('a steered front wheel spins without moving its local axle', () => {
  const wheel = new Object3D();
  wheel.rotation.y = -Math.PI / 6;
  const before = new Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
  const originalRotation = wheel.quaternion.clone();
  spinWheels([wheel], Math.PI * 0.2);
  const after = new Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
  assert.ok(before.distanceTo(after) < 1e-10, 'axle must not wobble as the tyre spins');
  assert.ok(originalRotation.angleTo(wheel.quaternion) > 1, 'tyre must actually rotate');
});
