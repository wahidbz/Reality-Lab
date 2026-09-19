/**
 * Event system.
 *
 * Events are never invented out of thin air: each one is produced by a *rule*
 * evaluated against the current world state and a controlled probability drawn
 * from the seeded RNG. Every event carries id, type, month, severity, a
 * human-readable description and a structured impact that the next round applies.
 */

import type { MarketBaseline, PendingEffect, SimEvent, WorldState } from '../types/simulation';
import { RNG } from './random';

export interface EventContext {
  month: number;
  durationMonths: number;
  market: MarketBaseline;
  cash: number;
  startingCash: number;
  monthlyProfit: number;
  monthOverMonthDemandDelta: number;
  monthOverMonthSatisfactionDelta: number;
  marketingBudget: number;
  ourMarketShare: number;
}

let eventCounter = 0;
const nextId = (month: number, type: string) => `evt_${month}_${type}_${++eventCounter}`;

const make = (
  type: SimEvent['type'],
  month: number,
  severity: SimEvent['severity'],
  description: string,
  impact: SimEvent['impact'],
): SimEvent => ({ id: nextId(month, type), type, month, severity, description, impact });

/**
 * Evaluates all event rules for the round just completed.
 * Returns events AND the pending effects they will have on the next round.
 */
export function evaluateEvents(
  world: WorldState,
  ctx: EventContext,
  rng: RNG,
): { events: SimEvent[]; effects: PendingEffect[] } {
  const events: SimEvent[] = [];
  const effects: PendingEffect[] = [];
  const { month } = ctx;

  /* --- Month 1: the business opens. Deterministic, not probabilistic. --- */
  if (month === 1) {
    events.push(
      make('business_launched', 1, 'low', 'Business launched.', {
        kind: 'launch',
        value: world.business.startingCash,
        label: 'Opening cash',
      }),
    );
  }

  /* --- Awareness crossing a threshold --- */
  if (world.metrics && world.metrics.awareness > 0.5 && month >= 2 && month <= 4) {
    const alreadyFired = world.events.some((e) => e.type === 'satisfaction_increase' && e.month < month);
    if (!alreadyFired) {
      events.push(
        make(
          'marketing_success',
          month,
          'medium',
          'Customer awareness increased significantly.',
          { kind: 'awareness', value: round3(world.metrics.awareness), label: 'Awareness' },
        ),
      );
    }
  }

  /* --- Demand spike: growth is strong and momentum exists --- */
  if (ctx.monthOverMonthDemandDelta > 0.18 && rng.chance(0.45)) {
    const multiplier = rng.range(1.08, 1.2);
    events.push(
      make('demand_spike', month, 'medium', 'Demand spike: demand accelerated faster than expected.', {
        kind: 'demand_multiplier',
        value: round3(multiplier),
        label: 'Next-month demand',
      }),
    );
    effects.push({ source: `demand_spike_m${month}`, demandMultiplier: multiplier });
  }

  /* --- Demand decline: shrinking demand --- */
  if (ctx.monthOverMonthDemandDelta < -0.15 && rng.chance(0.5)) {
    const multiplier = rng.range(0.82, 0.94);
    events.push(
      make('demand_decline', month, 'high', 'Demand declined after a drop in customer interest.', {
        kind: 'demand_multiplier',
        value: round3(multiplier),
        label: 'Next-month demand',
      }),
    );
    effects.push({ source: `demand_decline_m${month}`, demandMultiplier: multiplier });
  }

  /* --- Marketing failure: budget spent, awareness barely moved --- */
  if (ctx.marketingBudget > 0 && world.metrics && world.metrics.awareness < 0.35 && month >= 3 && rng.chance(0.25)) {
    events.push(
      make('marketing_failure', month, 'medium', 'Marketing spend had limited reach in this market.', {
        kind: 'awareness',
        value: round3(world.metrics.awareness),
        label: 'Awareness',
      }),
    );
  }

  /* --- Satisfaction movements (only when the movement is material) --- */
  if (ctx.monthOverMonthSatisfactionDelta > 0.03 && rng.chance(0.4)) {
    events.push(
      make('satisfaction_increase', month, 'low', 'Customer satisfaction increased.', {
        kind: 'satisfaction',
        value: round3(ctx.monthOverMonthSatisfactionDelta),
        label: 'Change',
      }),
    );
  }
  if (ctx.monthOverMonthSatisfactionDelta < -0.03 && rng.chance(0.4)) {
    events.push(
      make('satisfaction_decline', month, 'medium', 'Customer satisfaction declined.', {
        kind: 'satisfaction',
        value: round3(ctx.monthOverMonthSatisfactionDelta),
        label: 'Change',
      }),
    );
  }

  /* --- Viral exposure: rare, high severity, strong temporary awareness lift --- */
  if (world.metrics && world.metrics.avgSatisfaction > 0.68 && month >= 3 && rng.chance(0.08)) {
    const boost = 0.12;
    events.push(
      make('viral_exposure', month, 'high', 'Viral exposure: the business was widely shared online.', {
        kind: 'awareness_boost',
        value: boost,
        label: 'Extra awareness',
      }),
    );
    effects.push({ source: `viral_m${month}`, awarenessBoost: boost });
    world.flags.viralUntilRound = month + 1;
  }

  /* --- Cost increase: input costs rose (fires at most once) --- */
  if (!world.flags.costShockApplied && month >= 4 && rng.chance(0.12)) {
    const multiplier = rng.range(1.06, 1.18);
    world.flags.costShockApplied = true;
    events.push(
      make('cost_increase', month, 'medium', 'Operating costs increased (suppliers / rent / wages).', {
        kind: 'cost_multiplier',
        value: round3(multiplier),
        label: 'Next-month costs',
      }),
    );
    effects.push({ source: `cost_increase_m${month}`, costMultiplier: multiplier });
  }

  /* --- Cash warning: runway under two months of current burn --- */
  if (ctx.cash < 0 && ctx.monthlyProfit < 0) {
    events.push(
      make('cash_warning', month, 'high', 'Cash balance went negative — the business is running out of runway.', {
        kind: 'cash',
        value: round2(ctx.cash),
        label: 'Cash balance',
      }),
    );
  }

  /* --- Competitor entry: markets attract entrants while margins look good --- */
  if (
    ctx.month >= 3 &&
    ctx.month < ctx.durationMonths &&
    ctx.ourMarketShare > 0.14 &&
    rng.chance(0.1 + ctx.market.competitionIntensity * 0.08)
  ) {
    events.push(
      make('competitor_enters', month, 'high', 'New competitor entered the market.', {
        kind: 'competition',
        value: 1,
        label: 'New entrant',
      }),
    );
  }

  return { events, effects };
}

/** Applies and then consumes pending effects at the start of a round. */
export function drainEffects(effects: PendingEffect[]): {
  awarenessBoost: number;
  demandMultiplier: number;
  costMultiplier: number;
} {
  return {
    awarenessBoost: effects.reduce((a, e) => a + (e.awarenessBoost ?? 0), 0),
    demandMultiplier: effects.reduce((a, e) => a * (e.demandMultiplier ?? 1), 1),
    costMultiplier: effects.reduce((a, e) => a * (e.costMultiplier ?? 1), 1),
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
