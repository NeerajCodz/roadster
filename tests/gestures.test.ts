import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureInput } from '../src/game/gestures.ts';

test('holding a canvas touch flies and releasing a long hold stops flight', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  assert.equal(input.read(500).fly, true);
  input.end(1, 600);
  assert.ok(!input.read(610).fly);
});
test('a quick tap survives between animation frames as a short hop pulse', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  input.end(1, 10);
  assert.equal(input.read(30).fly, true);
  assert.ok(!input.read(200).fly);
});
test('horizontal swipes steer once and repeated swipes include a released edge', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  input.move(1, 140, 100, 20);
  assert.equal(input.read(30).right, true);
  input.move(1, 180, 100, 40);
  assert.ok(!input.read(145).right, 'two lane steps need a released frame');
  assert.equal(input.read(200).right, true);
  assert.ok(!input.read(400).right);
});
test('downward swipes dive until release without fighting held flight', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  input.move(1, 100, 145, 30);
  assert.equal(input.read(40).dive, true);
  assert.ok(!input.read(40).fly);
  input.end(1, 300);
  assert.ok(!input.read(310).dive);
});
test('nearby double taps roll but slow or distant taps do not', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  input.end(1, 40);
  input.begin(2, 105, 102, 160);
  assert.equal(input.read(170).rollRight, true);
  input.end(2, 190);
  input.begin(3, 105, 102, 600);
  assert.ok(!input.read(610).rollRight);
});
test('extra pointers cannot steal control and cancellation clears every active input', () => {
  const input = new GestureInput();
  input.begin(1, 100, 100, 0);
  input.begin(2, 200, 200, 10);
  input.move(2, 250, 200, 30);
  input.end(2, 40);
  assert.equal(input.read(50).fly, true);
  assert.ok(!input.read(50).right);
  input.move(1, 60, 100, 60);
  input.cancel(1);
  assert.deepEqual(input.read(70), {});
  input.begin(3, 100, 100, 80);
  input.reset();
  assert.deepEqual(input.read(90), {});
});
