// Seeded PRNG — mulberry32 (tiny, fast, good enough for art)
// Usage: const rng = makeRng(seed); rng() -> [0,1)

export function makeRng(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash (x,y) -> uint32, for spatial determinism without storing huge arrays
export function hash2(x, y, seed = 0) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 374761393) >>> 0;
  h = Math.imul(h ^ (y | 0), 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function hashToUnit(h) {
  return (h >>> 0) / 4294967296;
}

// Seeded rng from a hash
export function rngFrom(h) {
  return makeRng(h >>> 0);
}
