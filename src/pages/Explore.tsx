import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import { DEMO_SCENARIOS, runDemo } from '../simulation/scenarios';
import type { SimulationListItem, SimulationRun } from '../types/simulation';
import ConfigNotice from '../components/ConfigNotice';
import SimulationCard from '../components/SimulationCard';
import { formatNumber } from '../lib/format';

type Tab = 'demos' | 'community';

export default function Explore() {
  const { user } = useAuth();
  const repo = getRepository();

  const [tab, setTab] = useState<Tab>('demos');
  const [community, setCommunity] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Built-in demos — executed through the real engine so the score on each
     card is genuine, not a stored number. */
  const demos = useMemo(
    () =>
      DEMO_SCENARIOS.map((d) => ({ demo: d, run: runDemo(d.slug) as SimulationRun | null })).filter(
        (d) => d.run !== null,
      ),
    [],
  );

  const loadCommunity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCommunity(await repo.listPublic());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load public simulations.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void loadCommunity();
  }, [loadCommunity]);

  const items = tab === 'demos' ? demos : [];

  return (
    <div className="container-xl py-10">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Explore simulations</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Public and demo scenarios. Only simulations explicitly marked public appear here — private work stays
          private.
        </p>
      </header>

      <div className="mt-5">
        <ConfigNotice compact />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2" role="tablist" aria-label="Simulation sources">
        {(
          [
            ['demos', `Built-in demos (${demos.length})`],
            ['community', `Public simulations${community.length ? ` (${community.length})` : ''}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              tab === key
                ? 'border-electric-500/50 bg-electric-500/15 text-electric-200'
                : 'border-white/[0.12] bg-white/[0.04] text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {/* ------------------------- DEMOS ------------------------- */}
      {tab === 'demos' && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ demo, run }) =>
            run ? (
              <article key={demo.slug} className="card card-hover flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-200">DEMO</span>
                  <span className="mono text-lg font-extrabold text-white">{run.score.score} / 100</span>
                </div>
                <h2 className="mt-3 text-base font-bold text-white">{demo.name}</h2>
                <p className="mt-1.5 line-clamp-3 text-sm text-slate-400">{demo.description}</p>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Type</dt>
                    <dd className="font-medium capitalize text-slate-200">{demo.input.type}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Location</dt>
                    <dd className="truncate font-medium text-slate-200">
                      {demo.input.city}, {demo.input.country}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Agents</dt>
                    <dd className="mono text-slate-200">{formatNumber(run.customers.length)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Months</dt>
                    <dd className="mono text-slate-200">{run.rounds.length}</dd>
                  </div>
                </dl>

                <Link to={`/simulation/demo/${demo.slug}`} className="btn-primary mt-5 w-full !py-2 text-xs">
                  View Simulation
                </Link>
              </article>
            ) : null,
          )}
        </div>
      )}

      {/* ------------------------ COMMUNITY ---------------------- */}
      {tab === 'community' && (
        <>
          {loading ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="card h-52 animate-pulseSoft bg-white/[0.03]" />
              ))}
            </div>
          ) : community.length === 0 ? (
            <div className="card mt-6 p-8 text-center">
              <p className="text-sm text-slate-300">No public simulations yet.</p>
              <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
                Public simulations are opt-in. Run a simulation and mark it public to share it here.
              </p>
              <Link to="/simulate/new" className="btn-primary mt-5">
                Run a Simulation
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {community.map((s) => (
                <SimulationCard key={s.id} simulation={s} href={`/simulation/${s.id}`} />
              ))}
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <section className="card mt-10 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-base font-bold text-white">
            {user ? 'Ready to test your own idea?' : 'Sign in to run your own simulations'}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {user
              ? 'Describe a business idea and the engine will simulate a market for you.'
              : 'Google or email sign-in, or continue as a local demo user — no setup required.'}
          </p>
        </div>
        <Link to={user ? '/simulate/new' : '/login'} className="btn-primary !px-6 !py-3">
          {user ? 'Run a Simulation' : 'Sign in'}
        </Link>
      </section>
    </div>
  );
}
