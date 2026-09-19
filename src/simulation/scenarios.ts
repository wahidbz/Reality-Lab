/**
 * Scenario helpers: natural-language idea parsing (deterministic fallback for
 * the optional AI path), input builders, and the pre-built demo scenarios.
 */

import type { SimulationInput, SimulationRun } from '../types/simulation';
import { runSimulation, type RunProgress } from './engine';
import { detectAudienceKey, getCityProfile } from './world';
import { seedToNumber } from './random';

/* -------------------------------------------------------------------------- */
/* Natural-language scenario parsing (deterministic)                           */
/* -------------------------------------------------------------------------- */

export interface ParsedScenario {
  name?: string;
  price?: number;
  budget?: number;
  marketingBudget?: number;
  city?: string;
  country?: string;
  targetAudience?: string;
  audienceKey?: string;
  quality?: number;
  competitorCount?: number;
  durationMonths?: number;
  currency?: string;
  notes: string[];
}

const CITY_HINTS: [RegExp, string, string][] = [
  [/\bberlin\b|برلين/i, 'Berlin', 'Germany'],
  [/\bmunic?h(en)?\b/i, 'Munich', 'Germany'],
  [/\blondon\b/i, 'London', 'United Kingdom'],
  [/\bparis\b/i, 'Paris', 'France'],
  [/\bmadrid\b/i, 'Madrid', 'Spain'],
  [/\bamsterdam\b/i, 'Amsterdam', 'Netherlands'],
  [/\bnew york\b|\bnyc\b/i, 'New York', 'United States'],
  [/\bsan francisco\b|\bsf\b/i, 'San Francisco', 'United States'],
  [/\baustin\b/i, 'Austin', 'United States'],
  [/\btoronto\b/i, 'Toronto', 'Canada'],
  [/\bdubai\b|دبي/i, 'Dubai', 'United Arab Emirates'],
  [/\babu dhabi\b/i, 'Abu Dhabi', 'United Arab Emirates'],
  [/\briyadh\b|الرياض/i, 'Riyadh', 'Saudi Arabia'],
  [/\bcairo\b|القاهرة/i, 'Cairo', 'Egypt'],
  [/\balexandria\b|الإسكندرية/i, 'Alexandria', 'Egypt'],
  [/\bistanbul\b/i, 'Istanbul', 'Turkey'],
  [/\btokyo\b/i, 'Tokyo', 'Japan'],
  [/\bsingapore\b/i, 'Singapore', 'Singapore'],
  [/\bmumbai\b/i, 'Mumbai', 'India'],
  [/\bnairobi\b/i, 'Nairobi', 'Kenya'],
  [/\bsydney\b/i, 'Sydney', 'Australia'],
  [/\blisbon\b/i, 'Lisbon', 'Portugal'],
];

const CHEAP_HINTS = /\b(cheap|cheapest|low[- ]?cost|low[- ]?price|budget|affordable|discount|رخيص)\b/i;
const PREMIUM_HINTS = /\b(premium|luxury|high[- ]?end|upscale|exclusive|فاخر)\b/i;

/**
 * Deterministic parser for an idea sentence.
 * Used when no AI endpoint is configured — Reality Lab always works.
 */
export function parseIdea(text: string): ParsedScenario {
  const t = (text || '').trim();
  const notes: string[] = [];
  const out: ParsedScenario = { notes };

  // Location
  for (const [re, city, country] of CITY_HINTS) {
    const m = t.match(re);
    if (m) {
      out.city = city;
      out.country = country;
      notes.push(`Detected location: ${city}, ${country}.`);
      break;
    }
  }

  // Currency follows location heuristically
  const country = out.country ?? '';
  out.currency =
    /United States|Canada|Australia|Singapore/.test(country) ? 'USD'
    : /United Kingdom/.test(country) ? 'GBP'
    : /United Arab Emirates|Saudi/.test(country) ? 'AED'
    : /Egypt/.test(country) ? 'EGP'
    : /India/.test(country) ? 'INR'
    : /Japan/.test(country) ? 'JPY'
    : /Turkey/.test(country) ? 'TRY'
    : /Kenya/.test(country) ? 'KES'
    : 'EUR';

  // Audience
  const audienceKey = detectAudienceKey(t);
  out.audienceKey = audienceKey;
  out.targetAudience = AUDIENCE_LABELS[audienceKey] ?? 'General public';
  notes.push(`Inferred target audience: ${out.targetAudience}.`);

  // Pricing posture
  const cityProfile = getCityProfile(out.city ?? '', country);
  let base = 4.5 * cityProfile.priceIndex; // plausible small-ticket default
  if (CHEAP_HINTS.test(t)) {
    base *= 0.62;
    notes.push('Idea reads as low-cost positioning, so a lower price point was assumed.');
  } else if (PREMIUM_HINTS.test(t)) {
    base *= 1.9;
    notes.push('Idea reads as premium positioning, so a higher price point was assumed.');
  }
  out.price = Math.max(0.5, Math.round(base * 100) / 100);

  // Budget: ~14x monthly revenue at the assumed price, scaled by cost index
  out.budget = Math.round(out.price * 900 * cityProfile.costIndex);
  out.marketingBudget = Math.round(out.budget * 0.05);

  // Quality follows positioning
  out.quality = PREMIUM_HINTS.test(t) ? 0.78 : CHEAP_HINTS.test(t) ? 0.44 : 0.56;

  out.competitorCount = Math.max(3, Math.round(3 + cityProfile.competitionIntensity * 5));
  out.durationMonths = /\b(3|three) months?\b/i.test(t) ? 3 : /\b(6|six) months?\b/i.test(t) ? 6 : 12;

  // Name: first sentence-ish fragment
  const cleaned = t.replace(/^(i want to|i'd like to|i would like to|let's|lets|planning to|thinking about)\s*/i, '');
  const firstClause = cleaned.split(/[.,;!?]/)[0] || t;
  out.name = titleCase(firstClause.trim().slice(0, 60)) || 'Untitled simulation';

  notes.push(`Assumed price ${out.price}, budget ${out.budget}, ${out.durationMonths}-month horizon.`);
  return out;
}

