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

test('wheels roll forward on a player model turned to face the road', () => {
  // GameRenderer turns nose-forward (+Z) models around so they drive toward -Z.
  const model = new Object3D();
  model.rotation.y = Math.PI;
  const wheel = new Object3D();
  wheel.userData.radius = 0.35;
  model.add(wheel);
  spinWheels([wheel], 0.1);
  model.updateMatrixWorld(true);
  const top = wheel.localToWorld(new Vector3(0, 0.35, 0));
  assert.ok(top.z < -0.05, 'the top of the tyre moves toward the direction of travel');
  assert.ok(Math.abs(top.z + 0.35 * Math.sin(0.1 / 0.35)) < 1e-9, 'uses the declared radius');
});
