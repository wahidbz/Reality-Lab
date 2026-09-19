/**
 * Agent population + agent-level behaviour.
 *
 * Customer agents are generated once (seeded) and then *decide* every round.
 * Competitors are generated once and *react* to market conditions.
 * No agent ever flips a coin without a rule behind it — probabilities are always
 * derived from attributes, market state and the business configuration.
 */

import type {
  CompetitorAgent,
  CompetitorStrategy,
  CustomerAgent,
  WorldState,
} from '../types/simulation';
import { RNG, clamp } from './random';
import { AUDIENCE_PROFILES } from './world';

/* -------------------------------------------------------------------------- */
/* Customer generation                                                         */
/* -------------------------------------------------------------------------- */

export const DEFAULT_AGENT_COUNT = 100;

const COMPETITOR_NAME_POOL = [
  'Northside Roasters',
  'Kaffeewerk',
  'Urban Bean Co.',
  'The Daily Grind',
  'Café Meridian',
  'Blue Corner',
  'Studio Brew',
  'Central Cup',
  'Morning Line',
  'Analog Coffee',
  'Rooftop Roast',
  'Third Wave Lab',
];

/**
 * Builds the customer population for a world.
 * Awareness is pre-seeded for the user's `initialCustomers` so month 1 is not blank.
 */
export function generateCustomers(
  world: WorldState,
  rng: RNG,
  count = DEFAULT_AGENT_COUNT,
): CustomerAgent[] {
  const profile = AUDIENCE_PROFILES[world.settings.audienceKey] ?? AUDIENCE_PROFILES.general;
  const city = world.market;
  const customers: CustomerAgent[] = [];

  // Attribute jitter scales with how income-diverse the city is.
  const incomeSpread = 0.18 + (1 - city.competitionIntensity) * 0.12;

  for (let i = 0; i < count; i++) {
    const incomeLevel = clamp(
      rng.normal(profile.incomeLevel, incomeSpread),
      0.03,
      0.99,
    );
    // Higher income -> slightly less price sensitive; archetype sets the baseline.
    const priceSensitivity = clamp(
      rng.normal(profile.priceSensitivity - (incomeLevel - profile.incomeLevel) * 0.35, 0.09),
      0.05,
      0.99,
    );
    const qualitySensitivity = clamp(rng.normal(profile.qualitySensitivity, 0.1), 0.05, 0.99);
    const brandLoyalty = clamp(rng.normal(profile.brandLoyalty, 0.11), 0.02, 0.98);
    const riskTolerance = clamp(rng.normal(profile.riskTolerance, 0.12), 0.02, 0.98);
    const purchaseFrequency = clamp(rng.normal(profile.purchaseFrequency, 0.1), 0.05, 0.95);

    // Initial awareness: the first N (initialCustomers) start aware of the business.
    const isSeedCustomer = i < world.settings.initialCustomers;
    const awareness = isSeedCustomer
      ? clamp(rng.range(0.55, 0.92), 0, 1)
      : clamp(rng.range(0.02, 0.14) + city.competitionIntensity * 0.04, 0, 1);

    customers.push({
      id: `cust_${i + 1}`,
      age: rng.int(profile.ageRange[0], profile.ageRange[1]),
      incomeLevel: round3(incomeLevel),
      priceSensitivity: round3(priceSensitivity),
      qualitySensitivity: round3(qualitySensitivity),
      brandLoyalty: round3(brandLoyalty),
      riskTolerance: round3(riskTolerance),
      purchaseFrequency: round3(purchaseFrequency),
      awareness: round3(awareness),
      satisfaction: round3(isSeedCustomer ? rng.range(0.5, 0.7) : 0.5),
      retentionProbability: 0.5,
      locationSegment: profile.segment,
      purchasedLastRound: false,
      totalPurchases: 0,
      totalSpend: 0,
    });
  }
  return customers;
}

/* -------------------------------------------------------------------------- */
/* Competitor generation                                                       */
/* -------------------------------------------------------------------------- */

const STRATEGIES: CompetitorStrategy[] = ['premium', 'low_price', 'balanced', 'aggressive_growth'];

/**
 * Competitors are distributed across strategies so the market has texture:
 * a premium player, discounters and growth-hungry aggressors.
 */
