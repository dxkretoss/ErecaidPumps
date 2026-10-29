/* eslint-disable no-bitwise */
// Hashing + integer PRNG operations below are intentionally bitwise. The
// DJB2 hash and Mulberry32-style mixing rely on `<<`, `>>>`, `^`, and `|`
// for the algorithm's defined behavior — replacing them with arithmetic
// equivalents would both be slower and break determinism on very large
// inputs. Scope of the disable is file-wide to keep the math readable.
/**
 * Seeded PRNG utilities for deterministic social-proof randomness.
 *
 * Given the same (productId, sessionKey) pair, we should return the same
 * viewer count / last-order time for the duration of a session. Seeded
 * PRNG lets us avoid storing per-product state and gracefully degrade
 * when storage APIs are unavailable (private browsing).
 */

// DJB2-style string hash. Always non-negative via `>>> 0`.
export function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

// Mulberry32-inspired PRNG, returning a value in [0, 1).
export function seededRandom(seed) {
    let t = (seed + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) % 10000) / 10000;
}

export function seededInt(seed, min, max) {
    return Math.floor(seededRandom(seed) * (max - min + 1)) + min;
}

export function seededFloat(seed, min, max) {
    return seededRandom(seed) * (max - min) + min;
}
