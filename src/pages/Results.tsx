import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SimulationInput, SimulationRecord, SimulationRun } from '../types/simulation';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import { useSimulationRunner } from '../lib/useSimulationRunner';
import { DEMO_SCENARIOS } from '../simulation/scenarios';
import RunProgress from '../components/RunProgress';
import {
  ComparisonBars,
  HealthChart,
  MetricsTimelineChart,
  ScoreBreakdown,
  ScoreRadar,
  TotalsGrid,
} from '../components/Charts';
import Timeline from '../components/Timeline';
import { formatCurrency, formatNumber, formatPercent, scoreBand, statusTone } from '../lib/format';

/** Fields the user may change to create a What-If variant. */
const WHATIF_FIELDS: { key: keyof SimulationInput; label: string; kind: 'number' | 'text'; step?: number }[] = [
  { key: 'price', label: 'Product / service price', kind: 'number', step: 0.1 },
  { key: 'marketingBudget', label: 'Marketing budget (monthly)', kind: 'number' },
  { key: 'budget', label: 'Starting budget', kind: 'number' },
  { key: 'quality', label: 'Offer quality (0–1)', kind: 'number', step: 0.05 },
  { key: 'competitorCount', label: 'Number of competitors', kind: 'number' },
  { key: 'targetAudience', label: 'Target audience', kind: 'text' },
];

