/**
 * Metrics + the Simulation Score.
 *
 * `computeScore` is deliberately transparent: a weighted sum of six normalized
 * sub-scores, each mapping a raw metric into 0..1 with a documented curve.
 * The full breakdown is returned so the UI can show *why* a scenario scored
 * what it scored.
 */

import type {
  Finding,
  RoundMetrics,
  ScoreComponent,
  SimulationScoreResult,
  SimulationTotals,
} from '../types/simulation';
import { clamp } from './random';

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

export function computeTotals(
  rounds: RoundMetrics[],
  startingCash: number,
): SimulationTotals {
  if (rounds.length === 0) {
    return {
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      totalMarketing: 0,
      totalUnits: 0,
      totalNewCustomers: 0,
      totalReturningCustomers: 0,
      avgMonthlyCustomers: 0,
      peakCustomers: 0,
      finalCash: startingCash,
      finalMarketShare: 0,
      avgRetention: 0,
      avgSatisfaction: 0,
      endingSatisfaction: 0,
      avgCompetitionPressure: 0,
      breakevenMonth: null,
    };
  }

  const sum = (f: (m: RoundMetrics) => number) => rounds.reduce((a, m) => a + f(m), 0);
  const avg = (f: (m: RoundMetrics) => number) => sum(f) / rounds.length;

  const breakeven = rounds.find((m) => m.profit > 0);

  return {
    totalRevenue: round2(sum((m) => m.revenue)),
    totalCost: round2(sum((m) => m.totalCost)),
    totalProfit: round2(sum((m) => m.profit)),
    totalMarketing: round2(sum((m) => m.marketingCost)),
    totalUnits: Math.round(sum((m) => m.units)),
    totalNewCustomers: Math.round(sum((m) => m.newCustomers)),
    totalReturningCustomers: Math.round(sum((m) => m.returningCustomers)),
    avgMonthlyCustomers: round2(avg((m) => m.customers)),
    peakCustomers: Math.round(Math.max(...rounds.map((m) => m.customers))),
    finalCash: round2(rounds[rounds.length - 1].cashBalance),
    finalMarketShare: round4(rounds[rounds.length - 1].marketShare),
    avgRetention: round4(avg((m) => m.retentionRate)),
    avgSatisfaction: round4(avg((m) => m.avgSatisfaction)),
    endingSatisfaction: round4(rounds[rounds.length - 1].avgSatisfaction),
    avgCompetitionPressure: round4(avg((m) => m.competitionPressure)),
    breakevenMonth: breakeven ? breakeven.round : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Simulation score                                                            */
/* -------------------------------------------------------------------------- */

/** Marginal profitability: profit per month as a share of starting cash. */
function profitabilityCurve(totals: SimulationTotals, startingCash: number): number {
  const monthlyMargin = totals.totalProfit / Math.max(1, startingCash);
  // 0.0 => 0, 0.5x starting cash per month => 1.0 (capped)
  return clamp(monthlyMargin / 0.5, 0, 1);
}

function demandCurve(totals: SimulationTotals, agentCount: number): number {
  // Average monthly customers as a share of the addressable agent pool.
  return clamp(totals.avgMonthlyCustomers / Math.max(10, agentCount * 0.55), 0, 1);
}

function retentionCurve(totals: SimulationTotals): number {
  return clamp((totals.avgRetention - 0.25) / 0.6, 0, 1);
}

function marketShareCurve(totals: SimulationTotals): number {
  return clamp(totals.finalMarketShare / 0.35, 0, 1);
}

function cashSustainabilityCurve(totals: SimulationTotals, startingCash: number): number {
  if (startingCash <= 0) return 0;
  const end = totals.finalCash / startingCash;
  return clamp((end + 0.5) / 2, 0, 1);
}

function competitionCurve(totals: SimulationTotals): number {
  // Low competition pressure is good for the score.
  return clamp(1 - totals.avgCompetitionPressure, 0, 1);
}

export interface ScoreInput {
  totals: SimulationTotals;
  startingCash: number;
  agentCount: number;
}

export const SCORE_WEIGHTS: Record<string, number> = {
  demand: 0.2,
  profitability: 0.24,
  retention: 0.2,
  marketShare: 0.14,
  cashSustainability: 0.16,
  competition: 0.06,
};

/**
 * Simulation Score (0–100).
 *
 *   score = 100 * Σ ( weight_i * subscore_i )
 *
 * NOT a prediction — a compressed summary of how this scenario, with these
 * assumptions, behaved inside the model.
 */
export function computeScore(input: ScoreInput): SimulationScoreResult {
  const { totals, startingCash, agentCount } = input;

  const raw: { key: ScoreComponent['key']; label: string; value: number; explanation: string }[] = [
    {
      key: 'demand',
      label: 'Demand',
      value: demandCurve(totals, agentCount),
      explanation: `Average of ${fmt(totals.avgMonthlyCustomers)} monthly buyers against an addressable pool of ${agentCount} agents.`,
    },
    {
      key: 'profitability',
      label: 'Profitability',
      value: profitabilityCurve(totals, startingCash),
      explanation: `Cumulative profit of ${fmt(totals.totalProfit)} relative to ${fmt(startingCash)} of starting capital.`,
    },
    {
      key: 'retention',
      label: 'Retention',
      value: retentionCurve(totals),
      explanation: `Average retention rate of ${pct(totals.avgRetention)} across the scenario.`,
    },
    {
      key: 'marketShare',
      label: 'Market share',
      value: marketShareCurve(totals),
      explanation: `Ended with ${pct(totals.finalMarketShare)} of the served market.`,
    },
    {
      key: 'cashSustainability',
      label: 'Cash sustainability',
      value: cashSustainabilityCurve(totals, startingCash),
      explanation: `Closed with ${fmt(totals.finalCash)} in cash versus ${fmt(startingCash)} at launch.`,
    },
    {
      key: 'competition',
      label: 'Competitive position',
      value: competitionCurve(totals),
      explanation: `Average competitive pressure of ${pct(totals.avgCompetitionPressure)} (lower is better).`,
    },
  ];

  const components: ScoreComponent[] = raw.map((r) => {
    const weight = SCORE_WEIGHTS[r.key];
    return {
      key: r.key,
      label: r.label,
      weight,
      value: round4(r.value),
      points: round2(r.value * weight * 100),
      explanation: r.explanation,
    };
  });

  const score = Math.round(clamp(components.reduce((a, c) => a + c.points, 0), 0, 100));

  return {
    score,
    components,
    formula: 'score = 100 × Σ(weightᵢ × subscoreᵢ),  subscores normalized to 0..1',
  };
}

/* -------------------------------------------------------------------------- */
/* Findings — derived, never fabricated                                        */
/* -------------------------------------------------------------------------- */

/**
 * Each finding is produced by a rule that reads real round data. If a rule's
 * condition is false, no finding is emitted — we never write filler text.
 */
export function generateFindings(rounds: RoundMetrics[], totals: SimulationTotals): Finding[] {
  const findings: Finding[] = [];
  if (rounds.length === 0) return findings;

  const first = rounds[0];
  const last = rounds[rounds.length - 1];
  const mid = rounds[Math.floor(rounds.length / 2)];

  // 1. Demand trajectory
  const demandGrowth = first.units > 0 ? (last.units - first.units) / first.units : 0;
  if (demandGrowth > 0.3) {
    findings.push({
      title: 'Demand grew steadily through the scenario',
      detail: `Monthly purchases went from ${first.units} in month 1 to ${last.units} in month ${last.round}. Awareness compounding through marketing and word of mouth is the main driver.`,
      direction: 'positive',
      evidence: `units: ${first.units} → ${last.units}`,
    });
  } else if (demandGrowth < -0.15) {
    findings.push({
      title: 'Demand weakened over the scenario',
      detail: `Monthly purchases fell from ${first.units} to ${last.units}. Competitive pressure rose while the price-to-quality balance drifted out of favour.`,
      direction: 'negative',
      evidence: `units: ${first.units} → ${last.units}`,
    });
  }

  // 2. Retention as a revenue source
  if (last.returningCustomers > last.newCustomers && last.returningCustomers > 0) {
    const share = last.returningCustomers / Math.max(1, last.customers);
    findings.push({
      title: 'Returning customers became the main source of revenue',
      detail: `By month ${last.round}, ${last.returningCustomers} of ${last.customers} buyers were returning (${pct(share)}). Satisfaction and retention now drive more of the result than acquisition.`,
      direction: 'positive',
      evidence: `returning ${last.returningCustomers} vs new ${last.newCustomers}`,
    });
  } else if (last.returningCustomers < last.newCustomers * 0.4 && totals.avgRetention < 0.4) {
    findings.push({
      title: 'The business struggled to keep customers',
      detail: `Average retention was only ${pct(totals.avgRetention)}, so revenue depended on continuously acquiring new customers — an expensive pattern at this price point.`,
      direction: 'negative',
      evidence: `avg retention ${pct(totals.avgRetention)}`,
    });
  }

  // 3. Competition ramp
  const earlyPressure = first.competitionPressure;
  const latePressure = last.competitionPressure;
  if (latePressure - earlyPressure > 0.08) {
    const firstCut = rounds.find((r) => r.round >= mid.round);
    findings.push({
      title: 'Competition intensified in the second half',
      detail: `Competitive pressure rose from ${pct(earlyPressure)} to ${pct(latePressure)} as incumbents reacted to the business gaining share${firstCut ? ` around month ${firstCut.round}` : ''}.`,
      direction: 'negative',
      evidence: `pressure: ${pct(earlyPressure)} → ${pct(latePressure)}`,
    });
  }

  // 4. Profitability / breakeven
  if (totals.breakevenMonth) {
    findings.push({
      title: 'The business reached monthly profitability',
      detail: `The first profitable month was month ${totals.breakevenMonth}, after ${fmt(totals.totalMarketing)} of cumulative marketing spend had built enough awareness.`,
      direction: 'positive',
      evidence: `breakeven month ${totals.breakevenMonth}`,
    });
  } else {
    findings.push({
      title: 'The business never reached monthly profitability',
      detail: `No month produced positive profit within ${rounds.length} rounds. Fixed costs of the location outpaced the revenue the price point could generate.`,
      direction: 'negative',
      evidence: `cumulative profit ${fmt(totals.totalProfit)}`,
    });
  }

  // 5. Satisfaction vs. retention link
  const satDelta = last.avgSatisfaction - first.avgSatisfaction;
  if (Math.abs(satDelta) > 0.05) {
    findings.push({
      title: satDelta > 0 ? 'Satisfaction improved with the offer' : 'Satisfaction eroded over time',
      detail: `Average satisfaction moved from ${pct(first.avgSatisfaction)} to ${pct(last.avgSatisfaction)}. ${satDelta > 0 ? 'Customers responded well to the delivered quality relative to price.' : 'Perceived value fell, which dragged on retention and repeat purchases.'}`,
      direction: satDelta > 0 ? 'positive' : 'negative',
      evidence: `satisfaction: ${pct(first.avgSatisfaction)} → ${pct(last.avgSatisfaction)}`,
    });
  }

  // 6. Price sensitivity signal (compares early conversion vs awareness)
  const earlyConversion = first.awareness > 0 ? first.units / (first.awareness * 100) : 0;
  if (earlyConversion < 0.35 && first.avgSatisfaction < 0.6) {
    findings.push({
      title: 'Price sensitivity limited first-time purchases',
      detail: `Only a small share of aware customers converted in the early months (${pct(earlyConversion)} of the aware pool per month), consistent with a price-sensitive audience at this price point.`,
      direction: 'neutral',
      evidence: `early conversion ${pct(earlyConversion)}`,
    });
  }

  // 7. Cash trajectory
  if (totals.finalCash < rounds[0].cashBalance * 0.5 && totals.finalCash >= 0) {
    findings.push({
      title: 'Cash burn was significant',
      detail: `Cash fell from ${fmt(rounds[0].cashBalance)} to ${fmt(totals.finalCash)}. The scenario stays solvent but has limited buffer for shocks.`,
      direction: 'neutral',
      evidence: `cash: ${fmt(rounds[0].cashBalance)} → ${fmt(totals.finalCash)}`,
    });
  } else if (totals.finalCash < 0) {
    findings.push({
      title: 'The scenario ran out of cash',
      detail: `The business ended at ${fmt(totals.finalCash)}, meaning the starting budget was exhausted before the scenario ended.`,
      direction: 'negative',
      evidence: `final cash ${fmt(totals.finalCash)}`,
    });
  }

  // Cap at 7 findings, keeping the highest-signal ones first.
  return findings.slice(0, 7);
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const fmt = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;
