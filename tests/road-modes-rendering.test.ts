import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as layout from '../src/game/road-layout.ts';

const geometryModule = import('../src/game/road-geometry.ts').catch(() => null);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
const box = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
};

test('mode-specific gantries retain outer lane clearance and exact collision dimensions', () => {
  assert.equal(typeof layout.gantryFor, 'function', 'gantries must use the selected road mode');
  for (const [mode, panel, beam] of [
    ['normal', 12, 24],
    ['two-way', 8.4, 20.4],
    ['opposite', 4.8, 16.8],
  ] as const) {
    const value = layout.gantryFor(mode);
    near(value.panel.width, panel);
    near(value.beam.width, beam);
    near(value.panel.y, 11.3);
    near(value.beam.y, 13);
  }
  assert.deepEqual(
    layout.gantryFor('normal'),
    layout.GANTRY_LAYOUT,
    'the original default remains compatible',
  );
});

test('each road has the requested lane count, usable shoulders and correctly positioned separators', async () => {
  const api = await geometryModule;
  assert.ok(api, 'road geometry must be available without a DOM');
  for (const [mode, width, separators, edge] of [
    ['normal', 22.5, [-5.4, -1.8, 1.8, 5.4], 9.4],
    ['two-way', 18.9, [-3.6, 3.6], 7.6],
    ['opposite', 15.3, [-1.8, 1.8], 5.8],
  ] as const) {
    const road = api.createRoadGeometry(mode);
    const deck = road.getObjectByName('RoadSurface');
    assert.ok(deck);
    near(box(deck).getSize(new THREE.Vector3()).x, width);
    const dashes = road.getObjectByName('LaneSeparators');
    assert.ok(dashes instanceof THREE.InstancedMesh);
    const xs = new Set<number>();
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < dashes.count; i++) {
      dashes.getMatrixAt(i, matrix);
      xs.add(Math.round(matrix.elements[12] * 100) / 100);
    }
    assert.deepEqual(
      [...xs].sort((a, b) => a - b),
      [...separators],
    );
    const edges = road.getObjectByName('EdgeLines');
    assert.ok(edges);
    assert.deepEqual(
      edges.children.map((child) => Math.round(child.position.x * 10) / 10).sort((a, b) => a - b),
      [-edge, edge],
    );
    const divider = road.getObjectByName('CenterDivider');
    assert.equal(divider?.children.length ?? 0, mode === 'two-way' ? 2 : 0);
    if (divider)
      for (const child of divider.children)
        assert.ok((child as THREE.Mesh).material instanceof THREE.MeshStandardMaterial);
  }
});

test('lane arrows point down the correct carriageway including both halves of the even-lane road', async () => {
  const api = await geometryModule;
  assert.ok(api);
  for (const [mode, lanes, directions] of [
    ['normal', [-7.2, -3.6, 0, 3.6, 7.2], [1, 1, 1, 1, 1]],
    ['two-way', [-5.4, -1.8, 1.8, 5.4], [-1, -1, 1, 1]],
    ['opposite', [-3.6, 0, 3.6], [-1, -1, -1]],
  ] as const) {
    const arrows = api.createRoadGeometry(mode).getObjectByName('DirectionArrows');
    assert.ok(arrows instanceof THREE.InstancedMesh);
    const seen = new Map<number, number>();
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < arrows.count; i++) {
      arrows.getMatrixAt(i, matrix);
      const x = Math.round(matrix.elements[12] * 10) / 10;
      const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
      seen.set(x, forward.z < 0 ? 1 : -1);
    }
    assert.deepEqual(
      [...seen.keys()].sort((a, b) => a - b),
      [...lanes],
    );
    for (let i = 0; i < lanes.length; i++) assert.equal(seen.get(lanes[i]), directions[i]);
  }
});

test('visible gantry panels and beams share simulation bounds for all road widths', async () => {
  const api = await geometryModule;
  assert.ok(api);
  for (const mode of ['normal', 'two-way', 'opposite'] as const) {
    const frame = api.createGantryGeometry(mode);
    const expected = layout.gantryFor(mode);
    for (const [name, part] of [
      ['GantryPanel', expected.panel],
      ['GantryBeam', expected.beam],
    ] as const) {
      const mesh = frame.getObjectByName(name);
      assert.ok(mesh);
      const bounds = box(mesh);
      const size = bounds.getSize(new THREE.Vector3());
      near(size.x, part.width);
      near(size.y, part.height);
      near(size.z, part.depth);
      near(bounds.getCenter(new THREE.Vector3()).y, part.y);
    }
  }
});

test('oncoming presentation turns the nose toward travel and maps world steering and signals locally', async () => {
  const api = await geometryModule;
  assert.ok(api);
  for (const direction of [1, -1] as const) {
    const pose = api.trafficRoadPose({ direction, x: 0, targetLane: 0.5, signal: 1 });
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      pose.heading,
    );
    assert.ok(forward.x > 0, 'both directions must steer toward the positive-X destination');
    assert.ok(forward.z * direction < 0, 'front lamps must face the travel direction');
    assert.equal(Math.sign(pose.steer), -direction);
    assert.equal(pose.signal, direction);
  }
  const reused = api.trafficRoadPose({ x: 0 });
  near(reused.heading, 0);
  near(reused.steer, 0);
  assert.equal(reused.signal, 0);
});

