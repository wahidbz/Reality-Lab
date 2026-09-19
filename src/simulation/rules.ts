/**
 * Rules — the market and marketing dynamics that are *not* agent decisions.
 *
 * These are pure functions of world state so they can be unit-tested in
 * isolation and reasoned about: awareness growth, demand expectation,
 * costs, and market-share math.
 */

import type { CustomerAgent, WorldState } from '../types/simulation';
import { clamp } from './random';
import { purchaseProbability } from './agent';

/* -------------------------------------------------------------------------- */
/* Awareness                                                                   */
/* -------------------------------------------------------------------------- */

export interface AwarenessInput {
  marketingBudget: number;
  price: number;
  marketAvgMarketingPower: number;
  /** Share of customers who bought and were satisfied last round (word of mouth). */
  satisfiedShare: number;
  viralBoost: number;
}

export interface AwarenessResult {
  /** Fraction of previously-unaware customers reached this month (0..~0.7). */
  gain: number;
  paidReach: number;
  wordOfMouth: number;
}

/**
 * Awareness update, monthly.
 *
 *  paidReach  = f(marketing budget vs. unit price scale) reduced by competitors
 *  wordOfMouth= f(share of satisfied buyers)
 *  viralBoost = temporary lift injected by the "viral exposure" event
 *  gain       = min(cap, paidReach + wordOfMouth + viralBoost)
 *
 * Each unaware customer closes `gain` of the remaining gap: A += gain * (1 - A).
 */
export function computeAwarenessGain(input: AwarenessInput): AwarenessResult {
  // Spending of 150x unit price over a month is treated as "full reach". The
  // ceiling is deliberately below 1 so awareness approaches its limit
  // asymptotically and NEVER saturates — marketing keeps mattering all the way
  // through the scenario, and two different budgets always diverge measurably.
  const rawReach = input.marketingBudget / Math.max(1, input.price * 150);
  const paidReach = clamp(rawReach, 0, 0.46);
  const competitionDampener = clamp(1 - input.marketAvgMarketingPower * 0.45, 0.3, 1);
  // Word of mouth is real but intentionally smaller than paid reach.
  const wordOfMouth = clamp(input.satisfiedShare * 0.1, 0, 0.1);
  const gain = clamp(paidReach * competitionDampener + wordOfMouth + input.viralBoost, 0, 0.55);
  return {
    gain: Math.round(gain * 1000) / 1000,
    paidReach: Math.round(paidReach * 1000) / 1000,
    wordOfMouth: Math.round(wordOfMouth * 1000) / 1000,
  };
}

export function applyAwareness(customers: CustomerAgent[], gain: number): void {
  for (const c of customers) {
    c.awareness = clamp(c.awareness + gain * (1 - c.awareness), 0, 1);
  }
}

/* -------------------------------------------------------------------------- */
/* Demand expectation                                                          */
/* -------------------------------------------------------------------------- */

export function expectedUnits(customers: CustomerAgent[], ctx: Parameters<typeof purchaseProbability>[1]): number {
  return customers.reduce((sum, c) => sum + purchaseProbability(c, ctx), 0);
}

/* -------------------------------------------------------------------------- */
/* Cost model                                                                  */
/* -------------------------------------------------------------------------- */

export interface CostModelInput {
  units: number;
  price: number;
  unitCostRatio: number;
  monthlyFixedCost: number;
  marketingBudget: number;
  /** Multiplier applied by the "cost increase" event. */
  costMultiplier: number;
}

export interface CostModelResult {
  cogs: number;
  operatingCost: number;
  marketingCost: number;
  totalCost: number;
}

/**
 * Simple, transparent unit economics:
 *   revenue = units * price
 *   cogs    = units * price * unitCostRatio
 *   cost    = cogs + (fixed opex * costMultiplier) + marketing spend
 */
export function computeCosts(input: CostModelInput): CostModelResult {
  const cogs = round2(input.units * input.price * input.unitCostRatio);
  const operatingCost = round2(input.monthlyFixedCost * input.costMultiplier);
  const marketingCost = round2(input.marketingBudget);
  return {
    cogs,
    operatingCost,
    marketingCost,
    totalCost: round2(cogs + operatingCost + marketingCost),
  };
}

export function computeRevenue(units: number, price: number): number {
  return round2(units * price);
}

/* -------------------------------------------------------------------------- */
/* Market share                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Share of the *served* market. The business' served customers are its monthly
 * unique buyers; competitors' bases are carried month to month.
 */
export function computeMarketShare(ourCustomers: number, competitorBases: number[]): number {
  const competitorTotal = competitorBases.reduce((a, b) => a + b, 0);
  const total = ourCustomers + competitorTotal;
  if (total <= 0) return 0;
  return round4(ourCustomers / total);
}

/** Competitor bases grow with their marketing power and shrink when we take share. */
export function evolveCompetitorBase(
  base: number,
  marketingPower: number,
  ourShareDelta: number,
): number {
  const organic = base * (1 + 0.012 + marketingPower * 0.03);
  const ourGainDrain = base * clamp(ourShareDelta, -0.1, 0.1) * 1.4;
  return Math.max(10, round2(organic - ourGainDrain));
}

/* -------------------------------------------------------------------------- */
/* Capacity cap                                                                */
/* -------------------------------------------------------------------------- */

/** A business cannot sell more units than it can serve in a month. */
export function applyCapacity(units: number, capacity: number): number {
  return Math.min(units, Math.max(1, capacity));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
