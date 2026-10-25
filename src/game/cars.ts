/** Player vehicles, their showroom specs and the paint shop palette. */

export type CarId = 'roadster' | 'original' | 'concept';
export type PaintFinish = 'factory' | 'gloss' | 'metallic' | 'satin' | 'matte' | 'chrome';

/** A car's customisable appearance. `factory` restores the model's authored colour and finish. */
export interface CarLook {
  body: string;
  finish: PaintFinish;
  rim: string;
}

export interface CarSpec {
  id: CarId;
  /** Asset path below public/assets/. */
  model: string;
  name: string;
  trim: string;
  tagline: string;
  /** Performance class shown on the badge, Asphalt style. */
  tier: 'S' | 'A' | 'B';
  stars: number;
  rating: number;
  /** Showroom figures only; the run itself plays the same for every car. */
  stats: { topSpeed: number; zeroToHundred: number; handling: number; thrusters: number };
  look: CarLook;
  /** Approximate authored body colour: what the Factory swatch and read-outs show for it. */
  factoryHex: string;
  /** Whether the model has separately paintable wheel faces. */
  rims: boolean;
  /** Whether the body is a baked texture that can only be tinted, not repainted. */
  tintOnly: boolean;
}

export const FACTORY = 'factory';

export const CARS: readonly CarSpec[] = [
  {
    id: 'roadster',
    model: 'models/roadster.glb',
    name: 'ROADSTER',
    trim: '2026 · THRUST',
    tagline: 'FOUR THRUSTERS. ZERO PATIENCE.',
    tier: 'S',
    stars: 5,
    rating: 2840,
    stats: { topSpeed: 402, zeroToHundred: 1.9, handling: 9.2, thrusters: 4 },
    look: { body: FACTORY, finish: 'factory', rim: FACTORY },
    factoryHex: '#e9e6e0',
    rims: true,
    tintOnly: false,
  },
  {
    id: 'original',
    model: 'reference/models/roadster_user.glb',
    name: 'RUSH ORIGINAL',
    trim: 'ROADSTER',
    tagline: 'THE ONE THAT STARTED IT.',
    tier: 'A',
    stars: 4,
    rating: 2210,
    stats: { topSpeed: 350, zeroToHundred: 2.4, handling: 8.1, thrusters: 2 },
    look: { body: FACTORY, finish: 'factory', rim: FACTORY },
    factoryHex: '#9a9ea1',
    rims: false,
    tintOnly: true,
  },
  {
    id: 'concept',
    model: 'CarConcept.glb',
    name: 'AERO GT',
    trim: 'CONCEPT',
    tagline: 'PRECISION IN EVERY DETAIL.',
    tier: 'A',
    stars: 4,
    rating: 2365,
    stats: { topSpeed: 331, zeroToHundred: 2.9, handling: 9.6, thrusters: 2 },
    look: { body: '#d7ed65', finish: 'metallic', rim: FACTORY },
    // CarConcept's authored "Paint 1 Carmine"; the showroom spec above repaints it Volt.
    factoryHex: '#d40c0c',
    rims: true,
    tintOnly: false,
  },
];

export const carById = (id: string | undefined): CarSpec =>
  CARS.find((car) => car.id === id) ?? CARS[0];

/** Upper bounds used to scale the showroom stat bars. */
export const STAT_LIMITS = { topSpeed: 420, zeroToHundred: 1.5, handling: 10, thrusters: 4 };

export const BODY_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Ano White', hex: '#e9e6e0' },
  { name: 'Volt', hex: '#d7ed65' },
  { name: 'Sand', hex: '#d8ccb0' },
  { name: 'Titanium', hex: '#9bacbb' },
  { name: 'Graphite', hex: '#2a3030' },
  { name: 'Obsidian', hex: '#0e0f11' },
  { name: 'Ember', hex: '#e4633f' },
  { name: 'Rosso', hex: '#b3121f' },
  { name: 'Solar', hex: '#f2a71b' },
  { name: 'Aurum', hex: '#c9a24a' },
  { name: 'Lagoon', hex: '#1f9aa6' },
  { name: 'Ultramarine', hex: '#2448c8' },
  { name: 'Midnight', hex: '#1b2340' },
  { name: 'Orchid', hex: '#8e5bd6' },
  { name: 'Mint', hex: '#8fd6b5' },
  { name: 'Sakura', hex: '#f0a3b8' },
];

export const RIM_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Factory', hex: FACTORY },
  { name: 'Ano White', hex: '#e9e6e0' },
  { name: 'Silver', hex: '#c4c8cc' },
  { name: 'Gunmetal', hex: '#4a4f55' },
  { name: 'Gloss Black', hex: '#101113' },
  { name: 'Bronze', hex: '#9a6b3c' },
  { name: 'Gold', hex: '#d4a94a' },
  { name: 'Volt', hex: '#d7ed65' },
  { name: 'Rosso', hex: '#b3121f' },
];

