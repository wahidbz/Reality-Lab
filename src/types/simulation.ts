/**
 * Reality Lab — core domain types.
 *
 * Everything the simulation engine consumes and produces is typed here so the
 * engine stays independent from React, Supabase and the UI layer.
 */

export type SimulationStatus = 'draft' | 'running' | 'completed' | 'failed';

/** MVP 0.1 only simulates businesses. Other categories are "coming soon". */
export type SimulationType = 'business';

export type SimulationCategory = 'business' | 'marketing' | 'product' | 'career' | 'city';

export type CompetitorStrategy = 'premium' | 'low_price' | 'balanced' | 'aggressive_growth';

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

/** What the user fills in across the 5 creation steps. Advanced fields optional. */
export interface SimulationInput {
  name: string;
  description: string;
  type: SimulationType;
  country: string;
  city: string;
  /** Human readable audience (preset label or custom text). */
  targetAudience: string;
  /** Internal key used to derive agent attribute distributions. */
  audienceKey: string;
  currency: string;
  budget: number;
  price: number;
  /** Monthly operating cost entered by the user. */
  operatingCost: number;
  employees: number;
  /** Customers serviceable per month. */
  capacity: number;
  durationMonths: number;
  marketingBudget: number;
  initialCustomers: number;
  competitorCount: number;
  customerAcquisitionCost: number;
  monthlyFixedCost: number;
  /** Quality of the offering, 0..1. */
  quality: number;
  /** Deterministic seed. Same seed + same input => same result. */
  seed?: number | string;
}

/** Input after defaults have been resolved. All values present. */
export interface NormalizedInput extends Omit<SimulationInput, 'seed'> {
  seed: number;
}

/* -------------------------------------------------------------------------- */
/* Agents                                                                      */
/* -------------------------------------------------------------------------- */

export interface CustomerAgent {
  id: string;
  age: number;
  /** 0..1 normalized income level (0 = low, 1 = high). */
  incomeLevel: number;
  priceSensitivity: number;
  qualitySensitivity: number;
  brandLoyalty: number;
  riskTolerance: number;
  /** Base probability of buying in a given month when fully aware. */
  purchaseFrequency: number;
  awareness: number;
  satisfaction: number;
  retentionProbability: number;
  locationSegment: string;
  /* runtime state */
  purchasedLastRound: boolean;
  totalPurchases: number;
  totalSpend: number;
}

export interface CompetitorAgent {
  id: string;
  name: string;
  price: number;
  initialPrice: number;
  quality: number;
  marketingPower: number;
  customerBase: number;
  aggressiveness: number;
  marketShare: number;
  strategy: CompetitorStrategy;
  /* runtime state */
  actions: string[];
}

/* -------------------------------------------------------------------------- */
/* World                                                                       */
/* -------------------------------------------------------------------------- */

export interface MarketBaseline {
  locationTier: string;
  costIndex: number;
  competitionIntensity: number;
  avgPrice: number;
  avgQuality: number;
  avgMarketingPower: number;
}

export interface WorldState {
  id: string;
  seed: number;
  settings: NormalizedInput;
  location: { country: string; city: string; segment: string };
  business: {
    name: string;
    price: number;
    initialPrice: number;
    quality: number;
    capacity: number;
    unitCostRatio: number;
    monthlyFixedCost: number;
    marketingBudget: number;
    cash: number;
    startingCash: number;
    employees: number;
  };
  market: MarketBaseline;
  customers: CustomerAgent[];
  competitors: CompetitorAgent[];
  events: SimEvent[];
  currentRound: number;
  metrics?: RoundMetrics;
  /** Multipliers/injections produced by events, applied on the next round. */
  pendingEffects: PendingEffect[];
  flags: { viralUntilRound: number; costShockApplied: boolean };
}

