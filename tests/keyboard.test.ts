import test from 'node:test';
import assert from 'node:assert/strict';
import { keyAction } from '../src/game/keyboard.ts';

test('game shortcuts keep working after a header button receives focus', () => {
  for (const code of ['Space', 'KeyA', 'ArrowRight', 'ShiftLeft', 'KeyE']) assert.equal(keyAction(code, 'playing', false, true), 'control');
});
test('focused results buttons keep native Enter and Space activation', () => {
  assert.equal(keyAction('Enter', 'crashed', true, true), 'native');
  assert.equal(keyAction('Space', 'crashed', true, true), 'native');
  assert.equal(keyAction('Enter', 'crashed', true, false), 'start');
});
test('menu shortcuts do not steal activation from garage and help buttons', () => {
  assert.equal(keyAction('Enter', 'menu', false, true), 'native');
  assert.equal(keyAction('Space', 'menu', false, false), 'start');
});
test('escape routes pause, resume and results home consistently', () => {
  assert.equal(keyAction('Escape', 'playing', false, false), 'pause');
  assert.equal(keyAction('Escape', 'paused', true, true), 'resume');
  assert.equal(keyAction('Escape', 'crashed', true, true), 'home');
  assert.equal(keyAction('Escape', 'menu', true, true), 'close');
});
test('dialogs keep flight keys native while mute remains available', () => {
  assert.equal(keyAction('Space', 'paused', true, true), 'native');
  assert.equal(keyAction('KeyM', 'paused', true, true), 'mute');
});
