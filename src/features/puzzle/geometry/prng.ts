/**
 * Deterministic PRNG. Given the same numeric seed, `createPrng` always
 * produces the same sequence — this is the foundation of the "no network
 * round trip needed, every client computes identical geometry" invariant
 * (see AGENT.md §2.5).
 */
export type Prng = () => number; // returns a float in [0, 1)

/** mulberry32 — small, fast, good-enough statistical quality for geometry jitter. */
export function mulberry32(seed: number): Prng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit string hash (FNV-1a), used to turn a string seed into a numeric one. */
export function hashStringToSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derive an independent, deterministic sub-PRNG for a given string key, scoped off the root seed. */
export function deriveEdgePrng(rootSeed: string, edgeKey: string): Prng {
  return mulberry32(hashStringToSeed(`${rootSeed}:${edgeKey}`));
}
