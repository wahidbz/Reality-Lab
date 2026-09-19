/**
 * The simulation engine.
 *
 * `runSimulation` is a pure, synchronous, deterministic function:
 *   same input + same seed  =>  identical SimulationRun
 *
 * It never touches the network or the DOM, so it can run in the browser today
 * and be moved server-side later without changes (see README).
 *
 * Per round the engine performs, in order:
 *   1. apply pending event effects
 *   2. update awareness
 *   3. compute per-customer purchase decisions (demand)
 *   4. cap by capacity, resolve the competition
 *   5. competitors react
 *   6. revenue, costs, profit, cash
 *   7. satisfaction + retention update
 *   8. evaluate + emit events
 *   9. record metrics
 */

import type {
  AgentActivitySummary,
  CustomerAgent,
  NormalizedInput,
  RoundMetrics,
  RoundResult,
  SimEvent,
  SimulationInput,
  SimulationRun,
} from '../types/simulation';
import { RNG, clamp, seedToNumber } from './random';
import { createWorld, detectAudienceKey, normalizeInput } from './world';
import {
  DEFAULT_AGENT_COUNT,
  competitorReact,
  computeCompetitionPressure,
  generateCompetitors,
  generateCustomers,
  purchaseProbability,
  retentionProbability,
  updateSatisfaction,
} from './agent';
import {
  applyAwareness,
  applyCapacity,
  computeAwarenessGain,
  computeCosts,
  computeMarketShare,
  computeRevenue,
  evolveCompetitorBase,
} from './rules';
import { drainEffects, evaluateEvents } from './events';
import { computeScore, computeTotals, generateFindings } from './metrics';

/** Structural clone that is safe for our plain-data world (no Dates/functions). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface RunOptions {
  agentCount?: number;
  /** Called after each round — used by the UI for staged progress feedback. */
  onProgress?: (progress: RunProgress) => void;
}

export interface RunProgress {
  round: number;
  totalRounds: number;
  phase: SimulationPhase;
  percent: number;
}

export type SimulationPhase =
  | 'initializing'
  | 'creating_agents'
  | 'running_market'
  | 'processing_events'
  | 'calculating'
  | 'report'
  | 'complete';