export function generateCompetitors(world: WorldState, rng: RNG): CompetitorAgent[] {
  const n = world.settings.competitorCount;
  const names = rng.seed === 0 ? [] : shuffle(COMPETITOR_NAME_POOL.slice(), rng);
  const competitors: CompetitorAgent[] = [];

  for (let i = 0; i < n; i++) {
    const strategy: CompetitorStrategy =
      i < 4 ? STRATEGIES[i] : rng.weighted(STRATEGIES, [0.25, 0.3, 0.3, 0.15]);

    const priceBias =
      strategy === 'low_price'
        ? rng.range(0.68, 0.86)
        : strategy === 'premium'
          ? rng.range(1.12, 1.4)
          : strategy === 'aggressive_growth'
            ? rng.range(0.88, 1.02)
            : rng.range(0.94, 1.1);

    const qualityBias =
      strategy === 'premium'
        ? rng.range(0.62, 0.85)
        : strategy === 'low_price'
          ? rng.range(0.22, 0.42)
          : rng.range(0.4, 0.65);

    const marketingBias =
      strategy === 'aggressive_growth'
        ? rng.range(0.6, 0.92)
        : strategy === 'low_price'
          ? rng.range(0.25, 0.5)
          : rng.range(0.35, 0.7);

    const aggressiveness =
      strategy === 'aggressive_growth'
        ? rng.range(0.7, 0.95)
        : strategy === 'premium'
          ? rng.range(0.25, 0.5)
          : rng.range(0.35, 0.65);

    const price = round2Safe(world.market.avgPrice * priceBias);

    competitors.push({
      id: `comp_${i + 1}`,
      name: names[i % names.length] ?? `Competitor ${String.fromCharCode(65 + i)}`,
      price,
      initialPrice: price,
      quality: round3(clamp(qualityBias, 0.1, 0.95)),
      marketingPower: round3(clamp(marketingBias, 0.1, 0.95)),
      customerBase: Math.max(10, Math.round(rng.range(60, 240) * (0.6 + world.market.competitionIntensity))),
      aggressiveness: round3(clamp(aggressiveness, 0.05, 0.98)),
      marketShare: 0,
      strategy,
      actions: [],
    });
  }
  return competitors;
}

/* -------------------------------------------------------------------------- */
/* Customer behaviour                                                          */
/* -------------------------------------------------------------------------- */

export interface PurchaseContext {
  price: number;
  quality: number;
  marketAvgPrice: number;
  marketAvgQuality: number;
  competitionPressure: number;
  /** Multiplier injected by events (viral exposure, demand spikes...). */
  demandMultiplier: number;
}

/**
 * Probability that a customer buys this month.
 *
 *   p = purchaseFrequency * awarenessGate * priceFactor * qualityFactor * competitionFactor
 *
 * Every factor is a documented function of agent attributes and market state:
 *  - awarenessGate: you cannot buy what you don't know about.
 *  - priceFactor:   falls as the business is priced above the market average,
 *                   weighted by the agent's price sensitivity.
 *  - qualityFactor: rises with quality relative to the market, weighted by the
 *                   agent's quality sensitivity.
 *  - competitionFactor: competitive pressure cannibalises demand.
 */
export function purchaseProbability(customer: CustomerAgent, ctx: PurchaseContext): number {
  const priceGap = (ctx.price - ctx.marketAvgPrice) / Math.max(0.01, ctx.marketAvgPrice);

  const awarenessGate = 0.34 + 0.66 * customer.awareness;

  // 1.0 when priced at market. Sensitive agents lose demand fast when priced above.
  const priceFactor = clamp(1 - customer.priceSensitivity * priceGap * 1.55, 0.05, 1.5);

  const qualityFactor = clamp(
    1 + customer.qualitySensitivity * (ctx.quality - ctx.marketAvgQuality) * 1.45,
    0.3,
    1.8,
  );

  const competitionFactor = clamp(1 - ctx.competitionPressure * 0.42, 0.35, 1);

  // Loyal customers are less likely to defect even under competitive pressure.
  const loyaltyBuffer = 1 + customer.brandLoyalty * 0.2;

  // A customer who was satisfied last month may return even if not yet "aware" in a paid sense.
  const repeatBoost = customer.purchasedLastRound
    ? 1 + 0.5 * customer.retentionProbability
    : 1;

  const p =
    customer.purchaseFrequency *
    awarenessGate *
    priceFactor *
    qualityFactor *
    competitionFactor *
    loyaltyBuffer *
    repeatBoost *
    ctx.demandMultiplier;

  return clamp(p, 0, 0.97);
}

/** Probability the customer comes back next month, given satisfaction. */
export function retentionProbability(customer: CustomerAgent): number {
  return clamp(0.28 + 0.5 * customer.satisfaction + 0.3 * customer.brandLoyalty, 0.05, 0.97);
}

/**
 * Satisfaction is an exponential moving average towards perceived value:
 * value = quality (delivered) minus a penalty when the price felt too high.
 */