export const FINISHES: readonly { id: PaintFinish; label: string }[] = [
  { id: 'factory', label: 'FACTORY' },
  { id: 'gloss', label: 'GLOSS' },
  { id: 'metallic', label: 'METALLIC' },
  { id: 'satin', label: 'SATIN' },
  { id: 'matte', label: 'MATTE' },
  { id: 'chrome', label: 'CHROME' },
];

/** PBR parameters for each finish (factory is resolved from the model itself). */
export const FINISH_PARAMS: Record<
  Exclude<PaintFinish, 'factory'>,
  {
    metalness: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
  }
> = {
  gloss: { metalness: 0.05, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 },
  metallic: { metalness: 0.78, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 },
  satin: { metalness: 0.25, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35 },
  matte: { metalness: 0.05, roughness: 0.78, clearcoat: 0, clearcoatRoughness: 1 },
  chrome: { metalness: 1, roughness: 0.07, clearcoat: 0.6, clearcoatRoughness: 0.02 },
};

const HEX = /^#[0-9a-f]{6}$/i;
const FINISH_IDS = new Set<string>(FINISHES.map((finish) => finish.id));

/** Validates a stored look, falling back to the car's defaults field by field. */
export function sanitizeLook(value: unknown, car: CarSpec): CarLook {
  const look = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof CarLook, unknown>
  >;
  const colour = (input: unknown, fallback: string) =>
    typeof input === 'string' && (input === FACTORY || HEX.test(input)) ? input : fallback;
  return {
    body: colour(look.body, car.look.body),
    finish:
      typeof look.finish === 'string' && FINISH_IDS.has(look.finish)
        ? (look.finish as PaintFinish)
        : car.look.finish,
    rim: colour(look.rim, car.look.rim),
  };
}

export type StatKey = keyof CarSpec['stats'];

/** Showroom stat rows in display order. */
export const STAT_ROWS: readonly { key: StatKey; label: string; unit: string; decimals: number }[] =
  [
    { key: 'topSpeed', label: 'TOP SPEED', unit: 'KM/H', decimals: 0 },
    { key: 'zeroToHundred', label: '0–100 KM/H', unit: 'S', decimals: 1 },
    { key: 'handling', label: 'HANDLING', unit: '/10', decimals: 1 },
    { key: 'thrusters', label: 'THRUSTERS', unit: 'PODS', decimals: 0 },
  ];

/**
 * Share of a showroom stat bar to fill, 0–1, against STAT_LIMITS. The 0–100 sprint is a time, so it
 * is inverted: the quicker the car, the fuller the bar.
 */
export function statFraction(key: StatKey, value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const limit = STAT_LIMITS[key];
  const fraction = key === 'zeroToHundred' ? limit / value : value / limit;
  return Math.min(1, Math.max(0, fraction));
}

/** Lit segments for a segmented bar; any non-zero stat lights at least one. */
export function litSegments(fraction: number, segments: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(segments, Math.max(1, Math.round(fraction * segments)));
}

/** The car before (-1) or after (+1) this one in the showroom, wrapping around. */
export function adjacentCar(id: CarId, step: number): CarId {
  const index = CARS.findIndex((car) => car.id === id);
  const next = ((((index < 0 ? 0 : index) + step) % CARS.length) + CARS.length) % CARS.length;
  return CARS[next].id;
}

type Swatch = { name: string; hex: string };

/** Palette name for a colour: 'Factory' for the sentinel, 'Custom' for an unlisted hex. */
export function colorName(hex: string, palette: readonly Swatch[] = BODY_COLORS): string {
  if (hex === FACTORY) return 'Factory';
  return palette.find((swatch) => swatch.hex.toLowerCase() === hex.toLowerCase())?.name ?? 'Custom';
}

export const finishLabel = (finish: PaintFinish): string =>
  FINISHES.find((item) => item.id === finish)?.label ?? 'FACTORY';

/** Paint shop read-out such as "ANO WHITE · SATIN". */
export function lookSummary(look: CarLook): string {
  if (look.body === FACTORY && look.finish === 'factory') return 'FACTORY SPEC';
  const body = look.body === FACTORY ? 'FACTORY COLOUR' : colorName(look.body).toUpperCase();
  const finish = look.finish === 'factory' ? 'FACTORY FINISH' : finishLabel(look.finish);
  return `${body} · ${finish}`;
}

/** The body colour a look shows on screen, resolving the Factory sentinel to the car's own paint. */
export const shownBody = (look: CarLook, car: CarSpec): string =>
  look.body === FACTORY ? car.factoryHex : look.body;

/** Whether a look already matches the car's showroom spec, so a reset would change nothing. */
export function isDefaultLook(look: CarLook, car: CarSpec): boolean {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    same(look.body, car.look.body) &&
    look.finish === car.look.finish &&
    same(look.rim, car.look.rim)
  );
}
