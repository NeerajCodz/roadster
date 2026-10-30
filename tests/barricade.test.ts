import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { animateBarricade, createBarricade } from '../src/game/barricade.ts';

const bounds = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
};
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} differs from ${expected}`);
const snapshot = (box: THREE.Box3) => [...box.min.toArray(), ...box.max.toArray()];

test('the detailed collision frame fills the shared body without protruding past it', () => {
  for (const flying of [false, true]) {
    const barricade = createBarricade(flying);
    const frame = barricade.getObjectByName('BarricadeBody');
    assert.ok(frame, 'a separately bounded collision frame is required');
    const box = bounds(frame);
    close(box.min.x, -1.5);
    close(box.max.x, 1.5);
    close(box.min.y, 0);
    close(box.max.y, 1.7);
    close(box.min.z, -0.425);
    close(box.max.z, 0.425);
    const rails = ['UpperRail', 'LowerRail'].map((name) => frame.getObjectByName(name));
    for (const rail of rails) {
      assert.ok(rail instanceof THREE.Mesh);
      const materials = Array.isArray(rail.material) ? rail.material : [rail.material];
      assert.ok(
        materials.some(
          (material) =>
            material instanceof THREE.MeshStandardMaterial &&
            material.map instanceof THREE.DataTexture,
        ),
        'both rails need real striped surfaces without DOM canvas',
      );
    }
    let draws = 0;
    barricade.traverse((object) => {
      if (object instanceof THREE.Mesh)
        draws += Array.isArray(object.material) ? object.material.length : 1;
    });
    assert.ok(draws <= 40, `barricade exceeds the reusable-model draw budget: ${draws}`);
  }
});

test('only flying barricades have exactly two downward boosters below the intact weighted feet', () => {
  const ground = createBarricade(false);
  const flying = createBarricade(true);
  const engines: THREE.Object3D[] = [];
  flying.traverse((object) => {
    if (object.userData.role === 'booster') engines.push(object);
  });
  assert.equal(engines.length, 2);
  assert.deepEqual(engines.map((engine) => engine.name).sort(), ['BoosterLeft', 'BoosterRight']);
  assert.ok(!ground.getObjectByName('BoosterLeft') && !ground.getObjectByName('BoosterRight'));
  assert.ok(
    engines[0].position.x < -0.8 && engines[1].position.x > 0.8,
    'engines must sit under the separated posts',
  );
  flying.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const nozzle = flying.getObjectByName(`Nozzle${side}`);
    assert.ok(nozzle instanceof THREE.Mesh);
    assert.ok(bounds(nozzle).max.y <= 0, 'booster hardware belongs below the collision body');
    const direction = new THREE.Vector3(0, -1, 0).transformDirection(nozzle.matrixWorld);
    assert.ok(direction.y < -0.999, 'jet nozzle must point down, never rearward');
    assert.ok(
      bounds(flying.getObjectByName(`JetOuter${side}`)!).min.y < -0.6,
      'a visible plume must extend down from each nozzle',
    );
  }
  assert.deepEqual(
    snapshot(bounds(ground.getObjectByName('Feet')!)),
    snapshot(bounds(flying.getObjectByName('Feet')!)),
  );
});

test('pooled clones animate independently without moving the collision frame or changing shared materials', () => {
  const template = createBarricade(true);
  const first = template.clone(true);
  const second = template.clone(true);
  first.position.set(3.6, 8, -40);
  const frame = first.getObjectByName('BarricadeBody')!;
  const before = snapshot(bounds(frame));
  const otherJet = second.getObjectByName('JetLeft')!;
  const untouched = otherJet.scale.clone();
  const materials = new Set<THREE.Material>();
  first.traverse((object) => {
    if (object instanceof THREE.Mesh)
      for (const material of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(material);
  });
  const opacity = [...materials].map((material) => material.opacity);
  animateBarricade(first, 0);
  const plume = first.getObjectByName('JetLeft')!;
  const initialScale = plume.scale.clone();
  animateBarricade(first, 0.173);
  assert.ok(!plume.scale.equals(initialScale), 'visible jet geometry should pulse');
  assert.ok(otherJet.scale.equals(untouched), 'animating one clone must not affect another');
  assert.deepEqual(snapshot(bounds(frame)), before);
  assert.deepEqual(first.position.toArray(), [3.6, 8, -40]);
  assert.deepEqual(
    [...materials].map((material) => material.opacity),
    opacity,
  );
  const pulse = plume.scale.clone();
  animateBarricade(first, 0.173);
  assert.ok(plume.scale.equals(pulse), 'animation must be absolute-time, not cumulative');
  assert.doesNotThrow(() => animateBarricade(createBarricade(false), 10));
});
