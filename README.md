# Reality Lab — MVP 0.1

**Test your ideas before reality does.**

Reality Lab is a simulation platform for business ideas. You describe an idea, configure a scenario,
and a deterministic engine populates a world with AI-inspired agents — customers and competitors — that
make decisions every round against explicit rules. The output is a timeline, a metric series, a
transparent score and the What-If variants you build from it.

> **Results are scenario-based simulations, not predictions or guarantees of real-world outcomes.**

---

## Table of contents

1. [What is actually built](#1-what-is-actually-built)
2. [Quick start (zero configuration)](#2-quick-start-zero-configuration)
3. [Folder structure](#3-folder-structure)
4. [The simulation engine](#4-the-simulation-engine)
5. [The Simulation Score](#5-the-simulation-score)
6. [Data model & Row Level Security](#6-data-model--row-level-security)
7. [Authentication setup (Google + email magic link)](#7-authentication-setup-google--email-magic-link)
8. [Environment variables](#8-environment-variables)
9. [Testing](#9-testing)
10. [Deployment (Vercel / Netlify)](#10-deployment-vercel--netlify)
11. [AI integration (optional)](#11-ai-integration-optional)
12. [Demo simulation](#12-demo-simulation)
13. [Accessibility, i18n, mobile](#13-accessibility-i18n-mobile)
14. [What is deliberately NOT in MVP 0.1](#14-what-is-deliberately-not-in-mvp-01)
15. [Roadmap](#15-roadmap)

---

## 1. What is actually built

The core product loop is fully functional end to end:

```
Idea → Scenario → Agents → Rules → Events → Simulation Rounds → Results → What-If Variant → Comparison
```

| Capability | Status |
| --- | --- |
| Landing page with a **live** demo simulation | ✅ runs the real engine in the browser |
| Auth (Google OAuth + email magic link / OTP) | ✅ Supabase; local demo account when unconfigured |
| Dashboard (Draft / Running / Completed / Failed, open / duplicate / delete) | ✅ |
| 5-step create flow (Idea → Market → Variables → Advanced → Review) | ✅ |
| Deterministic simulation engine (seeded) | ✅ never calls `Math.random()` |
| 100 customer agents + competitor agents with strategies | ✅ |
| Monthly rounds with the full 12-step pipeline | ✅ |
| Condition-based event system with impacts | ✅ |
| Per-round metrics, timeline, aggregated agent activity | ✅ |
| Simulation Score with a transparent weighted formula | ✅ |
| Findings generated from real round data | ✅ 3–7 rules, no filler |
| Explainability notes derived from the metric series | ✅ |
| What-If variants + side-by-side comparison | ✅ same seed, changed variables only |
| Explore page (built-in demos + public simulations) | ✅ |
| Profile page | ✅ |
| Supabase schema with UUIDs, indexes and RLS | ✅ `supabase/schema.sql` |
| Engine unit tests | ✅ `src/simulation/__tests__/` |
| Error handling, staged loading states, 404 | ✅ |

**No numbers are hard-coded.** Every figure shown in the UI comes out of
`runSimulation()` at request time (or from the stored `result_json` produced by that same function).

---

## 2. Quick start (zero configuration)

Requires **Node 18+**.

```bash
cd reality-lab
npm install
npm run dev
# → http://localhost:5173
```

That is genuinely all that is needed. With no `.env` file:

- the app runs in **local mode** — simulations are stored in the browser's `localStorage`;
- **“Continue as demo user”** on `/login` gives you a working account instantly;
- the landing page and `/explore` run the built-in demos through the real engine;
- the create → run → results → What-If → comparison loop works exactly as in cloud mode.

Add Supabase (section 7) to switch to Google sign-in and cloud storage — no code changes required.

---

## 3. Folder structure

```
reality-lab/
├── index.html                  # Vite entry, fonts, meta, favicon
├── package.json
├── vite.config.ts              # Vite + Vitest config
├── tsconfig.json               # strict TypeScript
├── tailwind.config.js          # brand tokens (ink / electric / cyan)
├── postcss.config.js
├── vercel.json / netlify.toml  # SPA rewrites for the two target hosts
├── .env.example
├── README.md
│
├── public/
│   └── favicon.svg             # the RL orbit mark (pure SVG)
│
├── supabase/
│   ├── schema.sql              # tables, indexes, triggers, RLS policies
│   └── seed.sql                # optional test data + QA queries
│
└── src/
    ├── main.tsx                # React root + router
    ├── App.tsx                 # routes, providers, footer disclaimer
    │
    ├── components/
    │   ├── Navbar.tsx          # top nav + mobile bottom nav + Logo
    │   ├── SimulationCard.tsx
    │   ├── MetricCard.tsx
    │   ├── Timeline.tsx
    │   ├── AgentActivity.tsx   # aggregated agents (never 1-per-agent)
    │   ├── Charts.tsx          # recharts wrappers (line/area/bar/radar)
    │   ├── RunProgress.tsx     # staged loading overlay
    │   ├── ConfigNotice.tsx    # local-mode explanation
    │   └── ErrorBoundary.tsx
    │
    ├── pages/
    │   ├── Home.tsx            # hero, how it works, live demo, why, CTA
    │   ├── Login.tsx
    │   ├── Dashboard.tsx
    │   ├── CreateSimulation.tsx
    │   ├── Simulation.tsx      # /simulation/:id and /simulation/demo/:slug
    │   ├── Results.tsx         # score, findings, What-If builder
    │   ├── Comparison.tsx      # /compare/:originalId/:variantId
    │   ├── Explore.tsx
    │   ├── Profile.tsx
    │   └── NotFound.tsx
    │
    ├── simulation/             # ⬅ the product. no React, no network.
    │   ├── random.ts           # mulberry32 PRNG + hashing (determinism)
    │   ├── world.ts            # world model, city/audience profiles, input normalisation
    │   ├── agent.ts            # agent generation + customer/competitor behaviour
    │   ├── rules.ts            # awareness, demand, costs, market share
    │   ├── events.ts           # condition-based event rules
    │   ├── metrics.ts          # totals, Simulation Score, findings
    │   ├── engine.ts           # runSimulation() — the round pipeline
    │   ├── scenarios.ts        # idea parsing + demo scenarios
    │   └── __tests__/
    │       ├── engine.test.ts
    │       └── scenarios.test.ts
    │
    ├── lib/
    │   ├── supabase.ts         # optional client (null when unconfigured)
    │   ├── store.ts            # SimulationRepository: cloud + local implementations
    │   ├── auth.ts             # auth actions + types
    │   ├── AuthProvider.tsx    # session context with local fallback
    │   ├── ai.ts               # OPTIONAL AI helpers with deterministic fallback
    │   ├── useSimulationRunner.ts  # staged progress around a real engine run
    │   ├── format.ts
    │   └── i18n.ts
    │
    ├── types/
    │   └── simulation.ts       # every domain type
    │
    └── styles/
        └── index.css           # Tailwind layers + global tokens
```

---

## 4. The simulation engine

Location: `src/simulation/`. It is a **pure TypeScript library** — no React, no `fetch`, no DOM.
That is deliberate: it can move to a Web Worker or to a Supabase Edge Function without touching a line
of the algorithm.

### 4.1 Determinism

`runSimulation(input, seed?)` is a pure function:

```
same input + same seed  ⇒  identical SimulationRun
```

There is **no `Math.random()` anywhere in the engine** (a test asserts this). All randomness comes from
`RNG` in `random.ts` — a mulberry32 generator seeded from the simulation seed:

- a string seed is folded to a 32-bit integer with FNV-1a (`hashString`);
- the engine keeps one **master** stream and derives **per-round** streams
  (`master.fork('round_7')`) so that adding a rule in month 7 cannot shift the random draws made in
  month 2. Results stay stable as the engine evolves.

### 4.2 The world

`createWorld()` builds a `WorldState`:

```
WorldState {
  seed, settings,
  location   { country, city, segment },
  business   { price, quality, capacity, unitCostRatio, monthlyFixedCost, marketingBudget, cash, … },
  market     { locationTier, costIndex, competitionIntensity, avgPrice, avgQuality, avgMarketingPower },
  customers  CustomerAgent[],
  competitors CompetitorAgent[],
  events     SimEvent[],
  currentRound, metrics, pendingEffects, flags
}
```

Location matters because each city carries a profile (`CITY_DATA` in `world.ts`): a **cost index**, a
**competition intensity** and a **price index**. Berlin, Cairo and London therefore price the same idea
very differently. Unknown cities fall back to a country heuristic, so the app never fails on an
unrecognised location.

### 4.3 Customer agents (100 by default)

Generated from an **audience archetype** (students, families, professionals, tourists, general) and then
jittered with the seeded normal distribution:

| Field | Meaning |
| --- | --- |
| `age` | drawn from the archetype's age range |
| `incomeLevel` | 0–1, and it *shifts* price sensitivity |
| `priceSensitivity` | how fast demand falls as price rises above market |
| `qualitySensitivity` | how much delivered quality moves satisfaction |
| `brandLoyalty` | dampens defection under competitive pressure |
| `riskTolerance` | willingness to try an unknown business |
| `purchaseFrequency` | base monthly buy probability once aware |
| `awareness` | 0–1, gates every purchase |
| `satisfaction` | 0–1, drives retention |
| `retentionProbability` | derived from satisfaction + loyalty |
| `locationSegment` | segment label used by the aggregation UI |

### 4.4 Customer behaviour (rules, not vibes)

Each month, every agent's purchase probability is a documented product of factors:

```
p = purchaseFrequency
  × awarenessGate        // 0.34 + 0.66·awareness  — you can't buy what you don't know
  × priceFactor          // 1 − priceSensitivity·priceGap·1.55, clamped
  × qualityFactor        // 1 + qualitySensitivity·(quality − marketQuality)·1.45
  × competitionFactor    // 1 − competitionPressure·0.42
  × loyaltyBuffer        // 1 + brandLoyalty·0.2
  × repeatBoost          // returning buyers are more likely to return
  × demandMultiplier     // injected by events (viral, spikes)
```

So *price-sensitive students in a cheap market behave differently from professionals in an expensive
one* — as a consequence of the maths, not a script.

### 4.5 Competitor agents

Competitors are generated across four strategies — `premium`, `low_price`, `balanced`,
`aggressive_growth` — with price, quality, marketing power, customer base and aggressiveness derived
from their strategy. They **react rather than randomise**:

```
if ourMarketShare < 0.10            → no reaction at all
chance = 0.12 + aggressiveness·0.55·(0.5 + pressure)
kind   = f(strategy):
   low_price / aggressive_growth → cut price 5–13% (floored at 62% of their opening price)
   premium                       → raise quality 3–8%
   balanced                      → increase marketing power
```

### 4.6 The round pipeline

For a 12-month scenario, `runSimulation` executes 12 monthly rounds. Each round performs, **in this
order**:

1. apply pending event effects from last month
2. update awareness (`computeAwarenessGain`: paid reach + word of mouth + viral boost)
3. compute competition pressure and per-agent purchase probabilities → expected demand
4. resolve purchases; **cap by capacity** (scaling new/returning proportionally)
5. let competitors react to the business' share
6. revenue → costs (COGS + fixed opex + marketing) → profit → cumulative profit → cash
7. update each agent's satisfaction (EMA towards perceived value) and retention
8. evaluate event rules; queue their impacts for next month
9. record the round's metrics
10. fade awareness slightly, so marketing has to keep working

### 4.7 Events

Every event comes from a rule inspected against state plus a controlled probability
(`events.ts`):

| Event | Condition |
| --- | --- |
| `business_launched` | month 1 (deterministic) |
| `marketing_success` | awareness crosses 50% in months 2–4 |
| `demand_spike` | MoM demand growth > 18%, then 45% chance → next-month ×1.08–1.20 |
| `demand_decline` | MoM demand < −15%, then 50% chance → next-month ×0.82–0.94 |
| `marketing_failure` | budget spent but awareness < 35% |
| `satisfaction_increase` / `_decline` | satisfaction moved more than ±0.03 |
| `viral_exposure` | satisfaction > 0.68, 8% chance → +0.12 awareness |
| `cost_increase` | month ≥ 4, 12% chance, **at most once per run** |
| `cash_warning` | cash negative and profit negative |
| `competitor_enters` | share > 14% before the final month |
| `competitor_price_cut` / `_marketing_push` / `_quality_upgrade` | competitor reactions above |

Impacts are not decorative — they are `PendingEffect`s consumed at the start of the following round.

### 4.8 Metrics per round

`revenue · operatingCost · marketingCost · cogs · totalCost · profit · cumulativeProfit · cashBalance ·
customers · newCustomers · returningCustomers · retentionRate · marketShare · avgSatisfaction ·
awareness · demand · units · competitionPressure`

### 4.9 Findings & explainability

`generateFindings()` runs seven rules against the metric series. A rule that does not fire produces
**no text** — there is no filler. Each finding carries an `evidence` string quoting the numbers it came
from (e.g. `units: 34 → 118`).

`buildExplanation()` produces the causal notes, e.g. *“Demand rose with awareness: awareness grew from
18% to 61% by month 6, and monthly purchases followed from 22 to 91.”* — read off the actual series.

---

## 5. The Simulation Score

A weighted sum of six **normalized** (0–1) sub-scores, scaled to 0–100:

```
score = 100 × Σ (weightᵢ × subscoreᵢ)

demand              0.20   avg monthly buyers / (0.55 × agent pool)
profitability       0.24   cumulative profit / starting cash  →  0.5× ⇒ 1.0
retention           0.20   (avgRetention − 0.25) / 0.6
marketShare         0.14   finalMarketShare / 0.35
cashSustainability  0.16   (finalCash/startingCash + 0.5) / 2
competition         0.06   1 − avgCompetitionPressure
```

`computeScore()` returns the full breakdown — weight, normalized value, points contributed and a
plain-English explanation for each component — which the Results page renders as bars plus a radar
chart. It is presented as **“Simulation Score”**, explicitly *not* a prediction.

---

## 6. Data model & Row Level Security

Eight tables: `profiles`, `simulations`, `simulation_agents`, `simulation_rounds`,
`simulation_events`, `simulation_results`, `scenario_variants` (and the `auth.users` rows they
reference). Full DDL — with UUID primary keys, foreign keys, `check` constraints and indexes on
`user_id`, `status`, `is_public`, `parent_simulation_id` and `(simulation_id, round_number)` — is in
[`supabase/schema.sql`](supabase/schema.sql).

**RLS is enabled on every table.** The policy shape:

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | `auth.uid() = user_id` | owner only |
| `simulations` | `auth.uid() = user_id OR is_public = true` | owner only (insert/update/delete) |
| `simulation_agents` / `_rounds` / `_events` / `_results` | parent simulation visible | parent owner only |
| `scenario_variants` | parent simulation visible | parent owner only |

A trigger (`handle_new_user`) creates the `profiles` row automatically on sign-up, and
`touch_updated_at` triggers keep `updated_at` honest.

Private data is never exposed: a non-owner can only ever read rows where the parent simulation is
explicitly `is_public = true`.

---

## 7. Authentication setup (Google + email magic link)

1. **Create the project** at [supabase.com](https://supabase.com) → copy the Project URL and anon key.
2. **Run the schema**: Supabase Dashboard → SQL Editor → paste `supabase/schema.sql` → Run.
3. **Enable email** (works out of the box): Authentication → Providers → Email → make sure
   “Enable Email provider” and “Enable Email OTP / Magic Link” are on. No phone number, no password.
4. **Enable Google OAuth**:
   - Google Cloud Console → APIs & Services → **Credentials** → *Create OAuth client ID* → **Web application**.
   - Authorised JavaScript origins: `http://localhost:5173` and `https://<your-domain>`.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Copy the Client ID and Client Secret into Supabase → Authentication → Providers → **Google** → Enable.
5. **Set the Site URL / redirects**: Authentication → URL Configuration → Site URL
   `http://localhost:5173` (and your production URL) and add both to **Redirect URLs**:
   `http://localhost:5173/dashboard`, `https://<your-domain>/dashboard`.
6. **Add the env vars** to `.env` (see below) and restart `npm run dev`.

`/login` never crashes when this is incomplete — it renders a clear “Running in local mode” note and
offers the demo account instead.

---

## 8. Environment variables

Copy `.env.example` to `.env`:

```bash
VITE_SUPABASE_URL=            # Supabase → Project Settings → API → Project URL
VITE_SUPABASE_ANON_KEY=       # Supabase → Project Settings → API → anon public key

AI_API_KEY=                   # optional, server-side only — never used for numbers
VITE_AI_ENDPOINT=             # optional endpoint used for the soft AI helpers

VITE_SITE_URL=http://localhost:5173   # used for auth redirects
```

Rules:

- **Every variable is optional.** Without Supabase the app runs in local mode; without an AI endpoint
  the deterministic engine and parser handle everything.
- **No secret is ever hard-coded.** `VITE_*` values are exposed to the browser by design (the Supabase
  anon key is a *public* key, and RLS is what protects the data). `AI_API_KEY` must have **no** `VITE_`
  prefix and must be used only from a server route.
- `isSupabaseConfigured` in `src/lib/supabase.ts` is the single switch between cloud and local mode.

---

## 9. Testing

```bash
npm test          # vitest run  — engine + scenario suites
npm run typecheck # tsc --noEmit
npm run build     # typecheck + production bundle
```

The suite tests the **simulation logic**, not the UI:

| # | Requirement | Test |
| --- | --- | --- |
| 1 | Same seed ⇒ same result | `determinism › produces an identical result for the same seed` |
| 2 | Different seed ⇒ different result | `determinism › produces a different result for a different seed` |
| 3 | No `Math.random()` in the engine | `determinism › does not use Math.random inside the engine` |
| 4 | No shared mutable state | `determinism › is unaffected by execution order` |
| 5 | Higher price suppresses demand | `price sensitivity › sells fewer units when the price is raised` |
| 6 | Purchase probability falls with price gap | `price sensitivity › purchase probability falls as price rises` |
| 7 | Price-insensitive agents barely react | `price sensitivity › price-insensitive customers…` |
| 8 | Awareness → demand | `awareness › more marketing spend raises awareness and demand` |
| 9 | Awareness gates purchase | `awareness › awareness is a gate on purchase probability` |
| 10 | Competition → market share | `competition › more competitors reduce the business market share` |
| 11 | Competition pressure rises | `competition › competition pressure rises with the number of competitors` |
| 12 | Revenue math | `unit economics › revenue = units x price` |
| 13 | Cost math | `unit economics › costs = cogs + fixed opex + marketing` |
| 14 | Profit = revenue − cost, cash accumulates | `unit economics › profit = revenue − total cost…` |
| 15 | Event impacts multiply costs | `unit economics › applies the cost multiplier from shock events` |
| 16 | Variant ≠ original | `what-if variants › a variant with changed variables differs` |
| 17 | Original untouched by a variant | `what-if variants › keeps the original untouched` |
| 18 | Score in range and self-consistent | `score and findings › score stays inside 0..100…` |
| 19 | Weights sum to 1 | `score and findings › weights sum to 1` |
| 20 | Findings are evidence-backed | `score and findings › every finding references real evidence` |
| 21 | Viable idea beats a bad one | `score and findings › a more expensive, weaker offer scores below` |
| 22 | Event rules fire correctly | `event rules › …` (launch, cost-shock once, cash warning, no entry in final month) |
| 23 | Idea parsing (incl. Arabic) | `idea parsing › …` |
| 24 | Demos run through the engine | `demo scenarios › runs the demo through the real engine` |

---

## 10. Deployment (Vercel / Netlify)

### Vercel

```bash
npm i -g vercel
vercel            # build command: npm run build, output: dist
```

- Framework preset: **Vite** (auto-detected). `vercel.json` adds the SPA rewrite.
- Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` in Project → Settings → Environment Variables.
- Add `https://<your-app>.vercel.app/dashboard` to Supabase → Authentication → URL Configuration → Redirect URLs.

### Netlify

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

- `netlify.toml` sets `npm run build`, publishes `dist`, and adds the SPA redirect.
- Set the same environment variables in Site settings → Environment variables.

### Any static host

`npm run build` produces a fully static `dist/`. Serve it and rewrite all unknown paths to
`/index.html` (the routing is client-side).

---

## 11. AI integration (optional)

`src/lib/ai.ts` is the **only** place AI is used, and it is strictly optional:

| Task | AI path | Deterministic fallback |
| --- | --- | --- |
| Idea text → scenario variables | `interpretIdea()` refines *variables* | `parseIdea()` extracts city, country, currency, audience, price posture, budget, quality, competitors, duration; notes explain every assumption |
| Result narrative | `narrativeSummary()` may add a paragraph | `run.explanation` is always produced from the metric series |

Hard rule: **an LLM never produces a simulation number.** The AI path may only emit *inputs* (price,
budget, quality, counts), each of which is validated and clamped before it reaches the engine. Results
are always computed by `runSimulation()`.

`AI_API_KEY` must live server-side; wire `VITE_AI_ENDPOINT` to your own function that proxies the
provider. If the endpoint is absent or errors, every call degrades silently to the deterministic path.

---

## 12. Demo simulation

Three demos ship in `src/simulation/scenarios.ts`, all executed by the real engine:

| Slug | Scenario |
| --- | --- |
| `student-coffee-shop-berlin` | Low-cost coffee shop, students, Berlin, 22k budget, €2.90 |
| `premium-coffee-shop-london` | Premium coffee bar, professionals, London, £85k, £5.80 |
| `family-bakery-cairo` | Affordable bakery, families, Cairo, EGP 250k, EGP 18 |

They are reachable without login at `/simulation/demo/<slug>` and listed on `/explore`. The landing page
renders the Berlin demo **live** in the browser — the hero stats (agents, rounds, events, score) are read
from that run, not from stored JSON.

Each demo has a fixed seed, so the numbers are stable and reproducible — useful for screenshots and QA.

---

## 13. Accessibility, i18n, mobile

- **Semantic HTML** (`header`, `nav`, `main`, `section`, `ol`/`li`, `dl`, `table` with `caption`), a
  “Skip to content” link, and `aria-current` / `aria-pressed` / `aria-selected` on stateful controls.
- **Keyboard**: visible focus rings on every interactive element; the stepper and month scrubber are
  real buttons; dialogs trap attention and are dismissible.
- **Contrast**: light text on the deep-ink background; status colours are paired with text labels, never
  colour alone.
- **Reduced motion**: all animations and transitions collapse under
  `@media (prefers-reduced-motion: reduce)`.
- **i18n**: `src/lib/i18n.ts` holds a flat message catalogue and a `createTranslator()` so English can be
  swapped or extended; the locale table already declares `dir: 'rtl'` for Arabic. MVP ships English only.
- **Mobile**: mobile-first layout, 56px bottom-navigation targets with safe-area padding, no horizontal
  overflow (`min-w-0` + `truncate` on long labels), viewport-aware chart heights, and a create flow that
  is fully usable from a phone.

---

## 14. What is deliberately NOT in MVP 0.1

No cryptocurrency, payments or subscriptions; no social network or messaging; no native app; no
multiplayer worlds; no government data integrations; no millions of agents; no digital twins; no
real-time global simulation. The architecture leaves room for them, but none are implemented here.

---

## 15. Roadmap

| Version | Focus |
| --- | --- |
| **0.2** | More business scenario templates; sector presets |
| **0.3** | Human feedback into the loop |
| **0.4** | Richer AI agent behaviour (memory, learning) |
| **0.5** | Social simulation sharing |
| **1.0** | Multiple simulation categories |

Categories already named in the type system and the create-flow UI (`marketing`, `product`, `career`,
`city`) are the intended path; further out: education, organisations, public policy, transportation and
consumer behaviour.

---

## Philosophy

Reality Lab does not tell you *“this will definitely happen.”* It helps you explore:

> **If these assumptions and behaviors exist, what could happen?**

```
IDEA → SIMULATION → EXPERIMENT → INSIGHT → DECISION
```
