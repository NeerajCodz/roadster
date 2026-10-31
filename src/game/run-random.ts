const UINT32_RANGE = 4294967296;

function browserEntropy(): number {
  try {
    if (globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
  } catch {
    // A restricted browser may expose crypto without providing entropy.
  }
  return Math.floor(Math.random() * UINT32_RANGE);
}

/** Choose a fresh run seed, even when the entropy repeats the preceding seed. */
export function createRunSeed(previous?: number, entropy: () => number = browserEntropy): number {
  const seed = entropy() >>> 0;
  return previous !== undefined && seed === previous >>> 0 ? (seed + 1) >>> 0 : seed;
}

/** Mulberry32 keeps every gameplay random choice local to the current run. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}
