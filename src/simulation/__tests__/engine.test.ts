/**
 * Engine tests.
 *
 * These test the SIMULATION LOGIC, not the UI:
 *   1. same seed  -> identical result (determinism)
 *   2. higher price suppresses demand from price-sensitive customers
 *   3. more awareness/marketing -> more demand
 *   4. more competition -> lower market share
 *   5. revenue + cost/profit math
 *   6. a variant with changed variables differs from the original
 */

import { describe, expect, it } from 'vitest';
import { runSimulation } from '../engine';
import { computeCosts, computeMarketShare, computeRevenue } from '../rules';
import { purchaseProbability } from '../agent';
import { RNG, seedToNumber } from '../random';
import type { CustomerAgent, NormalizedInput, SimulationInput } from '../../types/simulation';
import { normalizeInput } from '../world';

const baseInput: SimulationInput = {
  name: 'Test Coffee Shop',
  description: 'A low-cost coffee shop for university students.',
  type: 'business',
  country: 'Germany',
  city: 'Berlin',
  targetAudience: 'Students',
  audienceKey: 'students',
  currency: 'EUR',
  budget: 22000,
  price: 2.9,
  operatingCost: 3100,
  monthlyFixedCost: 3100,
  employees: 3,
  capacity: 520,
  durationMonths: 12,
  marketingBudget: 900,
  initialCustomers: 20,
  competitorCount: 5,
  customerAcquisitionCost: 9,
  quality: 0.5,
  seed: 20240501,
};

const run = (overrides: Partial<SimulationInput> = {}, seed = baseInput.seed) =>
  runSimulation({ ...baseInput, ...overrides }, seed);

/* ------------------------------------------------------------------ */
/* 1. Determinism                                                      */
/* ------------------------------------------------------------------ */

describe('determinism', () => {
  it('produces an identical result for the same seed and input', () => {
    const a = run();
    const b = run();

    expect(b.score.score).toBe(a.score.score);
    expect(b.totals).toEqual(a.totals);
    expect(b.rounds.map((r) => r.metrics)).toEqual(a.rounds.map((r) => r.metrics));
    expect(b.events.map((e) => e.type)).toEqual(a.events.map((e) => e.type));
  });

  it('produces a different result for a different seed', () => {
    const a = run({}, 20240501);
    const b = run({}, 99887766);
    // Same input, different seed: the stochastic market path must diverge.
    expect(JSON.stringify(b.rounds.map((r) => r.metrics))).not.toBe(
      JSON.stringify(a.rounds.map((r) => r.metrics)),
    );
  });

  it('is unaffected by execution order (no shared mutable state)', () => {
    const first = run({}, 424242);
    run({}, 777); // interleave another simulation
    const second = run({}, 424242);
    expect(second.totals).toEqual(first.totals);
  });

  it('does not use Math.random inside the engine', () => {
    const spy = vi_spyRandom();
    run();
    expect(spy.calls).toBe(0);
    spy.restore();
  });
});