export default function Results() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const repo = getRepository();
  const runner = useSimulationRunner();

  const [record, setRecord] = useState<SimulationRecord | null>(null);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showWhatIf, setShowWhatIf] = useState(params.get('whatif') === '1');
  const [changes, setChanges] = useState<Record<string, number | string>>({});
  const [variantRun, setVariantRun] = useState<SimulationRun | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);

  const isDemo = id === 'demo';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDemo) {
        // Demo results: re-derive through the engine from the built-in scenario.
        const demo = DEMO_SCENARIOS[0];
        const result = await runner.run(demo.input, demo.input.seed);
        if (!result) throw new Error(runner.error ?? 'Demo simulation unavailable.');
        setRun(result);
        setRecord(null);
        return;
      }
      if (!id) throw new Error('Missing simulation id.');
      const found = await repo.get(id);
      if (!found) throw new Error('Simulation not found, or you do not have access to it.');
      setRecord(found);
      if (found.result_json) setRun(found.result_json);
      else throw new Error('This simulation has no results yet. Open it to run the engine.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load results.');
    } finally {
      setLoading(false);
    }
  }, [id, isDemo, repo, runner]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ------------------- what-if ------------------- */

  const applyChange = (key: string, value: number | string) => setChanges((c) => ({ ...c, [key]: value }));

  const runVariant = async () => {
    if (!record || !run) return;
    setVariantError(null);
    setVariantRun(null);
    setVariantId(null);

    if (Object.keys(changes).length === 0) {
      setVariantError('Change at least one variable to create a variant.');
      return;
    }

    // Build the variant input: same seed family, changed variables only.
    const variantInput: SimulationInput = { ...record.input_json };
    const diff: Record<string, { from: number | string; to: number | string }> = {};
    for (const [k, v] of Object.entries(changes)) {
      const key = k as keyof SimulationInput;
      const before = variantInput[key] as number | string | undefined;
      if (before !== undefined && String(before) !== String(v)) {
        diff[k] = { from: before, to: v };
        (variantInput as unknown as Record<string, unknown>)[k] = v;
      }
    }
    if (Object.keys(diff).length === 0) {
      setVariantError('The variant is identical to the original. Change a value to compare.');
      return;
    }
    variantInput.name = `${record.name} (What-If)`;

    const result = await runner.run(variantInput, record.seed);
    if (!result) {
      setVariantError(runner.error ?? 'The variant simulation failed to run.');
      return;
    }
    setVariantRun(result);

    if (!user) return;
    try {
      const created = await repo.create({
        userId: user.id,
        input: result.input,
        result,
        status: 'completed',
        parentSimulationId: record.id,
      });
      setVariantId(created.id);
      await repo.saveVariant({
        parent_simulation_id: record.id,
        variant_simulation_id: created.id,
        changes_json: diff,
      });
    } catch (e) {
      setVariantError(e instanceof Error ? e.message : 'The variant ran but could not be saved.');
    }
  };

  /* ------------------- derived ------------------- */

  const currency = run?.input.currency ?? 'EUR';
  const band = run ? scoreBand(run.score.score) : null;

  const compareData = useMemo(() => {
    if (!run || !variantRun) return [];
    return [
      { label: 'Score', original: run.score.score, variant: variantRun.score.score },
      { label: 'Revenue', original: Math.round(run.totals.totalRevenue), variant: Math.round(variantRun.totals.totalRevenue) },
      { label: 'Profit', original: Math.round(run.totals.totalProfit), variant: Math.round(variantRun.totals.totalProfit) },
      { label: 'Customers', original: Math.round(run.totals.avgMonthlyCustomers), variant: Math.round(variantRun.totals.avgMonthlyCustomers) },
    ];
  }, [run, variantRun]);

  /* ------------------- states ------------------- */

  if (loading || runner.running) {
    return (
      <div className="container-xl py-12">
        {runner.running ? (
          <RunProgress phase={runner.phase} percent={runner.percent} title={variantRun === null && Object.keys(changes).length > 0 ? 'Running What-If scenario' : 'Running simulation'} />
        ) : (
          <div className="grid min-h-[40vh] place-items-center">
            <span className="h-8 w-8 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
          </div>
        )}
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="container-xl py-16">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h1 className="text-lg font-bold text-white">Results unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? 'No results were found for this simulation.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to={isDemo ? '/' : '/dashboard'} className="btn-primary">
              {isDemo ? 'Back to home' : 'Back to my simulations'}
            </Link>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-xl py-8 sm:py-10">
      {/* ------------------------ HEADER ------------------------ */}
      <header className="card p-6 text-center">
        <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          {statusTone('completed') ? '●' : ''} SIMULATION COMPLETE
        </span>
        <h1 className="mt-3 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
          {isDemo ? `${DEMO_SCENARIOS[0].name} (demo)` : run.input.name}
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          {run.input.city}, {run.input.country} · {run.input.targetAudience} · {run.rounds.length} months · seed{' '}
          <span className="mono">{run.seed}</span>
        </p>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Simulation score</p>
          <p className="mono mt-1 text-5xl font-extrabold text-white sm:text-6xl">
            {run.score.score}
            <span className="text-2xl text-slate-500"> / 100</span>
          </p>
          {band && (
            <p className="mt-2 text-sm font-semibold text-electric-300">
              {band.label}
            </p>
          )}
          <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-slate-400">
            This score summarizes the behavior of this simulation scenario. It is not a prediction of real-world
            results.
          </p>
        </div>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-primary !px-6 !py-3"
            onClick={() => setShowWhatIf((v) => !v)}
            disabled={isDemo}
            title={isDemo ? 'Open your own simulation to create What-If variants' : undefined}
          >
            {showWhatIf ? 'Hide What-If builder' : 'Create What-If Scenario'}
          </button>
          <Link to={isDemo ? '/simulation/demo/' + DEMO_SCENARIOS[0].slug : `/simulation/${record?.id}`} className="btn-secondary !px-6 !py-3">
            Back to simulation
          </Link>
        </div>
        {isDemo && (
          <p className="mt-3 text-xs text-slate-500">
            What-If variants need your own simulation — <Link to="/simulate/new" className="text-electric-300 underline">run one here</Link>.
          </p>
        )}
      </header>

      {/* --------------------- WHAT-IF BUILDER ------------------ */}
      {showWhatIf && !isDemo && record && (
        <section className="card mt-5 border-electric-500/25 p-5 sm:p-6" aria-labelledby="whatif">
          <h2 id="whatif" className="text-lg font-bold text-white">
            Create What-If Scenario
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Change one or more variables. The variant re-runs the engine with the same seed (
            <span className="mono">{record.seed}</span>), so any difference you see comes from your changes.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHATIF_FIELDS.map((f) => {
              const current = record.input_json[f.key] as number | string | undefined;
              return (
                <div key={String(f.key)}>
                  <label htmlFor={`wi-${String(f.key)}`} className="label">
                    {f.label}
                  </label>
                  {f.kind === 'number' ? (
                    <input
                      id={`wi-${String(f.key)}`}
                      type="number"
                      inputMode="decimal"
                      step={f.step ?? 1}
                      className="input mono"
                      value={(changes[String(f.key)] as number | undefined) ?? (current as number) ?? 0}
                      onChange={(e) => applyChange(String(f.key), Number(e.target.value))}
                    />
                  ) : (
                    <input
                      id={`wi-${String(f.key)}`}
                      className="input"
                      value={(changes[String(f.key)] as string | undefined) ?? (current as string) ?? ''}
                      onChange={(e) => applyChange(String(f.key), e.target.value)}
                    />
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Original: <span className="mono text-slate-400">{String(current)}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {variantError && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {variantError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={runVariant} disabled={runner.running}>
              Run variant
            </button>
            <button type="button" className="btn-ghost" onClick={() => setChanges({})}>
              Clear changes
            </button>
          </div>
        </section>
      )}

      {/* ------------------------ PERFORMANCE -------------------- */}
      <section className="mt-5" aria-labelledby="perf">
        <h2 id="perf" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Performance
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white">Score breakdown</h3>
            <p className="mt-1 text-xs text-slate-400">{run.score.formula}</p>
            <div className="mt-4">
              <ScoreBreakdown components={run.score.components} />
            </div>
          </div>
          <ScoreRadar components={run.score.components} />
        </div>
      </section>

      {/* ------------------------ KEY FINDINGS ------------------ */}
      <section className="mt-5 card p-5 sm:p-6" aria-labelledby="findings">
        <h2 id="findings" className="text-lg font-bold text-white">
          Key findings
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Every finding below is generated from this simulation's own round data.
        </p>
        <ol className="mt-5 space-y-3">
          {run.findings.map((f, i) => (
            <li
              key={f.title}
              className={`rounded-xl border p-4 ${
                f.direction === 'positive'
                  ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                  : f.direction === 'negative'
                    ? 'border-rose-500/25 bg-rose-500/[0.06]'
                    : 'border-white/[0.12] bg-white/[0.03]'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mono mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.06] text-xs font-bold text-slate-200">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{f.detail}</p>
                  <p className="mono mt-2 text-[11px] text-slate-500">evidence: {f.evidence}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------- EXPLAINABILITY ------------------- */}
      <section className="mt-5 card p-5 sm:p-6" aria-labelledby="why">
        <h2 id="why" className="text-lg font-bold text-white">
          Why the simulation produced this
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-300">
          {run.explanation.map((line, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-0.5 text-electric-400">
                ▸
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------ TOTALS + CHARTS --------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-labelledby="totals">
        <div className="card p-5">
          <h2 id="totals" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Totals across {run.rounds.length} months
          </h2>
          <div className="mt-4">
            <TotalsGrid totals={run.totals} currency={currency} />
          </div>
        </div>
        <MetricsTimelineChart rounds={run.rounds} />
        <HealthChart rounds={run.rounds} />
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Full event timeline ({run.events.length} events)
          </h2>
          <div className="mt-4 max-h-[26rem] overflow-y-auto pr-1">
            <Timeline events={run.events} compact />
          </div>
        </div>
      </section>

      {/* ------------------------ VARIANT RESULT ---------------- */}
      {variantRun && (
        <section className="mt-6" aria-labelledby="variant" id="variant">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="variant" className="text-lg font-bold text-white">
              What-If result
            </h2>
            <div className="flex flex-wrap gap-2">
              {variantId && (
                <Link to={`/compare/${record?.id}/${variantId}`} className="btn-primary !py-2 text-xs">
                  Open full comparison
                </Link>
              )}
              {variantId && (
                <Link to={`/simulation/${variantId}`} className="btn-secondary !py-2 text-xs">
                  Open variant simulation
                </Link>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Variant score</p>
              <p className="mono mt-1 text-4xl font-extrabold text-white">{variantRun.score.score}</p>
              <p className="mt-1 text-sm text-slate-400">
                vs {run.score.score} original (
                <span className={variantRun.score.score >= run.score.score ? 'text-emerald-300' : 'text-rose-300'}>
                  {variantRun.score.score >= run.score.score ? '+' : ''}
                  {variantRun.score.score - run.score.score} pts
                </span>
                )
              </p>

              <dl className="mt-4 space-y-2 text-xs">
                {[
                  ['Revenue', formatCurrency(variantRun.totals.totalRevenue, currency), formatCurrency(run.totals.totalRevenue, currency)],
                  ['Profit', formatCurrency(variantRun.totals.totalProfit, currency), formatCurrency(run.totals.totalProfit, currency)],
                  ['Avg customers', formatNumber(variantRun.totals.avgMonthlyCustomers, 1), formatNumber(run.totals.avgMonthlyCustomers, 1)],
                  ['Retention', formatPercent(variantRun.totals.avgRetention), formatPercent(run.totals.avgRetention)],
                  ['Market share', formatPercent(variantRun.totals.finalMarketShare, 1), formatPercent(run.totals.finalMarketShare, 1)],
                  ['Final cash', formatCurrency(variantRun.totals.finalCash, currency), formatCurrency(run.totals.finalCash, currency)],
                ].map(([k, v, o]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-1.5">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="mono text-right">
                      <span className="font-semibold text-white">{v}</span>{' '}
                      <span className="text-slate-500">(was {o})</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:col-span-2">
              <ComparisonBars data={compareData} currency={currency} />
            </div>
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">
        Results are scenario-based simulations, not predictions or guarantees of real-world outcomes.
      </p>
    </div>
  );
}