export function updateSatisfaction(
  customer: CustomerAgent,
  purchased: boolean,
  quality: number,
  price: number,
  marketAvgPrice: number,
): number {
  const priceGap = (price - marketAvgPrice) / Math.max(0.01, marketAvgPrice);
  const perceivedValue = clamp(
    quality * 0.78 + (1 - clamp(priceGap, 0, 1)) * 0.22,
    0,
    1,
  );

  if (purchased) {
    // Move towards perceived value, faster for quality-sensitive customers.
    const speed = 0.3 + customer.qualitySensitivity * 0.35;
    return clamp(customer.satisfaction + speed * (perceivedValue - customer.satisfaction), 0, 1);
  }
  // Not buying this month -> gentle decay (people forget / habits fade).
  return clamp(customer.satisfaction - 0.015, 0, 1);
}

/* -------------------------------------------------------------------------- */
/* Competitor behaviour                                                        */
/* -------------------------------------------------------------------------- */

export interface CompetitorReaction {
  competitorId: string;
  action: string;
  eventType:
    | 'competitor_price_cut'
    | 'competitor_marketing_push'
    | 'competitor_quality_upgrade';
  impactValue: number;
}

/**
 * Competitors react when the business takes meaningful share.
 * Reaction probability grows with the competitor's aggressiveness; the *kind*
 * of reaction is a function of its declared strategy — never random.
 */
export function competitorReact(
  competitor: CompetitorAgent,
  ourMarketShare: number,
  rng: RNG,
): CompetitorReaction | null {
  if (ourMarketShare < 0.1) return null;

  const pressure = clamp((ourMarketShare - 0.1) / 0.25, 0, 1);
  const chance = clamp(0.12 + competitor.aggressiveness * 0.55 * (0.5 + pressure), 0, 0.85);
  if (!rng.chance(chance)) return null;

  switch (competitor.strategy) {
    case 'low_price':
    case 'aggressive_growth': {
      const cut = rng.range(0.05, 0.13);
      const floor = competitor.initialPrice * 0.62;
      const newPrice = Math.max(floor, competitor.price * (1 - cut));
      const actual = newPrice < competitor.price ? (competitor.price - newPrice) / competitor.price : 0;
      if (actual <= 0.005) return null;
      competitor.price = round2Safe(newPrice);
      competitor.customerBase *= 1.03;
      return {
        competitorId: competitor.id,
        action: `reduced prices by ${Math.round(actual * 100)}%`,
        eventType: 'competitor_price_cut',
        impactValue: round3(actual),
      };
    }
    case 'premium': {
      competitor.quality = round3(clamp(competitor.quality + rng.range(0.03, 0.08), 0, 0.98));
      competitor.price = round2Safe(competitor.price * rng.range(1.0, 1.03));
      return {
        competitorId: competitor.id,
        action: 'upgraded its offer and quality positioning',
        eventType: 'competitor_quality_upgrade',
        impactValue: 0.05,
      };
    }
    default: {
      competitor.marketingPower = round3(clamp(competitor.marketingPower + rng.range(0.04, 0.1), 0, 0.98));
      competitor.customerBase *= 1.02;
      return {
        competitorId: competitor.id,
        action: 'increased marketing spend',
        eventType: 'competitor_marketing_push',
        impactValue: 0.06,
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate market state                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Competition pressure: a 0..1 index combining competitors' marketing strength,
 * their delivered quality and their price advantage over us.
 */
export function computeCompetitionPressure(world: WorldState): number {
  if (world.competitors.length === 0) return 0.08;
  const avgMarketing =
    world.competitors.reduce((a, c) => a + c.marketingPower, 0) / world.competitors.length;
  const avgQuality =
    world.competitors.reduce((a, c) => a + c.quality, 0) / world.competitors.length;
  const avgPrice =
    world.competitors.reduce((a, c) => a + c.price, 0) / world.competitors.length;
  const priceAdvantage = clamp((avgPrice - world.business.price) / Math.max(0.01, avgPrice) + 0.5, 0, 1);

  /**
   * Crowding: how saturated the market is. A monopolist (1 competitor) barely
   * constrains you; a crowded market (10+) does. Normalised so 1 competitor
   * contributes ~0 and 12 competitors saturates at 1 — this is what makes
   * competition pressure rise with the number of competitors.
   */
  const crowding = clamp((world.competitors.length - 1) / 8, 0, 1);

  return round3(
    clamp(
      0.32 * avgMarketing + 0.24 * avgQuality + 0.22 * priceAdvantage + 0.22 * crowding,
      0.02,
      1,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function shuffle<T>(arr: T[], rng: RNG): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const round2Safe = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
