import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_COLORS,
  CARS,
  FACTORY,
  RIM_COLORS,
  STAT_LIMITS,
  STAT_ROWS,
  adjacentCar,
  carById,
  colorName,
  isDefaultLook,
  litSegments,
  lookSummary,
  sanitizeLook,
  shownBody,
  statFraction,
} from '../src/game/cars.ts';

const roadster = carById('roadster');
const concept = carById('concept');

test('a valid stored look is kept, including upper-case hex and the factory sentinel', () => {
  assert.deepEqual(sanitizeLook({ body: '#D7ED65', finish: 'satin', rim: FACTORY }, roadster), {
    body: '#D7ED65',
    finish: 'satin',
    rim: FACTORY,
  });
  assert.deepEqual(sanitizeLook({ body: FACTORY, finish: 'factory', rim: '#9a6b3c' }, concept), {
    body: FACTORY,
    finish: 'factory',
    rim: '#9a6b3c',
  });
});

test('bad colours fall back to the car default field by field', () => {
  for (const bad of ['#zzzzzz', 'red', '#12345', '#1234567', '', 42, null, ['#ffffff']]) {
    const look = sanitizeLook({ body: bad, finish: 'gloss', rim: bad }, concept);
    assert.equal(look.body, concept.look.body, `body ${String(bad)}`);
    assert.equal(look.rim, concept.look.rim, `rim ${String(bad)}`);
    assert.equal(look.finish, 'gloss', 'a valid finish survives a bad colour');
  }
});

test('an unknown finish falls back to the car default finish', () => {
  for (const finish of ['glitter', 'FACTORY', '', 3, undefined])
    assert.equal(sanitizeLook({ body: '#ffffff', finish }, concept).finish, concept.look.finish);
});

test('missing or malformed looks become the car defaults', () => {
  for (const value of [undefined, null, 'satin', 7, {}, { colour: '#ffffff' }])
    for (const car of CARS) assert.deepEqual(sanitizeLook(value, car), car.look);
  assert.notEqual(sanitizeLook(undefined, concept), concept.look, 'returns a copy, not the spec');
});

test('stat bars scale against the showroom limits', () => {
  assert.equal(statFraction('topSpeed', STAT_LIMITS.topSpeed), 1);
  assert.equal(statFraction('topSpeed', 210), 0.5);
  assert.equal(statFraction('handling', 9.6), 0.96);
  assert.equal(statFraction('thrusters', 2), 0.5);
  assert.equal(statFraction('topSpeed', 999), 1, 'clamped to a full bar');
});

test('the 0-100 bar is inverted so quicker cars fill more of it', () => {
  assert.equal(statFraction('zeroToHundred', STAT_LIMITS.zeroToHundred), 1);
  assert.equal(statFraction('zeroToHundred', 3), 0.5);
  assert.equal(statFraction('zeroToHundred', 1), 1, 'faster than the limit is still a full bar');
  assert.ok(statFraction('zeroToHundred', 1.9) > statFraction('zeroToHundred', 2.9));
});

test('empty or invalid stats draw an empty bar', () => {
  for (const key of ['topSpeed', 'zeroToHundred', 'handling', 'thrusters'] as const)
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY])
      assert.equal(statFraction(key, value), 0, `${key} ${value}`);
});

test('every showroom car has a full set of displayable stats', () => {
  assert.deepEqual(
    STAT_ROWS.map((row) => row.key),
    ['topSpeed', 'zeroToHundred', 'handling', 'thrusters'],
  );
  for (const car of CARS)
    for (const { key } of STAT_ROWS) {
      const fraction = statFraction(key, car.stats[key]);
      assert.ok(fraction > 0 && fraction <= 1, `${car.id} ${key}`);
    }
});

test('segmented bars round to whole segments and light one for any non-zero stat', () => {
  assert.equal(litSegments(1, 12), 12);
  assert.equal(litSegments(0.5, 12), 6);
  assert.equal(litSegments(0.01, 12), 1);
  assert.equal(litSegments(0, 12), 0);
  assert.equal(litSegments(Number.NaN, 12), 0);
  assert.equal(litSegments(4, 12), 12);
});

test('carousel stepping wraps around the showroom', () => {
  const ids = CARS.map((car) => car.id);
  assert.equal(adjacentCar(ids[0], 1), ids[1]);
  assert.equal(adjacentCar(ids[0], -1), ids.at(-1));
  assert.equal(adjacentCar(ids.at(-1)!, 1), ids[0]);
  assert.equal(carById('missing').id, ids[0], 'unknown ids fall back to the first car');
});

test('paint read-outs name palette colours and finishes', () => {
  assert.equal(colorName('#E9E6E0'), 'Ano White');
  assert.equal(colorName(FACTORY), 'Factory');
  assert.equal(colorName('#123456'), 'Custom');
  assert.equal(colorName('#9a6b3c', RIM_COLORS), 'Bronze');
  assert.equal(
    lookSummary({ body: '#e9e6e0', finish: 'satin', rim: FACTORY }),
    'ANO WHITE · SATIN',
  );
  assert.equal(lookSummary({ body: FACTORY, finish: 'factory', rim: FACTORY }), 'FACTORY SPEC');
  assert.equal(
    lookSummary({ body: FACTORY, finish: 'chrome', rim: FACTORY }),
    'FACTORY COLOUR · CHROME',
  );
  assert.equal(
    lookSummary({ body: BODY_COLORS[1].hex, finish: 'factory', rim: FACTORY }),
    'VOLT · FACTORY FINISH',
  );
});

test('a reset is only offered once the look differs from the factory spec', () => {
  assert.ok(isDefaultLook({ ...concept.look }, concept));
  assert.ok(isDefaultLook({ ...concept.look, body: concept.look.body.toUpperCase() }, concept));
  assert.ok(!isDefaultLook({ ...concept.look, finish: 'matte' }, concept));
  assert.ok(!isDefaultLook({ ...roadster.look, rim: '#d4a94a' }, roadster));
});

test('every car has a distinct headline name and a real factory colour', () => {
  const names = CARS.map((car) => car.name);
  assert.equal(new Set(names).size, names.length, 'names tell the cars apart on cards and status');
  for (const car of CARS) assert.match(car.factoryHex, /^#[0-9a-f]{6}$/i, car.id);
});

test("the Factory sentinel shows the car's own paint; a chosen colour shows as itself", () => {
  assert.equal(shownBody({ ...concept.look, body: FACTORY }, concept), concept.factoryHex);
  assert.equal(shownBody(roadster.look, roadster), roadster.factoryHex);
  assert.equal(shownBody({ ...roadster.look, body: '#b3121f' }, roadster), '#b3121f');
});

test('palette swatches are far enough apart to tell from one another', () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const palette of [BODY_COLORS, RIM_COLORS.filter((swatch) => swatch.hex !== FACTORY)])
    palette.forEach((a, i) =>
      palette.slice(i + 1).forEach((b) => {
        const distance = Math.hypot(...rgb(a.hex).map((value, k) => value - rgb(b.hex)[k]));
        assert.ok(distance > 24, `${a.name} and ${b.name} look alike`);
      }),
    );
});
