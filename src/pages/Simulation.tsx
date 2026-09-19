import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SimulationRecord, SimulationRun } from '../types/simulation';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import { useSimulationRunner } from '../lib/useSimulationRunner';
import { runDemo, DEMO_SCENARIOS } from '../simulation/scenarios';
import RunProgress from '../components/RunProgress';
import MetricCard from '../components/MetricCard';
import Timeline from '../components/Timeline';
import AgentActivity from '../components/AgentActivity';
import { CustomersChart, HealthChart, MetricsTimelineChart } from '../components/Charts';
import { formatCurrency, formatNumber, formatPercent, statusTone } from '../lib/format';

interface Props {
  /** 'demo' runs a built-in public scenario; 'own' loads/saves the user's record. */
  mode: 'demo' | 'own';
}

export default function SimulationPage({ mode }: Props) {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const repo = getRepository();
  const runner = useSimulationRunner();

  const [record, setRecord] = useState<SimulationRecord | null>(null);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRound, setActiveRound] = useState(1);

  /* ------------------- load or execute ------------------- */

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (mode === 'demo') {
      const demo = DEMO_SCENARIOS.find((d) => d.slug === slug);
      if (!demo) {
        setError('That demo simulation does not exist.');
        setLoading(false);
        return;
      }
      // The demo is executed by the REAL engine, live — not read from stored JSON.
      const result = await runner.run(demo.input, demo.input.seed);
      if (!result) {
        setError(runner.error ?? 'The demo simulation could not be generated.');
        setLoading(false);
        return;
      }
      setRun(result);
      setActiveRound(1);
      setLoading(false);
      return;
    }

    if (!id) {
      setError('Missing simulation id.');
      setLoading(false);
      return;
    }

    try {
      const found = await repo.get(id);
      if (!found) {
        setError('Simulation not found, or you do not have access to it.');
        setLoading(false);
        return;
      }
      setRecord(found);

      if (found.result_json) {
        setRun(found.result_json);
        setActiveRound(1);
      } else {
        // Draft / running / failed without a stored result -> execute now.
        const result = await runner.run(found.input_json, found.input_json.seed);
        if (!result) {
          setError(runner.error ?? 'The simulation could not be completed.');
        } else {
          setRun(result);
          setActiveRound(1);
          await repo.update(found.id, { result_json: result, status: 'completed', score: result.score.score });
          setRecord({ ...found, result_json: result, status: 'completed', score: result.score.score });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the simulation.');
    } finally {
      setLoading(false);
    }
  }, [id, mode, repo, runner, slug]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, slug, mode]);

  /* ------------------- derived ------------------- */

  const current = useMemo(() => {
    if (!run) return null;
    return run.rounds.find((r) => r.round === activeRound) ?? run.rounds[0];
  }, [run, activeRound]);

  const prev = useMemo(() => {
    if (!run || activeRound <= 1) return null;
    return run.rounds.find((r) => r.round === activeRound - 1) ?? null;
  }, [run, activeRound]);

  const currency = run?.input.currency ?? record?.currency ?? 'EUR';
  const progress = run ? Math.round((activeRound / run.rounds.length) * 100) : 0;

  /* ------------------- states ------------------- */

  if (loading || runner.running) {
    return (
      <div className="container-xl py-12">
        {runner.running ? (
          <RunProgress phase={runner.phase} percent={runner.percent} title={mode === 'demo' ? 'Generating demo simulation' : 'Running simulation'} />
        ) : (
          <div className="grid min-h-[40vh] place-items-center">
            <span className="h-8 w-8 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
          </div>
        )}
      </div>
    );
  }

  if (error || !run || !current) {
    return (
      <div className="container-xl py-16">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <h1 className="text-lg font-bold text-white">Simulation unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? 'No data was produced for this simulation.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => void bootstrap()}>
              Retry
            </button>
            <Link to="/dashboard" className="btn-primary">
              Back to my simulations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const meta = run.input;
  const isDemo = mode === 'demo';

  return (
    <div className="container-xl py-8 sm:py-10">
      {/* ------------------------- HEADER ------------------------- */}
      <header className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isDemo && <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-200">DEMO</span>}
              <span className={`badge ${statusTone(isDemo ? 'completed' : record?.status ?? 'completed')}`}>
                {isDemo ? 'completed' : record?.status ?? 'completed'}
              </span>
              <span className="badge border-white/15 bg-white/[0.06] text-slate-300">Business</span>
            </div>
            <h1 className="mt-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">{meta.name}</h1>
            <p className="mt-1.5 line-clamp-2 text-sm text-slate-400">{meta.description}</p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <Link to={`/simulation/${record?.id ?? 'demo'}/results`} className="btn-primary">
              View results
            </Link>
            {!isDemo && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/simulation/${record?.id}/results?whatif=1`)}
              >
                Create What-If Scenario
              </button>
            )}
            {isDemo && (
              <Link to="/simulate/new" className="btn-secondary">
                Run your own
              </Link>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs sm:grid-cols-4">
          {[
            ['Location', `${meta.city}, ${meta.country}`],
            ['Duration', `${meta.durationMonths} months`],
            ['Currency', meta.currency],
            ['Seed', String(run.seed)],
            ['Audience', meta.targetAudience],
            ['Budget', formatCurrency(meta.budget, meta.currency)],
            ['Price', formatCurrency(meta.price, meta.currency, 2)],
            ['Competitors', String(run.competitors.length)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="truncate font-semibold text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* --------------------- WORLD STATUS ----------------------- */}
      <section className="card mt-5 p-5" aria-labelledby="world">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="world" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            World status
          </h2>
          <span className="mono text-sm font-bold text-white">
            Month {activeRound} / {run.rounds.length}
          </span>
        </div>

        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-500 to-cyan-400 transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Simulation progress, month ${activeRound} of ${run.rounds.length}`}
          />
        </div>

        {/* Round scrubber */}
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Select simulation month">
          {run.rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              onClick={() => setActiveRound(r.round)}
              aria-pressed={r.round === activeRound}
              className={`mono rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                r.round === activeRound
                  ? 'border-electric-500/60 bg-electric-500/15 text-electric-200'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
              }`}
            >
              M{r.round}
            </button>
          ))}
        </div>
      </section>

      {/* ----------------------- KEY METRICS ---------------------- */}
      <section className="mt-5" aria-labelledby="metrics">
        <h2 id="metrics" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Key metrics — month {activeRound}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Customers"
            value={formatNumber(current.metrics.customers)}
            sub={`${current.metrics.newCustomers} new · ${current.metrics.returningCustomers} returning`}
            icon="◎"
            delta={prev ? ratioDelta(current.metrics.customers, prev.metrics.customers) : null}
          />
          <MetricCard
            label="Revenue"
            value={formatCurrency(current.metrics.revenue, currency)}
            sub={`${formatNumber(current.metrics.units)} units`}
            icon="◆"
            delta={prev ? ratioDelta(current.metrics.revenue, prev.metrics.revenue) : null}
          />
          <MetricCard
            label="Profit / Loss"
            value={formatCurrency(current.metrics.profit, currency)}
            tone={current.metrics.profit >= 0 ? 'positive' : 'negative'}
            sub={`Cumulative ${formatCurrency(current.metrics.cumulativeProfit, currency)}`}
            icon="◈"
            delta={prev ? ratioDelta(current.metrics.profit, prev.metrics.profit) : null}
          />
          <MetricCard
            label="Market share"
            value={formatPercent(current.metrics.marketShare, 1)}
            sub={`Pressure ${formatPercent(current.metrics.competitionPressure)}`}
            icon="◍"
            delta={prev ? current.metrics.marketShare - prev.metrics.marketShare : null}
          />
          <MetricCard
            label="Satisfaction"
            value={formatPercent(current.metrics.avgSatisfaction)}
            sub={`Retention ${formatPercent(current.metrics.retentionRate)}`}
            icon="✦"
            delta={prev ? current.metrics.avgSatisfaction - prev.metrics.avgSatisfaction : null}
          />
          <MetricCard
            label="Cash"
            value={formatCurrency(current.metrics.cashBalance, currency)}
            tone={current.metrics.cashBalance >= 0 ? 'default' : 'negative'}
            sub={`From ${formatCurrency(run.input.budget, currency)}`}
            icon="▤"
          />
        </div>
      </section>

      {/* ------------------ EXPLAINABILITY NOTE ------------------- */}
      {current.activity && (
        <section className="card mt-5 p-5" aria-labelledby="explain">
          <h2 id="explain" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Why these numbers
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>
              <span className="text-slate-500">Demand:</span> {formatNumber(current.metrics.demand, 1)} expected units
              {prev ? (
                <>
                  {' '}
                  ({current.activity.demandDelta >= 0 ? 'up' : 'down'}{' '}
                  {Math.abs(Math.round(current.activity.demandDelta * 100))}% vs month {prev.round})
                </>
              ) : (
                ' in the opening month'
              )}
              . Realised {formatNumber(current.metrics.units)} units after the {formatNumber(run.input.capacity)} / month
              capacity cap.
            </li>
            <li>
              <span className="text-slate-500">Awareness:</span> {formatPercent(current.metrics.awareness)} of the agent
              pool is aware, which gates every purchase decision.
            </li>
            <li>
              <span className="text-slate-500">Satisfaction:</span> {formatPercent(current.metrics.avgSatisfaction)}
              {prev && (
                <>
                  {' '}
                  ({current.activity.satisfactionDelta >= 0 ? '+' : ''}
                  {Math.round(current.activity.satisfactionDelta * 100)} pts vs month {prev.round})
                </>
              )}
              , which drives retention of {formatPercent(current.metrics.retentionRate)}.
            </li>
            <li>
              <span className="text-slate-500">Competition:</span>{' '}
              {current.activity.competitorActions.length === 0
                ? 'no competitor reacted this month.'
                : `${current.activity.competitorActions.length} competitor reaction(s) this month.`}{' '}
              Pressure index {formatPercent(current.metrics.competitionPressure)}.
            </li>
          </ul>
        </section>
      )}

      {/* ------------------------ CHARTS -------------------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Simulation charts">
        <MetricsTimelineChart rounds={run.rounds.filter((r) => r.round <= activeRound)} />
        <CustomersChart rounds={run.rounds.filter((r) => r.round <= activeRound)} />
        <HealthChart rounds={run.rounds.filter((r) => r.round <= activeRound)} />
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white">Engine explanation</h3>
          <p className="mt-1 text-xs text-slate-400">Generated from the actual metric series — not templates.</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
            {run.explanation.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="text-electric-400">
                  ▸
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ----------------------- TIMELINE ------------------------- */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-labelledby="tl">
        <div className="card p-5">
          <h2 id="tl" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Timeline — events up to month {activeRound}
          </h2>
          <div className="mt-4 max-h-[26rem] overflow-y-auto pr-1">
            <Timeline events={run.events.filter((e) => e.month <= activeRound)} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Round log — month {activeRound}
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {current.events.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/[0.12] px-4 py-5 text-center text-sm text-slate-400">
                No events fired in month {activeRound}.
              </li>
            ) : (
              current.events.map((e) => (
                <li key={e.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                  <span className="mono text-xs font-semibold text-electric-300">M{e.month}</span>
                  <span className="ml-2 text-sm text-slate-200">{e.description}</span>
                </li>
              ))
            )}
          </ul>

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Month in one line</h3>
          <p className="mt-2 rounded-xl border border-electric-500/25 bg-electric-500/[0.07] p-3.5 text-sm text-slate-200">
            {formatNumber(current.activity.purchases)} purchases from {formatNumber(run.customers.length)} agents ·{' '}
            {formatPercent(current.metrics.awareness)} aware · {formatPercent(current.metrics.avgSatisfaction)} satisfied ·{' '}
            {formatCurrency(current.metrics.profit, currency)} profit
            {current.activity.competitorActions.length > 0
              ? ` · ${current.activity.competitorActions.length} competitor reaction(s)`
              : ''}
            .
          </p>
        </div>
      </section>

      {/* -------------------- AGENT ACTIVITY ---------------------- */}
      <section className="mt-5" aria-labelledby="agents">
        <h2 id="agents" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Agent activity — month {activeRound} (aggregated)
        </h2>
        <AgentActivity round={current} customers={run.customers} competitors={run.competitors} />
      </section>

      {/* ---------------------- RESULTS CTA ----------------------- */}
      <section className="card mt-6 overflow-hidden p-6 text-center">
        <h2 className="text-lg font-bold text-white">Simulation complete</h2>
        <p className="mono mt-2 text-3xl font-extrabold text-white">{run.score.score} / 100</p>
        <p className="mt-1.5 text-xs text-slate-400">
          Simulation Score — a summary of how this scenario behaved. Not a prediction.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={`/simulation/${record?.id ?? 'demo'}/results`} className="btn-primary !px-6 !py-3">
            Open full results &amp; findings
          </Link>
          <Link to="/simulate/new" className="btn-secondary !px-6 !py-3">
            Start a new simulation
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Signed relative change, used for the metric delta chips. */
function ratioDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (Math.abs(previous) < 1e-9) return null;
  return (current - previous) / Math.abs(previous);
}