export interface PendingEffect {
  source: string;
  awarenessBoost?: number;
  demandMultiplier?: number;
  costMultiplier?: number;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export type EventType =
  | 'business_launched'
  | 'competitor_enters'
  | 'competitor_price_cut'
  | 'competitor_marketing_push'
  | 'competitor_quality_upgrade'
  | 'demand_spike'
  | 'demand_decline'
  | 'marketing_success'
  | 'marketing_failure'
  | 'satisfaction_increase'
  | 'satisfaction_decline'
  | 'cost_increase'
  | 'viral_exposure'
  | 'cash_warning';

export interface SimEvent {
  id: string;
  type: EventType;
  month: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: { kind: string; value: number; label: string };
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                     */
/* -------------------------------------------------------------------------- */

export interface RoundMetrics {
  round: number;
  revenue: number;
  operatingCost: number;
  marketingCost: number;
  cogs: number;
  totalCost: number;
  profit: number;
  cumulativeProfit: number;
  cashBalance: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  retentionRate: number;
  marketShare: number;
  avgSatisfaction: number;
  awareness: number;
  /** Expected demand (sum of purchase probabilities) for the month. */
  demand: number;
  /** Realised purchases (units sold) for the month. */
  units: number;
  competitionPressure: number;
}

export interface AgentActivitySummary {
  purchases: number;
  newCustomers: number;
  returningCustomers: number;
  awareCustomers: number;
  satisfactionDelta: number;
  demandDelta: number;
  competitorActions: { competitor: string; action: string }[];
  notes: string[];
}

export interface RoundResult {
  round: number;
  label: string;
  metrics: RoundMetrics;
  activity: AgentActivitySummary;
  events: SimEvent[];
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export type ScoreKey =
  | 'demand'
  | 'profitability'
  | 'retention'
  | 'marketShare'
  | 'cashSustainability'
  | 'competition';

export interface ScoreComponent {
  key: ScoreKey;
  label: string;
  weight: number;
  /** 0..1 normalized sub-score. */
  value: number;
  points: number;
  explanation: string;
}

export interface Finding {
  title: string;
  detail: string;
  direction: 'positive' | 'negative' | 'neutral';
  evidence: string;
}

export interface SimulationTotals {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalMarketing: number;
  totalUnits: number;
  totalNewCustomers: number;
  totalReturningCustomers: number;
  avgMonthlyCustomers: number;
  peakCustomers: number;
  finalCash: number;
  finalMarketShare: number;
  avgRetention: number;
  avgSatisfaction: number;
  endingSatisfaction: number;
  avgCompetitionPressure: number;
  breakevenMonth: number | null;
}

export interface SimulationScoreResult {
  score: number;
  components: ScoreComponent[];
  formula: string;
}

export interface SimulationRun {
  seed: number;
  input: NormalizedInput;
  world: WorldState;
  rounds: RoundResult[];
  events: SimEvent[];
  totals: SimulationTotals;
  score: SimulationScoreResult;
  findings: Finding[];
  /** Per-customer end state (aggregated in the UI, never rendered 1-by-1). */
  customers: CustomerAgent[];
  competitors: CompetitorAgent[];
  explanation: string[];
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                 */
/* -------------------------------------------------------------------------- */

export interface SimulationRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  type: SimulationType;
  country: string;
  city: string;
  target_audience: string;
  currency: string;
  budget: number;
  price: number;
  duration_months: number;
  status: SimulationStatus;
  seed: number;
  is_public: boolean;
  parent_simulation_id: string | null;
  input_json: NormalizedInput;
  result_json: SimulationRun | null;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioVariant {
  id: string;
  parent_simulation_id: string;
  variant_simulation_id: string;
  changes_json: Record<string, { from: number | string; to: number | string }>;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface SimulationListItem {
  id: string;
  user_id: string;
  name: string;
  description: string;
  type: SimulationType;
  city: string;
  country: string;
  status: SimulationStatus;
  score: number | null;
  is_public: boolean;
  parent_simulation_id: string | null;
  created_at: string;
  updated_at: string;
}
