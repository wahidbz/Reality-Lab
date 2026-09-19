/**
 * Deterministic pseudo-random number generation.
 *
 * The engine NEVER calls Math.random(). Every stochastic decision is drawn from
 * an instance of `RNG`, seeded from the simulation seed. That gives us the
 * core guarantee of Reality Lab MVP 0.1:
 *
 *   same seed + same input  =>  byte-identical simulation result
 *
 * Algorithm: mulberry32 (fast, small state, well-distributed for simulation).
 */

/** FNV-1a — turns any string seed into a 32-bit unsigned integer. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedToNumber(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.floor(Math.abs(seed)) >>> 0 || 1;
  }
  return hashString(String(seed)) || 1;
}

/** Creates a human-friendly but reproducible seed (used when the user doesn't pick one). */
export function createSeed(): number {
  return Math.floor(Math.random() * 4294967295) >>> 0 || 1;
}

export class RNG {
  private state: number;
  readonly seed: number;

  constructor(seed: number | string) {
    this.seed = seedToNumber(seed);
    this.state = this.seed;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick: `weights` aligned with `items`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Box–Muller normal sample, clamped to +/- 3 sd to avoid absurd agents. */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + sd * Math.max(-3, Math.min(3, g));
  }

  /** Returns a new, independent but still deterministic stream (used per round). */
  fork(label: string): RNG {
    return new RNG(this.seed ^ hashString(label));
  }
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const round2 = (value: number): number => Math.round(value * 100) / 100;