export const PHASE_LABELS: Record<SimulationPhase, string> = {
  initializing: 'Initializing world...',
  creating_agents: 'Creating agents...',
  running_market: 'Running market simulation...',
  processing_events: 'Processing events...',
  calculating: 'Calculating results...',
  report: 'Generating report...',
  complete: 'Simulation complete.',
};

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function monthLabel(round: number): string {
  return round <= 12 ? `Month ${round}` : `Month ${round}`;
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                            */
/* -------------------------------------------------------------------------- */

export function runSimulation(
  input: SimulationInput,
  seedOverride?: number | string,
  options: RunOptions = {},
): SimulationRun {
  const agentCount = options.agentCount ?? DEFAULT_AGENT_COUNT;
  const report = (round: number, phase: SimulationPhase, total: number) => {
    options.onProgress?.({
      round,
      totalRounds: total,
      phase,
      percent: Math.round((round / Math.max(1, total)) * 100),
    });
  };

  /* 1 — World ------------------------------------------------------------- */
  const world = createWorld(input, seedOverride);
  const settings: NormalizedInput = world.settings;
  const totalRounds = settings.durationMonths;

  report(0, 'initializing', totalRounds);

  // Deterministic streams: one master, plus a per-round stream so adding a rule
  // in round 7 cannot shift the draws made in round 2.
  const master = new RNG(settings.seed);
  const agentRng = master.fork('agents');
  const roundRng = (month: number) => master.fork(`round_${month}`);
  const eventRng = (month: number) => master.fork(`events_${month}`);

  /* 2 — Agents ------------------------------------------------------------ */
  world.customers = generateCustomers(world, agentRng, agentCount);
  world.competitors = generateCompetitors(world, agentRng);
  report(0, 'creating_agents', totalRounds);

  /* Pre-run state --------------------------------------------------------- */
  const rounds: RoundResult[] = [];
  let previousMetrics: RoundMetrics | null = null;
  let previousSatisfaction = avgSatisfaction(world.customers);

  /* 3 — Round loop -------------------------------------------------------- */
  for (let month = 1; month <= totalRounds; month++) {
    world.currentRound = month;
    const rng = roundRng(month);

    /* 3.1 apply pending effects from events raised last round */
    const effects = drainEffects(world.pendingEffects);
    world.pendingEffects = [];

    /* 3.2 awareness */
    const satisfiedShare =
      previousMetrics && previousMetrics.customers > 0
        ? previousMetrics.returningCustomers / Math.max(1, previousMetrics.customers)
        : 0;
    const awarenessGain = computeAwarenessGain({
      marketingBudget: world.business.marketingBudget,
      price: world.business.price,
      marketAvgMarketingPower: world.market.avgMarketingPower,
      satisfiedShare,
      viralBoost: effects.awarenessBoost,
    });
    applyAwareness(world.customers, awarenessGain.gain);

    /* 3.3 competition pressure & demand expectation */
    const competitionPressure = computeCompetitionPressure(world);
    const purchaseCtx = {
      price: world.business.price,
      quality: world.business.quality,
      marketAvgPrice: world.market.avgPrice,
      marketAvgQuality: world.market.avgQuality,
      competitionPressure,
      demandMultiplier: effects.demandMultiplier,
    };

    report(month, 'running_market', totalRounds);

    /* 3.4 customer decisions */
    let demand = 0;
    let units = 0;
    let newCustomers = 0;
    let returningCustomers = 0;
    const uniqueBuyers = new Set<string>();

    for (const customer of world.customers) {
      const p = purchaseProbability(customer, purchaseCtx);
      demand += p;
      if (rng.chance(p)) {
        units++;
        uniqueBuyers.add(customer.id);
        if (customer.purchasedLastRound) returningCustomers++;
        else newCustomers++;
        customer.totalPurchases += 1;
        customer.totalSpend = round2(customer.totalSpend + world.business.price);
      }
    }

    /* 3.5 capacity cap — scale back proportionally if over capacity */
    const capacity = world.business.capacity;
    if (units > capacity) {
      const scale = capacity / units;
      units = capacity;
      newCustomers = Math.round(newCustomers * scale);
      returningCustomers = Math.round(returningCustomers * scale);
      demand = Math.min(demand, capacity);
    }

    /* 3.6 competitors react to the business' traction */
    const competitorsBefore = world.competitors.map((c) => ({ id: c.id, base: c.customerBase }));
    const provisionalShare = computeMarketShare(
      uniqueBuyers.size,
      competitorsBefore.map((c) => c.base),
    );
    const activity = {
      purchases: units,
      newCustomers,
      returningCustomers,
      awareCustomers: world.customers.filter((c) => c.awareness > 0.5).length,
      satisfactionDelta: 0,
      demandDelta: 0,
      competitorActions: [] as { competitor: string; action: string }[],
      notes: [] as string[],
    };

    const roundEvents: SimEvent[] = [];
    for (const comp of world.competitors) {
      const reaction = competitorReact(comp, provisionalShare, rng);
      if (reaction) {
        comp.actions.push(reaction.action);
        activity.competitorActions.push({ competitor: comp.name, action: reaction.action });
        roundEvents.push({
          id: `evt_${month}_react_${comp.id}`,
          type: reaction.eventType,
          month,
          severity: reaction.impactValue > 0.08 ? 'high' : 'medium',
          description: `${comp.name} ${reaction.action} in response to market pressure.`,
          impact: { kind: 'competition', value: reaction.impactValue, label: 'Competitor move' },
        });
      }
    }

    /* 3.7 revenue / costs / profit / cash */
    const revenue = computeRevenue(units, world.business.price);
    const costs = computeCosts({
      units,
      price: world.business.price,
      unitCostRatio: world.business.unitCostRatio,
      monthlyFixedCost: world.business.monthlyFixedCost,
      marketingBudget: world.business.marketingBudget,
      costMultiplier: effects.costMultiplier,
    });
    const profit = round2(revenue - costs.totalCost);
    const cumulativeProfit = round2((previousMetrics?.cumulativeProfit ?? 0) + profit);
    const cashBalance = round2((previousMetrics?.cashBalance ?? world.business.startingCash) + profit);
    world.business.cash = cashBalance;

    /* 3.8 satisfaction + retention */
    for (const customer of world.customers) {
      const purchased = uniqueBuyers.has(customer.id);
      customer.satisfaction = updateSatisfaction(
        customer,
        purchased,
        world.business.quality,
        world.business.price,
        world.market.avgPrice,
      );
      customer.retentionProbability = retentionProbability(customer);
      // Retention governs whether this month's buyer stays "warm" next month.
      customer.purchasedLastRound = purchased
        ? rng.chance(clamp(customer.retentionProbability + 0.35, 0, 0.99))
        : false;
      // Awareness decay so marketing must keep working (and so awareness never
      // pins at 1.0, which would make marketing budgets indistinguishable).
      customer.awareness = clamp(customer.awareness * 0.97, 0, 1);
    }

    const avgSat = avgSatisfaction(world.customers);
    const retentionRate =
      uniqueBuyers.size > 0 ? returningCustomers / uniqueBuyers.size : 0;

    /* 3.9 competitor bases + market share */
    const shareDelta = provisionalShare - (previousMetrics?.marketShare ?? 0);
    world.competitors.forEach((c) => {
      c.customerBase = evolveCompetitorBase(c.customerBase, c.marketingPower, shareDelta);
    });
    const marketShare = computeMarketShare(
      uniqueBuyers.size,
      world.competitors.map((c) => c.customerBase),
    );
    world.competitors.forEach((c) => {
      const total =
        world.competitors.reduce((a, x) => a + x.customerBase, 0) + uniqueBuyers.size;
      c.marketShare = total > 0 ? round4(c.customerBase / total) : 0;
    });

    /* 3.10 metrics record */
    const metrics: RoundMetrics = {
      round: month,
      revenue: round2(revenue),
      operatingCost: round2(costs.operatingCost),
      marketingCost: round2(costs.marketingCost),
      cogs: round2(costs.cogs),
      totalCost: round2(costs.totalCost),
      profit,
      cumulativeProfit,
      cashBalance,
      customers: uniqueBuyers.size,
      newCustomers,
      returningCustomers,
      retentionRate: round4(retentionRate),
      marketShare,
      avgSatisfaction: round4(avgSat),
      awareness: round4(avgAwareness(world.customers)),
      demand: round2(demand),
      units,
      competitionPressure,
    };
    world.metrics = metrics;

    activity.satisfactionDelta = round4(avgSat - previousSatisfaction);
    activity.demandDelta = previousMetrics
      ? round4((units - previousMetrics.units) / Math.max(1, previousMetrics.units))
      : 0;

    /* 3.11 events */
    report(month, 'processing_events', totalRounds);
    const { events: newEvents, effects: newEffects } = evaluateEvents(
      world,
      {
        month,
        durationMonths: totalRounds,
        market: world.market,
        cash: cashBalance,
        startingCash: world.business.startingCash,
        monthlyProfit: profit,
        monthOverMonthDemandDelta: activity.demandDelta,
        monthOverMonthSatisfactionDelta: activity.satisfactionDelta,
        marketingBudget: world.business.marketingBudget,
        ourMarketShare: marketShare,
      },
      eventRng(month),
    );
    world.events.push(...newEvents);
    world.pendingEffects.push(...newEffects);

    rounds.push({
      round: month,
      label: monthLabel(month),
      metrics,
      activity,
      events: [...roundEvents, ...newEvents],
    });

    previousMetrics = metrics;
    previousSatisfaction = avgSat;
  }

  /* 4 — Results ----------------------------------------------------------- */
  report(totalRounds, 'calculating', totalRounds);
  const totals = computeTotals(rounds.map((r) => r.metrics), world.business.startingCash);
  const score = computeScore({
    totals,
    startingCash: world.business.startingCash,
    agentCount,
  });
  const findings = generateFindings(rounds.map((r) => r.metrics), totals);
  const explanation = buildExplanation(rounds, totals, world.market.avgMarketingPower);

  report(totalRounds, 'report', totalRounds);
  const run: SimulationRun = {
    seed: settings.seed,
    input: clone(settings),
    world: clone({
      ...world,
      customers: [], // keep the persisted payload small; agents go in `customers`
    }),
    rounds,
    events: world.events.slice(),
    totals,
    score,
    findings,
    customers: clone(world.customers),
    competitors: clone(world.competitors),
    explanation,
    createdAt: new Date(0).toISOString(),
  };
  report(totalRounds, 'complete', totalRounds);
  return run;
}

/* -------------------------------------------------------------------------- */
/* Explainability                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Turns the metric timeline into plain-language causality notes. These are
 * derived from the actual series — they are not template text with no data.
 */
function buildExplanation(
  rounds: RoundResult[],
  totals: SimulationTotalsLike,
  marketMarketingPower: number,
): string[] {
  const out: string[] = [];
  if (rounds.length === 0) return out;

  const series = rounds.map((r) => r.metrics);
  const first = series[0];
  const last = series[series.length - 1];

  // Awareness -> demand causality
  const awarenessStart = first.awareness;
  const awarenessPeak = Math.max(...series.map((s) => s.awareness));
  const peakMonth = series.find((s) => s.awareness === awarenessPeak)?.round ?? 1;
  if (awarenessPeak - awarenessStart > 0.12) {
    out.push(
      `Demand rose with awareness: awareness grew from ${pct(awarenessStart)} to ${pct(awarenessPeak)} by month ${peakMonth}, and monthly purchases followed from ${first.units} to ${series[peakMonth - 1]?.units ?? last.units}.`,
    );
  } else {
    out.push(
      `Awareness stayed near ${pct(awarenessStart)}–${pct(awarenessPeak)} for the whole scenario, which capped the ceiling on demand at roughly ${Math.round(totals.avgMonthlyCustomers)} buyers per month.`,
    );
  }

  // Satisfaction -> retention
  if (last.avgSatisfaction > first.avgSatisfaction + 0.04) {
    out.push(
      `Retention improved because satisfaction climbed from ${pct(first.avgSatisfaction)} to ${pct(last.avgSatisfaction)}, raising the average retention rate to ${pct(totals.avgRetention)}.`,
    );
  } else if (last.avgSatisfaction < first.avgSatisfaction - 0.04) {
    out.push(
      `Retention was held back by falling satisfaction (${pct(first.avgSatisfaction)} → ${pct(last.avgSatisfaction)}), which limited repeat purchases to ${pct(totals.avgRetention)} on average.`,
    );
  }

  // Competition
  const pressureStart = first.competitionPressure;
  const pressureEnd = last.competitionPressure;
  if (pressureEnd > pressureStart + 0.05) {
    out.push(
      `Competitive pressure increased from ${pct(pressureStart)} to ${pct(pressureEnd)}; competitors cut prices or raised marketing once the business gained share, which slowed market-share growth after the midpoint.`,
    );
  } else {
    out.push(
      `Competitive pressure was broadly stable (${pct(pressureStart)} → ${pct(pressureEnd)}), so market share was mainly decided by awareness and price-to-quality fit rather than competitor retaliation. This location's average competitor marketing power is ${pct(marketMarketingPower)}.`,
    );
  }

  // Economics
  out.push(
    totals.totalProfit >= 0
      ? `Unit economics worked: ${fmt(totals.totalUnits)} total units produced ${fmt(totals.totalRevenue)} of revenue against ${fmt(totals.totalCost)} of costs, leaving ${fmt(totals.totalProfit)} of cumulative profit.`
      : `Unit economics did not work at this price: ${fmt(totals.totalUnits)} units produced ${fmt(totals.totalRevenue)} of revenue against ${fmt(totals.totalCost)} of costs, a cumulative loss of ${fmt(Math.abs(totals.totalProfit))}.`,
  );

  // Cash
  out.push(
    totals.finalCash >= 0
      ? `Cash remained solvent, closing at ${fmt(totals.finalCash)} (from ${fmt(rounds[0].metrics.cashBalance)} at launch).`
      : `Cash ran out during the scenario, ending at ${fmt(totals.finalCash)}.`,
  );

  return out;
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

interface SimulationTotalsLike {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalUnits: number;
  avgMonthlyCustomers: number;
  avgRetention: number;
  finalCash: number;
}

const avgSatisfaction = (customers: CustomerAgent[]): number =>
  customers.length === 0
    ? 0
    : customers.reduce((a, c) => a + c.satisfaction, 0) / customers.length;

const avgAwareness = (customers: CustomerAgent[]): number =>
  customers.length === 0 ? 0 : customers.reduce((a, c) => a + c.awareness, 0) / customers.length;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export { detectAudienceKey, seedToNumber, DEFAULT_AGENT_COUNT };