test('one through seven lane profiles build finite roads, correctly counted markings and directional dividers', async () => {
  const api = await geometryModule;
  assert.ok(api);
  const keys = new Set<string>();
  for (const mode of ['normal', 'two-way', 'opposite'] as const) {
    for (let count = mode === 'two-way' ? 2 : 1; count <= 7; count++) {
      const road = api.createRoadGeometry(mode, undefined, count);
      const surface = road.getObjectByName('RoadSurface');
      assert.ok(surface);
      const surfaceBounds = box(surface);
      near(surfaceBounds.getSize(new THREE.Vector3()).x, count * 3.6 + 4.5);
      assert.ok(
        [...surfaceBounds.min.toArray(), ...surfaceBounds.max.toArray()].every(Number.isFinite),
      );
      const separators = road.getObjectByName('LaneSeparators');
      assert.ok(separators);
      const expectedSeparators = count - 1 - (mode === 'two-way' ? 1 : 0);
      if (expectedSeparators === 0)
        assert.ok(
          !(separators instanceof THREE.InstancedMesh),
          'empty markings must not allocate an instanced buffer or empty bounding sphere',
        );
      else {
        assert.ok(separators instanceof THREE.InstancedMesh);
        assert.equal(separators.count, expectedSeparators * 35);
      }
      const arrows = road.getObjectByName('DirectionArrows');
      assert.ok(arrows instanceof THREE.InstancedMesh);
      const lanes = new Map<number, number>();
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < arrows.count; i++) {
        arrows.getMatrixAt(i, matrix);
        const x = Math.round(matrix.elements[12] * 10) / 10;
        const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
        lanes.set(x, forward.z < 0 ? 1 : -1);
      }
      assert.equal(lanes.size, count);
      const centers = [...lanes.keys()].sort((a, b) => a - b);
      near(centers[0], -(count - 1) * 1.8);
      near(centers.at(-1)!, (count - 1) * 1.8);
      for (const [x, direction] of lanes)
        assert.equal(direction, mode === 'opposite' || (mode === 'two-way' && x < 0) ? -1 : 1);
      const divider = road.getObjectByName('CenterDivider');
      assert.equal(divider?.children.length ?? 0, mode === 'two-way' ? 2 : 0);
      if (divider)
        near(
          divider.children.reduce((sum, stripe) => sum + stripe.position.x, 0) / 2,
          count % 2 ? -1.8 : 0,
        );
      keys.add(api.roadProfileKey(mode, count));
    }
  }
  assert.equal(
    keys.size,
    20,
    'profiles with the same mode but a different width must never reuse the wrong cache entry',
  );
});

test('all customizable gantries have positive physical bounds matching their visible panels', async () => {
  const api = await geometryModule;
  assert.ok(api);
  for (const mode of ['normal', 'two-way', 'opposite'] as const)
    for (let count = mode === 'two-way' ? 2 : 1; count <= 7; count++) {
      const expected = layout.gantryFor(mode, count);
      near(expected.panel.width, Math.max(1.2, count * 3.6 - 6));
      near(expected.beam.width, count * 3.6 + 6);
      const frame = api.createGantryGeometry(mode, undefined, count);
      const panel = frame.getObjectByName('GantryPanel');
      assert.ok(panel);
      near(box(panel).getSize(new THREE.Vector3()).x, expected.panel.width);
      assert.ok(expected.panel.width > 0);
    }
});

test('gameplay camera keeps the full car visible in either outer lane on mobile and desktop', async () => {
  const api = await geometryModule;
  assert.ok(api);
  assert.equal(typeof api.gameplayRoadCamera, 'function');
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1280, 720],
  ])
    for (const count of [1, 2, 7])
      for (const side of [-1, 1])
        for (const altitude of [0, 8, 18])
          for (const boosting of [false, true]) {
            const x = side * (count - 1) * 1.8;
            const pose = api.gameplayRoadCamera(x, altitude, width / height, boosting);
            const camera = new THREE.PerspectiveCamera(pose.fov, width / height, 0.1, 1600);
            camera.position.copy(pose.position);
            camera.lookAt(pose.lookAt);
            camera.updateMatrixWorld(true);
            for (const dx of [-1.115, 1.115])
              for (const dy of [0, 1.12])
                for (const z of [-2.15, 2.15]) {
                  const projected = new THREE.Vector3(x + dx, altitude + dy, z).project(camera);
                  assert.ok(
                    Math.abs(projected.x) < 0.98 && Math.abs(projected.y) < 0.98 && projected.z < 1,
                    `${width}×${height}, ${count} lanes, ${x}m, altitude ${altitude}: car clipped`,
                  );
                }
          }
});

test('portrait gameplay following keeps rapid seven-lane steering visible throughout the transition', async () => {
  const api = await geometryModule;
  assert.ok(api);
  assert.equal(typeof api.followGameplayCamera, 'function');
  const camera = new THREE.PerspectiveCamera(58, 390 / 844, 0.1, 1600);
  camera.position.set(0, 4.4, 10.5);
  let x = 0;
  for (const destination of [10.8, -10.8, 10.8])
    for (let frame = 0; frame < 90; frame++) {
      x = destination + (x - destination) * Math.exp(-11 / 60);
      const target = api.gameplayRoadCamera(x, 0, camera.aspect, false);
      api.followGameplayCamera(
        camera.position,
        target.position,
        camera.aspect,
        1 - Math.exp(-5 / 60),
      );
      camera.lookAt(target.lookAt);
      camera.updateMatrixWorld(true);
      for (const dx of [-1.115, 1.115])
        for (const y of [0, 1.12])
          for (const z of [-2.15, 2.15]) {
            const point = new THREE.Vector3(x + dx, y, z).project(camera);
            assert.ok(
              Math.abs(point.x) < 0.98,
              'camera smoothing must not leave a moving car beyond the phone edge',
            );
          }
    }
});
