import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRAFFIC_CATALOG, trafficBounds } from '../src/game/traffic-catalog.ts';
import { createTrafficVehicle, animateTrafficVehicle } from '../src/game/traffic-model.ts';

test('all 24 NPC models have true road contact, catalogue dimensions and independently moving wheels', () => {
  assert.equal(TRAFFIC_CATALOG.length, 24);
  for (const [index, spec] of TRAFFIC_CATALOG.entries()) {
    const model = createTrafficVehicle(index);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(box.min.y) < 0.012, `${spec.id}: tyres must touch the road`);
    for (const [actual, expected] of [
      [size.x, spec.width],
      [size.y, spec.height],
      [size.z, spec.length],
    ])
      assert.ok(
        Math.abs(actual - expected) < 0.08,
        `${spec.id}: ${actual} does not match ${expected}`,
      );
    const wheels: THREE.Object3D[] = [];
    model.traverse((node) => {
      if (node.userData.trafficWheel) wheels.push(node);
    });
    assert.equal(wheels.length, spec.axles.length * 2, `${spec.id}: axle count`);
    assert.ok(model.getObjectByName('Glazing'), `${spec.id}: shaped glazing must be present`);
    assert.ok(model.getObjectByName('Headlights'), `${spec.id}: headlights`);
    assert.ok(model.getObjectByName('Brake'), `${spec.id}: independent rear brake surfaces`);
    let draws = 0;
    model.traverse((node) => {
      if (node instanceof THREE.Mesh)
        draws += Array.isArray(node.material) ? node.material.length : 1;
    });
    assert.ok(draws <= 38, `${spec.id}: draw budget ${draws}`);
    assert.equal(trafficBounds(index).length, spec.length);
  }
});
test('fleet models have distinct silhouettes and recognisable service liveries', () => {
  const vertices = new Set<number>();
  for (const [index, spec] of TRAFFIC_CATALOG.entries()) {
    const model = createTrafficVehicle(index);
    let count = 0;
    model.traverse((node) => {
      if (node instanceof THREE.Mesh) count += node.geometry.getAttribute('position').count;
    });
    vertices.add(count);
    if (spec.livery !== 'none')
      assert.ok(model.getObjectByName('ServiceLivery'), `${spec.id}: service markings`);
  }
  assert.ok(vertices.size >= 18, 'vehicle geometry must vary beyond paint and scaling');
  assert.ok(
    TRAFFIC_CATALOG[7].length > 10 && TRAFFIC_CATALOG[8].length > 15,
    'heavy vehicles retain real scale',
  );
});
test('NPC wheel animation freezes on pause and does not affect another clone or its body', () => {
  const template = createTrafficVehicle(0);
  const first = template.clone(true),
    second = template.clone(true);
  const wheel = first.getObjectByName('TrafficWheel0L')!;
  const untouched = second.getObjectByName('TrafficWheel0L')!;
  assert.ok(wheel && untouched, 'animated wheel roots must survive cloning');
  first.position.set(3.6, 0, -30);
  animateTrafficVehicle(first, 1, 25, 0.1);
  animateTrafficVehicle(first, 1.1, 25, 0.1);
  assert.ok(Math.abs(wheel.rotation.x) > 0.1);
  assert.ok(Math.abs(untouched.rotation.x) < 1e-12);
  const rotation = wheel.rotation.x;
  animateTrafficVehicle(first, 1.1, 25, 0.1);
  assert.equal(wheel.rotation.x, rotation, 'unchanged simulation time freezes wheels');
  assert.deepEqual(first.position.toArray(), [3.6, 0, -30]);
});

test('passenger glazing faces outward so the near windows render from outside the car', () => {
  const model = createTrafficVehicle(0);
  model.updateMatrixWorld(true);
  const glass = model.getObjectByName('Glazing')!;
  for (const [origin, direction, axis, sign] of [
    [[0, 1.1, -10], [0, 0, 1], 'z', -1],
    [[0, 1.1, 10], [0, 0, -1], 'z', 1],
    [[-10, 1.1, 0], [1, 0, 0], 'x', -1],
    [[10, 1.1, 0], [-1, 0, 0], 'x', 1],
  ] as const) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
    const hits = ray.intersectObject(glass);
    assert.ok(hits.length > 0, 'an exterior ray must meet a window');
    assert.ok(hits[0].point[axis] * sign > 0, 'the near window must face the camera');
  }
});

test('service lettering sits outside the body with complete decal UVs', () => {
  for (const index of [3, 15, 16, 17, 19, 20]) {
    const model = createTrafficVehicle(index);
    model.updateMatrixWorld(true);
    const panel = model.getObjectByName('ServiceLivery') as THREE.Mesh;
    const box = new THREE.Box3().setFromObject(panel);
    const center = box.getCenter(new THREE.Vector3());
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(side * 10, center.y, center.z),
        new THREE.Vector3(-side, 0, 0),
      );
      const hits = ray.intersectObject(model, true);
      assert.equal(
        hits[0]?.object.name,
        'ServiceLivery',
        `${TRAFFIC_CATALOG[index].id}: lettering must be visible`,
      );
    }
    const uv = panel.geometry.getAttribute('uv');
    const values = Array.from(uv.array);
    assert.equal(Math.min(...values), 0);
    assert.equal(Math.max(...values), 1);
  }
});

test('the fire engine ladder and beacons sit above their support bodies', () => {
  const model = createTrafficVehicle(17);
  model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, -1.51), new THREE.Vector3(0, -1, 0));
  assert.equal(
    ray.intersectObject(model, true)[0]?.object.name,
    'Chrome',
    'the ladder must be visible above the roof',
  );
  const beacon = model.getObjectByName('EmergencyLeft')!;
  assert.ok(beacon.position.z < -1.85, 'the beacon must sit on the cab, ahead of the cargo body');
});