const AUDIENCE_LABELS: Record<string, string> = {
  students: 'Students',
  families: 'Families',
  professionals: 'Professionals',
  tourists: 'Tourists',
  general: 'General public',
};

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();

/* -------------------------------------------------------------------------- */
/* Builders                                                                    */
/* -------------------------------------------------------------------------- */

export const AUDIENCE_OPTIONS = [
  { key: 'students', label: 'Students' },
  { key: 'families', label: 'Families' },
  { key: 'professionals', label: 'Professionals' },
  { key: 'tourists', label: 'Tourists' },
  { key: 'general', label: 'General public' },
];

export const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'AED', 'SAR', 'EGP', 'INR', 'TRY', 'JPY'];

export function emptyInput(): SimulationInput {
  return {
    name: '',
    description: '',
    type: 'business',
    country: 'Germany',
    city: 'Berlin',
    targetAudience: 'Students',
    audienceKey: 'students',
    currency: 'EUR',
    budget: 25000,
    price: 3.5,
    operatingCost: 3200,
    employees: 3,
    capacity: 600,
    durationMonths: 12,
    marketingBudget: 1200,
    initialCustomers: 25,
    competitorCount: 4,
    customerAcquisitionCost: 12,
    monthlyFixedCost: 3200,
    quality: 0.55,
    seed: undefined,
  };
}

/** Derives a full input from a parsed idea, keeping user overrides. */
export function inputFromIdea(idea: string, overrides: Partial<SimulationInput> = {}): SimulationInput {
  const parsed = parseIdea(idea);
  return {
    ...emptyInput(),
    name: parsed.name ?? 'Untitled simulation',
    description: idea,
    city: parsed.city ?? 'Berlin',
    country: parsed.country ?? 'Germany',
    currency: parsed.currency ?? 'EUR',
    targetAudience: parsed.targetAudience ?? 'General public',
    audienceKey: parsed.audienceKey ?? 'general',
    price: parsed.price ?? 3.5,
    budget: parsed.budget ?? 25000,
    marketingBudget: parsed.marketingBudget ?? 1200,
    quality: parsed.quality ?? 0.55,
    competitorCount: parsed.competitorCount ?? 4,
    durationMonths: parsed.durationMonths ?? 12,
    monthlyFixedCost: Math.round((parsed.budget ?? 25000) * 0.12),
    operatingCost: Math.round((parsed.budget ?? 25000) * 0.12),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Demo scenarios                                                              */
/* -------------------------------------------------------------------------- */

export interface DemoScenario {
  slug: string;
  name: string;
  description: string;
  input: SimulationInput;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    slug: 'student-coffee-shop-berlin',
    name: 'Student Coffee Shop — Berlin',
    description:
      'A low-cost coffee shop targeting university students in Berlin, with a modest budget and a low price point.',
    input: {
      name: 'Student Coffee Shop — Berlin',
      description:
        'I want to open a low-cost coffee shop for university students in Berlin, with a tight budget and low prices.',
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
    },
  },
  {
    slug: 'premium-coffee-shop-london',
    name: 'Premium Coffee Bar — London',
    description:
      'A premium coffee bar for professionals in central London, with a higher budget, higher prices and a quality-first offer.',
    input: {
      name: 'Premium Coffee Bar — London',
      description:
        'I want to open a premium coffee bar for professionals in London with a high-end offer and higher prices.',
      type: 'business',
      country: 'United Kingdom',
      city: 'London',
      targetAudience: 'Professionals',
      audienceKey: 'professionals',
      currency: 'GBP',
      budget: 85000,
      price: 5.8,
      operatingCost: 11000,
      monthlyFixedCost: 11000,
      employees: 7,
      capacity: 1400,
      durationMonths: 12,
      marketingBudget: 4200,
      initialCustomers: 45,
      competitorCount: 7,
      customerAcquisitionCost: 22,
      quality: 0.82,
      seed: 771900,
    },
  },
  {
    slug: 'family-bakery-cairo',
    name: 'Family Bakery — Cairo',
    description:
      'A small family bakery for local households in Cairo, price-led with a very low cost base and high price sensitivity.',
    input: {
      name: 'Family Bakery — Cairo',
      description:
        'I want to open an affordable bakery for families in Cairo with low prices and a small budget.',
      type: 'business',
      country: 'Egypt',
      city: 'Cairo',
      targetAudience: 'Families',
      audienceKey: 'families',
      currency: 'EGP',
      budget: 250000,
      price: 18,
      operatingCost: 40000,
      monthlyFixedCost: 40000,
      employees: 4,
      capacity: 900,
      durationMonths: 12,
      marketingBudget: 9000,
      initialCustomers: 30,
      competitorCount: 6,
      customerAcquisitionCost: 45,
      quality: 0.48,
      seed: 31415,
    },
  },
];

export function runDemo(
  slug: string,
  onProgress?: (progress: RunProgress) => void,
): SimulationRun | null {
  const demo = DEMO_SCENARIOS.find((d) => d.slug === slug);
  if (!demo) return null;
  return runSimulation(demo.input, seedToNumber(demo.input.seed ?? demo.slug), { onProgress });
}
