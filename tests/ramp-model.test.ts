import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLaunchRamp, animateLaunchRamp } from '../src/game/ramp.ts';
import { RAMP_KINDS, rampBounds, sampleRamp } from '../src/game/ramp-layout.ts';
test('all three Volt ramps have curved riding decks, structural detail, legal bounds and road contact', () => {
  for (const kind of RAMP_KINDS) {
    const model = createLaunchRamp(kind);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true),
      size = bounds.getSize(new THREE.Vector3()),
      limits = rampBounds(kind);
    assert.ok(Math.abs(bounds.min.y) < 0.01 && size.z > 7.8 && size.x > 2.8, kind);
    assert.ok(
      size.x <= limits.width && size.y <= limits.height && size.z <= limits.length,
      `${kind}: declared bounds`,
    );
    for (const name of [
      'RidingDeck',
      'StructuralFrame',
      'EdgeGlow',
      'DirectionMarkings',
      'Fixings',
    ])
      assert.ok(model.getObjectByName(name), `${kind}: ${name}`);
    const deck = model.getObjectByName('RidingDeck') as THREE.Mesh;
    for (const t of [0.1, 0.5, 0.9]) {
      const point = sampleRamp(kind, t, 0);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(point.x, 10, point.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = ray.intersectObject(deck);
      assert.ok(
        hits.length && Math.abs(hits[0].point.y - point.y) < 0.02,
        'top faces align with physical surface',
      );
    }
    let draws = 0;
    model.traverse((node) => {
      if (node instanceof THREE.Mesh)
        draws += Array.isArray(node.material) ? node.material.length : 1;
    });
    assert.ok(draws <= 16, `draw budget ${draws}`);
    const glow = model.getObjectByName('EdgeGlow') as THREE.Mesh;
    const material = glow.material as THREE.MeshStandardMaterial;
    assert.equal(material.emissive.getHexString(), 'dcf569');
  }
});
test('ramp flow lights freeze with simulation time and animate independently after cloning', () => {
  const template = createLaunchRamp('roll-left'),
    a = template.clone(true),
    b = template.clone(true);
  const first = a.getObjectByName('FlowPulse0')!,
    second = b.getObjectByName('FlowPulse0')!;
  assert.ok(first && second);
  const untouched = second.position.clone();
  animateLaunchRamp(a, 0.8);
  assert.ok(first.position.distanceTo(untouched) > 0.01);
  const paused = first.position.clone();
  animateLaunchRamp(a, 0.8);
  assert.deepEqual(first.position, paused);
  assert.deepEqual(second.position, untouched);
});