/** Minimal Math.random spy so we can assert the engine never calls it. */
function vi_spyRandom() {
  const original = Math.random;
  const state = { calls: 0 };
  Math.random = () => {
    state.calls++;
    return original();
  };
  return {
    get calls() {
      return state.calls;
    },
    restore: () => {
      Math.random = original;
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. Price sensitivity                                                */
/* ------------------------------------------------------------------ */

describe('price sensitivity', () => {
  it('sells fewer units when the price is raised (price-sensitive audience)', () => {
    const cheap = run({ price: 2.0 });
    const expensive = run({ price: 9.0 });
    expect(cheap.totals.totalUnits).toBeGreaterThan(expensive.totals.totalUnits);
  });

  it('purchase probability falls as price rises above the market average', () => {
    const customer = makeCustomer({ priceSensitivity: 0.9 });
    const ctx = (price: number) => ({
      price,
      quality: 0.6,
      marketAvgPrice: 3,
      marketAvgQuality: 0.5,
      competitionPressure: 0.4,
      demandMultiplier: 1,
    });
    const cheapP = purchaseProbability(customer, ctx(2));
    const fairP = purchaseProbability(customer, ctx(3));
    const dearP = purchaseProbability(customer, ctx(6));
    expect(cheapP).toBeGreaterThan(fairP);
    expect(fairP).toBeGreaterThan(dearP);
  });

  it('price-insensitive customers barely react to price changes', () => {
    const loyal = makeCustomer({ priceSensitivity: 0.05 });
    const ctx = (price: number) => ({
      price,
      quality: 0.6,
      marketAvgPrice: 3,
      marketAvgQuality: 0.5,
      competitionPressure: 0.2,
      demandMultiplier: 1,
    });
    const ratio = purchaseProbability(loyal, ctx(5)) / purchaseProbability(loyal, ctx(3));
    expect(ratio).toBeGreaterThan(0.75);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Awareness -> demand                                              */
/* ------------------------------------------------------------------ */

describe('awareness', () => {
  it('more marketing spend raises awareness and demand', () => {
    const low = run({ marketingBudget: 0, initialCustomers: 5 });
    const high = run({ marketingBudget: 8000, initialCustomers: 5 });
    const lowAwareness = avg(low.rounds.map((r) => r.metrics.awareness));
    const highAwareness = avg(high.rounds.map((r) => r.metrics.awareness));
    expect(highAwareness).toBeGreaterThan(lowAwareness);
    expect(high.totals.totalUnits).toBeGreaterThan(low.totals.totalUnits);
  });

  it('awareness is a gate on purchase probability', () => {
    const unaware = makeCustomer({ awareness: 0.02 });
    const aware = makeCustomer({ awareness: 0.95 });
    const ctx = {
      price: 3,
      quality: 0.6,
      marketAvgPrice: 3,
      marketAvgQuality: 0.5,
      competitionPressure: 0.2,
      demandMultiplier: 1,
    };
    expect(purchaseProbability(aware, ctx)).toBeGreaterThan(purchaseProbability(unaware, ctx));
  });
});

/* ------------------------------------------------------------------ */
/* 4. Competition -> market share                                      */
/* ------------------------------------------------------------------ */

describe('competition', () => {
  it('more competitors reduce the business market share', () => {
    const few = run({ competitorCount: 1 });
    const many = run({ competitorCount: 12 });
    expect(few.totals.finalMarketShare).toBeGreaterThan(many.totals.finalMarketShare);
  });

  it('competition pressure rises with the number of competitors', () => {
    const few = run({ competitorCount: 1 });
    const many = run({ competitorCount: 12 });
    expect(many.totals.avgCompetitionPressure).toBeGreaterThan(few.totals.avgCompetitionPressure);
  });

  it('computeMarketShare splits the served market', () => {
    // The engine rounds shares to 4 decimals, so compare at that precision.
    expect(computeMarketShare(50, [50, 50])).toBeCloseTo(50 / 150, 4);
    expect(computeMarketShare(0, [])).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Unit economics                                                   */
/* ------------------------------------------------------------------ */

describe('unit economics', () => {
  it('revenue = units x price', () => {
    expect(computeRevenue(10, 3)).toBe(30);
    expect(computeRevenue(0, 3)).toBe(0);
  });

  it('costs = cogs + fixed opex + marketing', () => {
    const costs = computeCosts({
      units: 10,
      price: 3,
      unitCostRatio: 0.3,
      monthlyFixedCost: 100,
      marketingBudget: 50,
      costMultiplier: 1,
    });
    expect(costs.cogs).toBeCloseTo(9, 5);
    expect(costs.operatingCost).toBeCloseTo(100, 5);
    expect(costs.marketingCost).toBeCloseTo(50, 5);
    expect(costs.totalCost).toBeCloseTo(159, 5);
  });

  it('profit = revenue - total cost, and cash accumulates it', () => {
    const result = run();
    for (const r of result.rounds) {
      expect(r.metrics.profit).toBeCloseTo(r.metrics.revenue - r.metrics.totalCost, 1);
    }
    const expectedFinalCash =
      result.input.budget + result.rounds.reduce((a, r) => a + r.metrics.profit, 0);
    expect(result.totals.finalCash).toBeCloseTo(expectedFinalCash, 0);
  });

  it('applies the cost multiplier from shock events', () => {
    const shocked = computeCosts({
      units: 10,
      price: 3,
      unitCostRatio: 0.3,
      monthlyFixedCost: 100,
      marketingBudget: 50,
      costMultiplier: 1.2,
    });
    expect(shocked.operatingCost).toBeCloseTo(120, 5);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Variants                                                         */
/* ------------------------------------------------------------------ */

describe('what-if variants', () => {
  it('a variant with changed variables differs from the original', () => {
    const original = run();
    const variant = run({ price: 4.5, marketingBudget: 3000, quality: 0.75 });
    expect(variant.totals).not.toEqual(original.totals);
    expect(JSON.stringify(variant.rounds.map((r) => r.metrics))).not.toBe(
      JSON.stringify(original.rounds.map((r) => r.metrics)),
    );
  });

  it('keeps the original untouched when a variant runs', () => {
    const original = run();
    const snapshot = JSON.stringify(original.totals);
    run({ price: 8 });
    expect(JSON.stringify(original.totals)).toBe(snapshot);
  });

  it('a variant shares provenance through the same seed family', () => {
    const original = run();
    const variant = run({ price: 5 });
    expect(variant.seed).toBe(original.seed);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Score + findings integrity                                       */
/* ------------------------------------------------------------------ */

describe('score and findings', () => {
  it('score stays inside 0..100 and is the weighted sum of its parts', () => {
    const result = run();
    expect(result.score.score).toBeGreaterThanOrEqual(0);
    expect(result.score.score).toBeLessThanOrEqual(100);
    const summed = result.score.components.reduce((a, c) => a + c.points, 0);
    expect(Math.abs(summed - result.score.score)).toBeLessThanOrEqual(1);
  });

  it('weights sum to 1', () => {
    const total = run().score.components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('every finding references real evidence strings', () => {
    const result = run();
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings.length).toBeLessThanOrEqual(7);
    for (const f of result.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.detail.length).toBeGreaterThan(20);
    }
  });

  it('a more expensive, weaker offer scores below the original', () => {
    const good = run({ price: 2.6, quality: 0.7, marketingBudget: 2500 });
    const bad = run({ price: 8.5, quality: 0.3, marketingBudget: 100 });
    expect(good.score.score).toBeGreaterThan(bad.score.score);
  });
});

/* ------------------------------------------------------------------ */
/* 8. RNG + normalization                                              */
/* ------------------------------------------------------------------ */

describe('random and normalization', () => {
  it('RNG is reproducible and stays in range', () => {
    const a = new RNG('seed-x');
    const b = new RNG('seed-x');
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes string seeds stably', () => {
    expect(seedToNumber('berlin-coffee')).toBe(seedToNumber('berlin-coffee'));
    expect(seedToNumber('a')).not.toBe(seedToNumber('b'));
  });

  it('normalizes missing advanced variables into sensible defaults', () => {
    const normalized: NormalizedInput = normalizeInput({
      ...baseInput,
      marketingBudget: undefined as unknown as number,
      competitorCount: undefined as unknown as number,
      capacity: undefined as unknown as number,
      monthlyFixedCost: undefined as unknown as number,
      initialCustomers: undefined as unknown as number,
      customerAcquisitionCost: undefined as unknown as number,
      durationMonths: 9,
    });
    expect(normalized.durationMonths).toBe(12); // invalid duration falls back
    expect(normalized.marketingBudget).toBeGreaterThan(0);
    expect(normalized.competitorCount).toBeGreaterThan(0);
    expect(normalized.capacity).toBeGreaterThan(0);
    expect(normalized.seed).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function makeCustomer(overrides: Partial<CustomerAgent> = {}): CustomerAgent {
  return {
    id: 'c1',
    age: 24,
    incomeLevel: 0.3,
    priceSensitivity: 0.5,
    qualitySensitivity: 0.5,
    brandLoyalty: 0.4,
    riskTolerance: 0.5,
    purchaseFrequency: 0.5,
    awareness: 0.8,
    satisfaction: 0.5,
    retentionProbability: 0.5,
    locationSegment: 'student_quarter',
    purchasedLastRound: false,
    totalPurchases: 0,
    totalSpend: 0,
    ...overrides,
  };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
