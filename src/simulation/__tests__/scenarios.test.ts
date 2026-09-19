/**
 * Scenario + event rule tests: parsing, event conditions, and the guarantee
 * that events always come from state, never from nowhere.
 */

import { describe, expect, it } from 'vitest';
import { detectAudienceKey, getCityProfile, normalizeInput } from '../world';
import { parseIdea, inputFromIdea, DEMO_SCENARIOS, runDemo } from '../scenarios';
import { evaluateEvents, drainEffects } from '../events';
import { RNG } from '../random';
import { createWorld } from '../world';
import type { SimulationInput } from '../../types/simulation';

const baseInput: SimulationInput = {
  name: 'X',
  description: 'low-cost coffee shop for students',
  type: 'business',
  country: 'Germany',
  city: 'Berlin',
  targetAudience: 'Students',
  audienceKey: 'students',
  currency: 'EUR',
  budget: 22000,
  price: 2.9,
  operatingCost: 3100,
  employees: 3,
  capacity: 500,
  durationMonths: 12,
  marketingBudget: 900,
  initialCustomers: 20,
  competitorCount: 5,
  customerAcquisitionCost: 9,
  monthlyFixedCost: 3100,
  quality: 0.5,
  seed: 1234,
};

describe('audience detection', () => {
  it('maps idea text to an archetype', () => {
    expect(detectAudienceKey('cheap coffee for university students')).toBe('students');
    expect(detectAudienceKey('premium service for professionals')).toBe('professionals');
    expect(detectAudienceKey('something for tourists')).toBe('tourists');
    expect(detectAudienceKey('random text')).toBe('general');
  });
});

describe('location profiles', () => {
  it('gives known cities distinct economics', () => {
    const berlin = getCityProfile('Berlin', 'Germany');
    const cairo = getCityProfile('Cairo', 'Egypt');
    expect(cairo.costIndex).toBeLessThan(berlin.costIndex);
    expect(cairo.priceIndex).toBeLessThan(berlin.priceIndex);
  });

  it('falls back gracefully for unknown cities', () => {
    const unknown = getCityProfile('Nowhereville', 'Atlantis');
    expect(unknown.costIndex).toBeGreaterThan(0);
  });
});

describe('idea parsing (deterministic fallback)', () => {
  it('extracts city, country and pricing posture', () => {
    const parsed = parseIdea('I want to open a cheap coffee shop for university students in Berlin');
    expect(parsed.city).toBe('Berlin');
    expect(parsed.country).toBe('Germany');
    expect(parsed.audienceKey).toBe('students');
    expect(parsed.price).toBeGreaterThan(0);
    expect(parsed.notes.length).toBeGreaterThan(0);
  });

  it('produces a complete input from a one-line idea', () => {
    const input = inputFromIdea('Open a cheap coffee shop for students in Cairo');
    const normalized = normalizeInput(input);
    expect(normalized.city).toBe('Cairo');
    expect(normalized.currency).toBe('EGP');
    expect(normalized.durationMonths).toBe(12);
    expect(normalized.competitorCount).toBeGreaterThan(0);
  });

  it('can parse an Arabic-language idea', () => {
    const parsed = parseIdea('أريد فتح مقهى رخيص للطلاب في القاهرة');
    expect(parsed.audienceKey).toBe('students');
    expect(parsed.city).toBe('Cairo');
  });
});

describe('event rules', () => {
  it('always fires the launch event in month 1', () => {
    const world = createWorld(baseInput);
    const { events } = evaluateEvents(
      world,
      {
        month: 1,
        durationMonths: 12,
        market: world.market,
        cash: 22000,
        startingCash: 22000,
        monthlyProfit: 100,
        monthOverMonthDemandDelta: 0,
        monthOverMonthSatisfactionDelta: 0,
        marketingBudget: 900,
        ourMarketShare: 0.1,
      },
      new RNG('e1'),
    );
    expect(events.some((e) => e.type === 'business_launched')).toBe(true);
  });

  it('emits a cost-increase event at most once per simulation', () => {
    const world = createWorld(baseInput);
    const ctx = {
      month: 5,
      durationMonths: 12,
      market: world.market,
      cash: 22000,
      startingCash: 22000,
      monthlyProfit: 100,
      monthOverMonthDemandDelta: 0,
      monthOverMonthSatisfactionDelta: 0,
      marketingBudget: 900,
      ourMarketShare: 0.05,
    };
    let costEvents = 0;
    for (let i = 0; i < 60; i++) {
      const r = evaluateEvents(world, ctx, new RNG(`s${i}`));
      costEvents += r.events.filter((e) => e.type === 'cost_increase').length;
    }
    expect(costEvents).toBeLessThanOrEqual(1);
  });

  it('flags negative cash with a cash warning', () => {
    const world = createWorld(baseInput);
    const { events } = evaluateEvents(
      world,
      {
        month: 4,
        durationMonths: 12,
        market: world.market,
        cash: -500,
        startingCash: 22000,
        monthlyProfit: -400,
        monthOverMonthDemandDelta: 0,
        monthOverMonthSatisfactionDelta: 0,
        marketingBudget: 900,
        ourMarketShare: 0.05,
      },
      new RNG('cash'),
    );
    expect(events.some((e) => e.type === 'cash_warning')).toBe(true);
  });

  it('never emits a competitor-entry event in the final month', () => {
    const world = createWorld({ ...baseInput, competitorCount: 1 });
    const ctx = {
      month: 12,
      durationMonths: 12,
      market: world.market,
      cash: 22000,
      startingCash: 22000,
      monthlyProfit: 500,
      monthOverMonthDemandDelta: 0.3,
      monthOverMonthSatisfactionDelta: 0.2,
      marketingBudget: 900,
      ourMarketShare: 0.4,
    };
    for (let i = 0; i < 40; i++) {
      const r = evaluateEvents(world, ctx, new RNG(`x${i}`));
      expect(r.events.some((e) => e.type === 'competitor_enters')).toBe(false);
    }
  });

  it('converts event impacts into next-round effects', () => {
    const drained = drainEffects([
      { source: 'a', demandMultiplier: 1.1 },
      { source: 'b', demandMultiplier: 0.9, awarenessBoost: 0.05, costMultiplier: 1.2 },
    ]);
    expect(drained.demandMultiplier).toBeCloseTo(0.99, 5);
    expect(drained.awarenessBoost).toBeCloseTo(0.05, 5);
    expect(drained.costMultiplier).toBeCloseTo(1.2, 5);
  });
});

describe('demo scenarios', () => {
  it('ships at least one public demo', () => {
    expect(DEMO_SCENARIOS.length).toBeGreaterThanOrEqual(1);
    expect(DEMO_SCENARIOS[0].name).toContain('Student Coffee Shop');
  });

  it('runs the demo through the real engine', () => {
    const run = runDemo('student-coffee-shop-berlin');
    expect(run).not.toBeNull();
    expect(run!.rounds).toHaveLength(12);
    expect(run!.customers).toHaveLength(100);
    expect(run!.score.score).toBeGreaterThanOrEqual(0);
    expect(run!.events.length).toBeGreaterThan(0);
  });

  it('demo run is reproducible', () => {
    const a = runDemo('premium-coffee-shop-london');
    const b = runDemo('premium-coffee-shop-london');
    expect(a!.totals).toEqual(b!.totals);
  });
});
