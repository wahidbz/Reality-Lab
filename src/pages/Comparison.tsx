import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ScenarioVariant, SimulationRecord, SimulationRun } from '../types/simulation';
import { getRepository } from '../lib/store';
import { DEMO_SCENARIOS } from '../simulation/scenarios';
import { ComparisonBars, ComparisonTrendChart, TotalsGrid } from '../components/Charts';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';

/**
 * Side-by-side comparison of an original scenario and a What-If variant.
 * Both runs come from the engine; the variant shares the original's seed.
 */
export default function Comparison() {
  const { originalId, variantId } = useParams<{ originalId: string; variantId: string }>();
  const repo = getRepository();

  const [original, setOriginal] = useState<SimulationRecord | null>(null);
  const [variant, setVariant] = useState<SimulationRecord | null>(null);
  const [variants, setVariants] = useState<ScenarioVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!originalId || !variantId) throw new Error('Missing simulation ids for comparison.');
      const [a, b] = await Promise.all([repo.get(originalId), repo.get(variantId)]);
      if (!a) throw new Error('The original simulation could not be found.');
      if (!b) throw new Error('The variant simulation could not be found.');
      if (!a.result_json || !b.result_json) throw new Error('One of the two simulations has no results yet.');
      setOriginal(a);
      setVariant(b);
      setVariants(await repo.listVariants(originalId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [originalId, repo, variantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runA: SimulationRun | null = original?.result_json ?? null;
  const runB: SimulationRun | null = variant?.result_json ?? null;

  const changes = useMemo(() => {
    const entry = variants.find((v) => v.variant_simulation_id === variantId);
    if (entry) return entry.changes_json;
    // Fall back to a direct input diff so the comparison is always informative.
    if (!runA || !runB) return {};
    const diff: Record<string, { from: number | string; to: number | string }> = {};
    const keys: (keyof typeof runA.input)[] = ['price', 'marketingBudget', 'budget', 'quality', 'competitorCount', 'targetAudience', 'durationMonths'];
    for (const k of keys) {
      const a = runA.input[k] as number | string;
      const b = runB.input[k] as number | string;
      if (String(a) !== String(b)) diff[String(k)] = { from: a, to: b };
    }
    return diff;
  }, [variants, variantId, runA, runB]);

  const currency = runA?.input.currency ?? 'EUR';

  const bars = useMemo(() => {
    if (!runA || !runB) return [];
    return [
      { label: 'Score', original: runA.score.score, variant: runB.score.score },
      { label: 'Revenue', original: Math.round(runA.totals.totalRevenue), variant: Math.round(runB.totals.totalRevenue) },
      { label: 'Profit', original: Math.round(runA.totals.totalProfit), variant: Math.round(runB.totals.totalProfit) },
      { label: 'Marketing', original: Math.round(runA.totals.totalMarketing), variant: Math.round(runB.totals.totalMarketing) },
      { label: 'Avg customers', original: Math.round(runA.totals.avgMonthlyCustomers), variant: Math.round(runB.totals.avgMonthlyCustomers) },
    ];
  }, [runA, runB]);

  if (loading) {
    return (
      <div className="container-xl grid min-h-[40vh] place-items-center py-12">
        <span className="h-8 w-8 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
      </div>
    );
  }

  if (error || !runA || !runB || !original || !variant) {
    return (
      <div className="container-xl py-16">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h1 className="text-lg font-bold text-white">Comparison unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? 'One of the simulations has no results.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link to="/dashboard" className="btn-primary">
              Back to my simulations
            </Link>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scoreDelta = runB.score.score - runA.score.score;

  return (
    <div className="container-xl py-8 sm:py-10">
      <header className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge border-electric-500/30 bg-electric-500/10 text-electric-300">What-If comparison</span>
            <h1 className="mt-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              Original vs. Variant
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Both scenarios share seed <span className="mono">{original.seed}</span>, so every difference below comes
              from the changed variables.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">Score change</p>
            <p className={`mono text-3xl font-extrabold ${scoreDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {scoreDelta >= 0 ? '+' : ''}
              {scoreDelta}
            </p>
          </div>
        </div>
      </header>

      {/* --------------------- SIDE BY SIDE --------------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Scenario summaries">
        {[
          { tag: 'Original scenario', rec: original, run: runA, tone: 'border-white/[0.12]' },
          { tag: 'Variant scenario', rec: variant, run: runB, tone: 'border-electric-500/30' },
        ].map(({ tag, rec, run, tone }) => (
          <div key={tag} className={`card border p-5 ${tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{tag}</p>
                <h2 className="mt-1 truncate text-base font-bold text-white">{rec.name}</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {run.input.city}, {run.input.country} · {run.input.targetAudience}
                </p>
              </div>
              <div className="text-right">
                <p className="mono text-3xl font-extrabold text-white">{run.score.score}</p>
                <p className="text-[11px] text-slate-500">score</p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-xs">
              {[
                ['Price', formatCurrency(run.input.price, currency, 2)],
                ['Budget', formatCurrency(run.input.budget, currency)],
                ['Marketing / mo', formatCurrency(run.input.marketingBudget, currency)],
                ['Quality', `${Math.round(run.input.quality * 100)}/100`],
                ['Competitors', String(run.competitors.length)],
                ['Duration', `${run.input.durationMonths} months`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2 border-b border-white/[0.08] pb-1.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="mono font-semibold text-slate-200">{v}</dd>
                </div>
              ))}
            </dl>

            <Link to={`/simulation/${rec.id}/results`} className="btn-secondary mt-4 w-full !py-2 text-xs">
              Open results
            </Link>
          </div>
        ))}
      </section>

      {/* ----------------------- CHANGES ------------------------ */}
      {Object.keys(changes).length > 0 && (
        <section className="card mt-5 p-5" aria-labelledby="changes">
          <h2 id="changes" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Variables changed
          </h2>
          <div className="mt-4 overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Variables changed between the original and the variant</caption>
              <thead>
                <tr className="text-xs text-slate-500">
                  <th scope="col" className="pb-2 font-medium">Variable</th>
                  <th scope="col" className="pb-2 text-right font-medium">Original</th>
                  <th scope="col" className="pb-2 text-right font-medium">Variant</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(changes).map(([k, v]) => (
                  <tr key={k} className="border-t border-white/[0.08]">
                    <td className="py-2 capitalize text-slate-300">{k.replace(/([A-Z])/g, ' $1')}</td>
                    <td className="mono py-2 text-right text-slate-400">{String(v.from)}</td>
                    <td className="mono py-2 text-right font-semibold text-electric-300">{String(v.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------------- COMPARISON ---------------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Comparison charts">
        <ComparisonBars data={bars} currency={currency} />
        <ComparisonTrendChart rounds={runA.rounds} variantRounds={runB.rounds} metric="units" label="Monthly purchases" />
        <ComparisonTrendChart rounds={runA.rounds} variantRounds={runB.rounds} metric="profit" label="Monthly profit" />
        <ComparisonTrendChart rounds={runA.rounds} variantRounds={runB.rounds} metric="customers" label="Monthly customers" />
      </section>

      {/* ---------------------- METRIC TABLE -------------------- */}
      <section className="card mt-5 p-5" aria-labelledby="table">
        <h2 id="table" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Metric comparison
        </h2>
        <div className="mt-4 overflow-x-auto no-scrollbar">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">Metric-by-metric comparison of the original and the variant</caption>
            <thead>
              <tr className="text-xs text-slate-500">
                <th scope="col" className="pb-2 font-medium">Metric</th>
                <th scope="col" className="pb-2 text-right font-medium">Original</th>
                <th scope="col" className="pb-2 text-right font-medium">Variant</th>
                <th scope="col" className="pb-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Simulation score', runA.score.score, runB.score.score, 'num'],
                ['Total revenue', runA.totals.totalRevenue, runB.totals.totalRevenue, currency],
                ['Total profit', runA.totals.totalProfit, runB.totals.totalProfit, currency],
                ['Total marketing', runA.totals.totalMarketing, runB.totals.totalMarketing, currency],
                ['Units sold', runA.totals.totalUnits, runB.totals.totalUnits, 'num'],
                ['Avg monthly customers', runA.totals.avgMonthlyCustomers, runB.totals.avgMonthlyCustomers, 'num'],
                ['New customers', runA.totals.totalNewCustomers, runB.totals.totalNewCustomers, 'num'],
                ['Returning customers', runA.totals.totalReturningCustomers, runB.totals.totalReturningCustomers, 'num'],
                ['Avg retention', runA.totals.avgRetention, runB.totals.avgRetention, 'pct'],
                ['Avg satisfaction', runA.totals.avgSatisfaction, runB.totals.avgSatisfaction, 'pct'],
                ['Final market share', runA.totals.finalMarketShare, runB.totals.finalMarketShare, 'pct'],
                ['Final cash', runA.totals.finalCash, runB.totals.finalCash, currency],
                ['Competition pressure', runA.totals.avgCompetitionPressure, runB.totals.avgCompetitionPressure, 'pct'],
                ['Events generated', runA.events.length, runB.events.length, 'num'],
              ].map(([label, a, b, kind]) => {
                const av = a as number;
                const bv = b as number;
                const diff = bv - av;
                const fmt = (v: number) =>
                  kind === 'currency'
                    ? formatCurrency(v, currency)
                    : kind === 'pct'
                      ? formatPercent(v, 1)
                      : formatNumber(v, 1);
                return (
                  <tr key={String(label)} className="border-t border-white/[0.08]">
                    <td className="py-2 text-slate-300">{label as string}</td>
                    <td className="mono py-2 text-right text-slate-400">{fmt(av)}</td>
                    <td className="mono py-2 text-right font-semibold text-white">{fmt(bv)}</td>
                    <td
                      className={`mono py-2 text-right font-semibold ${
                        diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-rose-300' : 'text-slate-500'
                      }`}
                    >
                      {diff > 0 ? '+' : ''}
                      {fmt(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------- EVENTS SIDE BY SIDE ------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Events in each scenario">
        {[
          { title: `Original — ${runA.events.length} events`, events: runA.events },
          { title: `Variant — ${runB.events.length} events`, events: runB.events },
        ].map(({ title, events }) => (
          <div key={title} className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {events.map((e) => (
                <li key={e.id} className="text-xs">
                  <span className="mono font-semibold text-electric-300">M{e.month}</span>
                  <span className="ml-2 text-slate-300">{e.description}</span>
                </li>
              ))}
              {events.length === 0 && <li className="text-xs text-slate-500">No events.</li>}
            </ul>
          </div>
        ))}
      </section>

      {/* ---------------------- TOTALS GRIDS ------------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Totals">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Original totals</h2>
          <TotalsGrid totals={runA.totals} currency={currency} />
        </div>
        <div className="card border-electric-500/25 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-electric-300">Variant totals</h2>
          <TotalsGrid totals={runB.totals} currency={currency} />
        </div>
      </section>

      <p className="mt-8 text-center text-xs text-slate-500">
        Results are scenario-based simulations, not predictions or guarantees of real-world outcomes.
      </p>
    </div>
  );
}
