import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SimulationInput } from '../types/simulation';
import { AUDIENCE_OPTIONS, CURRENCY_OPTIONS, emptyInput, inputFromIdea } from '../simulation/scenarios';
import { detectAudienceKey, normalizeInput } from '../simulation/world';
import { interpretIdea, isAiConfigured } from '../lib/ai';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import { useSimulationRunner } from '../lib/useSimulationRunner';
import RunProgress from '../components/RunProgress';
import { formatCurrency } from '../lib/format';

const STEPS = ['Idea', 'Market', 'Business variables', 'Advanced variables', 'Review'] as const;

const SIM_TYPES = [
  { key: 'business', label: 'Business', active: true, blurb: 'Openings, pricing, market entry, competition.' },
  { key: 'marketing', label: 'Marketing', active: false },
  { key: 'product', label: 'Product', active: false },
  { key: 'career', label: 'Career', active: false },
  { key: 'city', label: 'Cities', active: false },
] as const;

export default function CreateSimulation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const repo = getRepository();
  const runner = useSimulationRunner();

  const [step, setStep] = useState(0);
  const [ideaText, setIdeaText] = useState('');
  const [input, setInput] = useState<SimulationInput>(emptyInput());
  const [customAudience, setCustomAudience] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof SimulationInput>(key: K, value: SimulationInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const isCustomAudience = customAudience || !AUDIENCE_OPTIONS.some((a) => a.label === input.targetAudience);

  /* ---------------- validation ---------------- */

  const validateStep = (index: number): string[] => {
    const errs: string[] = [];
    if (index === 0) {
      if (!input.name.trim()) errs.push('Give your simulation a name.');
      if (input.description.trim().length < 12) errs.push('Describe the idea in at least a short sentence.');
    }
    if (index === 1) {
      if (!input.country.trim()) errs.push('Select or enter a country.');
      if (!input.city.trim()) errs.push('Select or enter a city.');
      if (!input.targetAudience.trim()) errs.push('Define your target audience.');
    }
    if (index === 2) {
      if (!(input.budget > 0)) errs.push('Starting budget must be greater than zero.');
      if (!(input.price > 0)) errs.push('Product/service price must be greater than zero.');
      if (!(input.operatingCost >= 0)) errs.push('Expected operating cost cannot be negative.');
    }
    return errs;
  };

  const next = () => {
    const errs = validateStep(step);
    setErrors(errs);
    if (errs.length === 0) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const back = () => {
    setErrors([]);
    setStep((s) => Math.max(0, s - 1));
  };

  /* ---------------- idea -> variables ---------------- */

  const analyzeIdea = async () => {
    setInterpreting(true);
    setNotes([]);
    const result = await interpretIdea(ideaText, input);
    setInput(result.input);
    setCustomAudience(!AUDIENCE_OPTIONS.some((a) => a.label === result.input.targetAudience));
    setNotes(result.notes);
    setInterpreting(false);
  };

  const applyIdeaQuick = () => {
    if (!ideaText.trim()) return;
    const quick = inputFromIdea(ideaText, {});
    setInput((prev) => ({ ...prev, ...quick, name: prev.name || quick.name }));
    setNotes(['Variables derived from your idea text. Review and adjust below.']);
  };

  /* ---------------- run ---------------- */

  const run = async () => {
    if (!user) return;
    const all = [...validateStep(0), ...validateStep(1), ...validateStep(2)];
    if (all.length) {
      setErrors(all);
      return;
    }

    const result = await runner.run(input);
    if (!result) {
      // The engine failed — still persist a draft so the user's configuration
      // is not lost, and surface the friendly error already shown by the runner.
      try {
        await repo.create({
          userId: user.id,
          input: normalizeInput(input),
          result: null,
          status: 'failed',
        });
      } catch {
        /* if even the draft cannot be saved, the user keeps the form state */
      }
      return;
    }

    try {
      const record = await repo.create({
        userId: user.id,
        input: result.input,
        result,
        status: 'completed',
      });
      navigate(`/simulation/${record.id}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Could not save the simulation.']);
    }
  };

  const summary = useMemo(
    () => [
      ['Simulation name', input.name || '—'],
      ['Type', 'Business'],
      ['Location', [input.city, input.country].filter(Boolean).join(', ') || '—'],
      ['Target audience', input.targetAudience || '—'],
      ['Starting budget', formatCurrency(input.budget, input.currency)],
      ['Product/service price', formatCurrency(input.price, input.currency, 2)],
      ['Expected operating cost', `${formatCurrency(input.operatingCost, input.currency)} / month`],
      ['Monthly fixed cost', formatCurrency(input.monthlyFixedCost ?? input.operatingCost, input.currency)],
      ['Employees', String(input.employees ?? '—')],
      ['Opening capacity', `${input.capacity ?? '—'} customers / month`],
      ['Simulation duration', `${input.durationMonths} months`],
      ['Marketing budget', `${formatCurrency(input.marketingBudget ?? 0, input.currency)} / month`],
      ['Initial customers', String(input.initialCustomers ?? 0)],
      ['Number of competitors', String(input.competitorCount ?? 0)],
      ['Customer acquisition cost', formatCurrency(input.customerAcquisitionCost ?? 0, input.currency, 2)],
      ['Quality', `${Math.round((input.quality ?? 0.55) * 100)} / 100`],
    ],
    [input],
  );

  return (
    <div className="container-xl py-10">
      {runner.running && <RunProgress phase={runner.phase} percent={runner.percent} title="Running simulation" />}

      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Create a simulation</h1>
        <p className="mt-2 text-sm text-slate-400">
          Five steps from an idea to a simulated market. Only Business is available in MVP 0.1.
        </p>
      </header>

      {/* Stepper */}
      <ol className="mt-7 flex flex-wrap gap-2" aria-label="Creation steps">
        {STEPS.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                aria-current={active ? 'step' : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-electric-500/60 bg-electric-500/15 text-electric-200'
                    : done
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:brightness-110'
                      : 'border-white/[0.12] bg-white/[0.03] text-slate-500'
                }`}
              >
                <span className="mono mr-1.5">{done ? '✓' : i + 1}</span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {errors.length > 0 && (
        <div role="alert" className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-xs font-semibold text-rose-200">Please fix the following:</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-rose-100/90">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {runner.error && (
        <p role="alert" className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {runner.error}
        </p>
      )}

      <div className="card mt-6 p-5 sm:p-7">
        {/* ---------------- STEP 1 ---------------- */}
        {step === 0 && (
          <section aria-labelledby="s1">
            <h2 id="s1" className="text-lg font-bold text-white">
              What do you want to test?
            </h2>

            <div className="mt-5 grid gap-5">
              <div>
                <label htmlFor="name" className="label">
                  Simulation name
                </label>
                <input
                  id="name"
                  className="input"
                  placeholder="Student Coffee Shop — Berlin"
                  value={input.name}
                  onChange={(e) => set('name', e.target.value)}
                  maxLength={80}
                />
              </div>

              <div>
                <label htmlFor="desc" className="label">
                  Idea description
                </label>
                <textarea
                  id="desc"
                  rows={4}
                  className="input resize-y"
                  placeholder="I want to open a low-cost coffee shop for university students."
                  value={input.description}
                  onChange={(e) => set('description', e.target.value)}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Example: “I want to open a low-cost coffee shop for university students.”
                </p>
              </div>

              {/* Optional: extract variables from the idea */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <label htmlFor="idea" className="label">
                  Natural-language idea {isAiConfigured ? '(AI-assisted)' : '(deterministic parser)'}
                </label>
                <textarea
                  id="idea"
                  rows={2}
                  className="input resize-y"
                  placeholder="Open a cheap coffee shop for students in Berlin"
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary !py-2 text-xs" onClick={applyIdeaQuick} disabled={!ideaText.trim()}>
                    Extract variables
                  </button>
                  {isAiConfigured && (
                    <button type="button" className="btn-primary !py-2 text-xs" onClick={analyzeIdea} disabled={interpreting || !ideaText.trim()}>
                      {interpreting ? 'Interpreting…' : 'Interpret with AI'}
                    </button>
                  )}
                </div>
                {notes.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-slate-400">
                    {notes.map((n) => (
                      <li key={n}>• {n}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-slate-500">
                  Numbers always come from the simulation engine. AI, when configured, only helps turn text into
                  scenario variables.
                </p>
              </div>

              <fieldset>
                <legend className="label">Simulation type</legend>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {SIM_TYPES.map((t) => (
                    <label
                      key={t.key}
                      className={`flex cursor-pointer flex-col rounded-xl border p-3.5 transition ${
                        input.type === t.key && t.active
                          ? 'border-electric-500/60 bg-electric-500/[0.12]'
                          : 'border-white/10 bg-white/[0.03]'
                      } ${!t.active ? 'cursor-not-allowed opacity-55' : 'hover:border-white/25'}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="sim-type"
                          className="accent-electric-500"
                          checked={input.type === t.key && t.active}
                          disabled={!t.active}
                          onChange={() => t.active && set('type', 'business')}
                        />
                        <span className="text-sm font-semibold text-white">{t.label}</span>
                        {!t.active && (
                          <span className="badge border-white/15 bg-white/[0.06] text-slate-400">Coming soon</span>
                        )}
                      </span>
                      {'blurb' in t && t.blurb && <span className="mt-1.5 text-xs text-slate-400">{t.blurb}</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
        )}

        {/* ---------------- STEP 2 ---------------- */}
        {step === 1 && (
          <section aria-labelledby="s2">
            <h2 id="s2" className="text-lg font-bold text-white">
              Market
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Location drives the cost index, competition intensity and willingness to pay — the same idea behaves
              differently in different cities.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="country" className="label">
                  Country
                </label>
                <input
                  id="country"
                  className="input"
                  list="country-list"
                  value={input.country}
                  onChange={(e) => set('country', e.target.value)}
                />
                <datalist id="country-list">
                  {['Germany', 'United Kingdom', 'France', 'Spain', 'Netherlands', 'United States', 'Canada', 'United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Turkey', 'Japan', 'Singapore', 'India', 'Kenya', 'Australia', 'Portugal'].map(
                    (c) => (
                      <option key={c} value={c} />
                    ),
                  )}
                </datalist>
              </div>

              <div>
                <label htmlFor="city" className="label">
                  City
                </label>
                <input
                  id="city"
                  className="input"
                  list="city-list"
                  value={input.city}
                  onChange={(e) => set('city', e.target.value)}
                />
                <datalist id="city-list">
                  {['Berlin', 'Munich', 'London', 'Paris', 'Madrid', 'Amsterdam', 'New York', 'San Francisco', 'Austin', 'Toronto', 'Dubai', 'Abu Dhabi', 'Riyadh', 'Cairo', 'Alexandria', 'Istanbul', 'Tokyo', 'Singapore', 'Mumbai', 'Nairobi', 'Sydney', 'Lisbon'].map(
                    (c) => (
                      <option key={c} value={c} />
                    ),
                  )}
                </datalist>
                <p className="mt-1.5 text-xs text-slate-500">
                  Known cities use calibrated profiles; unknown cities fall back to a country heuristic.
                </p>
              </div>

              <div className="sm:col-span-2">
                <span className="label">Target audience</span>
                <div className="flex flex-wrap gap-2">
                  {AUDIENCE_OPTIONS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => {
                        setCustomAudience(false);
                        set('targetAudience', a.label);
                        set('audienceKey', a.key);
                      }}
                      aria-pressed={!isCustomAudience && input.targetAudience === a.label}
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                        !isCustomAudience && input.targetAudience === a.label
                          ? 'border-electric-500/60 bg-electric-500/15 text-electric-200'
                          : 'border-white/[0.12] bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomAudience(true)}
                    aria-pressed={isCustomAudience}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                      isCustomAudience
                        ? 'border-electric-500/60 bg-electric-500/15 text-electric-200'
                        : 'border-white/[0.12] bg-white/[0.03] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    Custom…
                  </button>
                </div>

                {isCustomAudience && (
                  <div className="mt-3">
                    <label htmlFor="customAud" className="label">
                      Describe your audience
                    </label>
                    <input
                      id="customAud"
                      className="input"
                      placeholder="Remote software engineers aged 25–40"
                      value={input.targetAudience}
                      onChange={(e) => {
                        set('targetAudience', e.target.value);
                        set('audienceKey', detectAudienceKey(e.target.value));
                      }}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">
                      Detected attribute archetype: <span className="font-semibold text-slate-300">{input.audienceKey}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---------------- STEP 3 ---------------- */}
        {step === 2 && (
          <section aria-labelledby="s3">
            <h2 id="s3" className="text-lg font-bold text-white">
              Business variables
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <NumberField
                id="budget"
                label="Starting budget"
                value={input.budget}
                min={0}
                onChange={(v) => set('budget', v)}
                hint="Cash the business begins with."
              />
              <div>
                <label htmlFor="currency" className="label">
                  Currency
                </label>
                <select id="currency" className="input" value={input.currency} onChange={(e) => set('currency', e.target.value)}>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">Display only — the engine works with numbers.</p>
              </div>
              <NumberField
                id="price"
                label="Product / service price"
                value={input.price}
                min={0.01}
                step={0.1}
                onChange={(v) => set('price', v)}
                hint="Price per unit / per customer visit."
              />
              <NumberField
                id="opcost"
                label="Expected operating cost (monthly)"
                value={input.operatingCost}
                min={0}
                onChange={(v) => {
                  set('operatingCost', v);
                  set('monthlyFixedCost', v);
                }}
                hint="Rent, wages, utilities per month."
              />
              <NumberField
                id="employees"
                label="Number of employees (optional)"
                value={input.employees ?? 0}
                min={0}
                onChange={(v) => set('employees', v)}
              />
              <NumberField
                id="capacity"
                label="Opening capacity (customers / month, optional)"
                value={input.capacity ?? 0}
                min={1}
                onChange={(v) => set('capacity', v)}
                hint="Hard ceiling on units sold per month."
              />

              <fieldset className="sm:col-span-2">
                <legend className="label">Simulation duration</legend>
                <div className="flex flex-wrap gap-2">
                  {[3, 6, 12].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set('durationMonths', d)}
                      aria-pressed={input.durationMonths === d}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                        input.durationMonths === d
                          ? 'border-electric-500/60 bg-electric-500/15 text-electric-200'
                          : 'border-white/[0.12] bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {d} months
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">One simulation round is run per month. Default: 12 months.</p>
              </fieldset>
            </div>
          </section>
        )}

        {/* ---------------- STEP 4 ---------------- */}
        {step === 3 && (
          <section aria-labelledby="s4">
            <h2 id="s4" className="text-lg font-bold text-white">
              Advanced variables (optional)
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Sensible defaults are derived from your core numbers if you leave these untouched.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <NumberField id="mkt" label="Marketing budget (monthly)" value={input.marketingBudget ?? 0} min={0} onChange={(v) => set('marketingBudget', v)} hint="Drives awareness growth each month." />
              <NumberField id="initcust" label="Initial customers" value={input.initialCustomers ?? 0} min={0} onChange={(v) => set('initialCustomers', v)} hint="Agents already aware in month 1." />
              <NumberField id="comps" label="Number of competitors" value={input.competitorCount ?? 0} min={0} max={40} onChange={(v) => set('competitorCount', v)} hint="Each competitor follows a strategy." />
              <NumberField id="cac" label="Customer acquisition cost" value={input.customerAcquisitionCost ?? 0} min={0} onChange={(v) => set('customerAcquisitionCost', v)} hint="Used as a reference metric." />
              <NumberField id="fixed" label="Monthly fixed cost" value={input.monthlyFixedCost ?? 0} min={0} onChange={(v) => set('monthlyFixedCost', v)} hint="Overrides the operating cost above." />

              <div className="sm:col-span-2">
                <label htmlFor="quality" className="label">
                  Offer quality — {Math.round((input.quality ?? 0.55) * 100)} / 100
                </label>
                <input
                  id="quality"
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={Math.round((input.quality ?? 0.55) * 100)}
                  onChange={(e) => set('quality', Number(e.target.value) / 100)}
                  className="w-full accent-electric-500"
                  aria-valuetext={`${Math.round((input.quality ?? 0.55) * 100)} out of 100`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Quality raises customer satisfaction, which raises retention and raises the score.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="seed" className="label">
                  Simulation seed (optional)
                </label>
                <input
                  id="seed"
                  className="input mono"
                  placeholder="Leave blank for a random seed"
                  value={input.seed ?? ''}
                  onChange={(e) => set('seed', e.target.value === '' ? undefined : e.target.value)}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  The same seed and the same variables always produce the same result. Use a fixed seed to make a
                  run reproducible.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ---------------- STEP 5 ---------------- */}
        {step === 4 && (
          <section aria-labelledby="s5">
            <h2 id="s5" className="text-lg font-bold text-white">
              Review
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Confirm the scenario. The engine will generate {100} customer agents
              {input.competitorCount ? `, ${input.competitorCount} competitor agents` : ''} and run {input.durationMonths} monthly
              rounds.
            </p>

            <dl className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {summary.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-2">
                  <dt className="text-xs text-slate-400">{k}</dt>
                  <dd className="mono text-sm font-semibold text-white">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Idea</p>
              <p className="mt-1.5 text-sm text-slate-300">{input.description}</p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="btn-primary !px-6 !py-3 text-base" onClick={run} disabled={runner.running}>
                {runner.running ? 'Running…' : 'RUN SIMULATION'}
              </button>
              <button type="button" className="btn-secondary !px-6 !py-3 text-base" onClick={back} disabled={runner.running}>
                Back to variables
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-500">
              Results are scenario-based simulations, not predictions or guarantees of real-world outcomes.
            </p>
          </section>
        )}

        {/* ---------------- NAVIGATION ---------------- */}
        {step < 4 && (
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
            <button type="button" className="btn-ghost" onClick={back} disabled={step === 0}>
              ← Back
            </button>
            <button type="button" className="btn-primary" onClick={next}>
              Continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="input mono"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = e.target.value === '' ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
