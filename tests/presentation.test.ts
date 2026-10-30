import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as presentation from '../src/game/presentation.ts';
import { updatePlayerPosition } from '../src/game/presentation.ts';
import { EMPTY_CONTROLS, Simulation } from '../src/game/simulation.ts';

test('discarding an instanced clone frees its buffers without breaking a live sibling or template', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  const template = new THREE.Group();
  const source = new THREE.InstancedMesh(geometry, material, 2);
  template.add(source);
  const first = template.clone(true);
  const sibling = template.clone(true);
  const firstMesh = first.children[0] as THREE.InstancedMesh;
  const siblingMesh = sibling.children[0] as THREE.InstancedMesh;
  assert.notEqual(firstMesh.instanceMatrix, siblingMesh.instanceMatrix);
  let cloneDisposals = 0,
    sourceDisposals = 0,
    assetDisposals = 0;
  firstMesh.addEventListener('dispose', () => cloneDisposals++);
  source.addEventListener('dispose', () => sourceDisposals++);
  siblingMesh.addEventListener('dispose', () => sourceDisposals++);
  geometry.addEventListener('dispose', () => assetDisposals++);
  material.addEventListener('dispose', () => assetDisposals++);
  presentation.disposeInstanceBuffers(first);
  assert.equal(cloneDisposals, 1, 'the rejected clone must release its GPU instance buffers');
  assert.equal(sourceDisposals, 0, 'live siblings and cached templates remain valid');
  assert.equal(assetDisposals, 0, 'shared geometry and materials must not be disposed');
});

test('a lane-change crash is drawn with overlapping vehicle bodies', () => {
  const sim = new Simulation();
  sim.start();
  sim.state.entities = [{ id: 100, kind: 'traffic', lane: 1, x: 3.6, y: 0, z: -2, variant: 0 }];
  const position = { x: 0, y: 0, z: 0 };

  for (let frame = 0; frame < 20 && sim.state.status === 'playing'; frame++) {
    sim.update(1 / 60, { ...EMPTY_CONTROLS, right: true });
    updatePlayerPosition(position, sim.state, 1 / 60);
  }

  assert.equal(sim.state.status, 'crashed', 'fixture must reach the lane-change collision');
  const traffic = sim.state.entities[0];
  // Actual Roadster and sedan widths from their model bounds, without collision forgiveness.
  const lateralGap = Math.abs(traffic.x - position.x) - (2.232221 + 1.9) / 2;
  assert.ok(lateralGap < 0, `crash is drawn with a ${lateralGap.toFixed(3)} m gap`);
});

test('flight presentation follows the simulated tyres instead of lagging behind lift and dive', () => {
  const sim = new Simulation();
  sim.start();
  sim.state.entities = [];
  const position = { x: 0, y: 0, z: 0 };

  for (let frame = 0; frame < 90; frame++) {
    sim.update(1 / 60, { ...EMPTY_CONTROLS, fly: frame < 45, dive: frame >= 45 });
    updatePlayerPosition(position, sim.state, 1 / 60);
    assert.ok(
      Math.abs(position.y - sim.state.y) < 1e-9,
      'visible tyres must share the collision height',
    );
  }
  assert.equal(sim.state.y, 0, 'fixture must land after diving');
});

test('traffic warnings belong to one vehicle and reset before a pooled vehicle is reused', () => {
  const template = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    name: 'Brake',
    color: '#a92b21',
    emissive: '#a92b21',
    emissiveIntensity: 0.3,
  });
  template.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 4.6), material));
  const first = template.clone(true);
  const second = template.clone(true);
  const firstLights = presentation.createTrafficLights?.(first);
  const secondLights = presentation.createTrafficLights?.(second);
  assert.ok(firstLights && secondLights, 'traffic needs independent light presentation');
  presentation.updateTrafficLights(firstLights, { braking: true, signal: -1 }, 0.1);
  presentation.updateTrafficLights(secondLights, { braking: false, signal: 0 }, 0.1);
  assert.notEqual(firstLights.brakes[0], secondLights.brakes[0]);
  assert.ok(firstLights.brakes[0].emissiveIntensity > secondLights.brakes[0].emissiveIntensity);
  assert.equal(material.emissiveIntensity, 0.3, 'the shared source material must remain untouched');
  assert.equal(firstLights.left.visible, true);
  assert.equal(firstLights.right.visible, false);
  assert.equal(secondLights.left.visible, false);
  presentation.updateTrafficLights(firstLights, { signal: -1 }, 0.5);
  assert.equal(firstLights.left.visible, false, 'the warning must blink');
  presentation.updateTrafficLights(firstLights, {}, 0.9);
  assert.equal(
    firstLights.left.visible,
    false,
    'a recycled car must not retain its previous warning',
  );
  assert.equal(firstLights.brakes[0].emissiveIntensity, secondLights.brakes[0].emissiveIntensity);
});
