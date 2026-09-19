import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import type { SimulationListItem } from '../types/simulation';
import SimulationCard from '../components/SimulationCard';
import ConfigNotice from '../components/ConfigNotice';
import { formatNumber } from '../lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const repo = getRepository();

  const [items, setItems] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'draft' | 'running' | 'failed'>('all');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await repo.list(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your simulations.');
    } finally {
      setLoading(false);
    }
  }, [repo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const base = { draft: 0, running: 0, completed: 0, failed: 0 };
    for (const i of items) base[i.status] = (base[i.status] ?? 0) + 1;
    return base;
  }, [items]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const handleDuplicate = async (id: string) => {
    if (!user) return;
    await repo.duplicate(id, user.id);
    await load();
  };

  const handleDelete = async (id: string) => {
    await repo.remove(id);
    setConfirmId(null);
    await load();
  };

  return (
    <div className="container-xl py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Welcome back{user?.displayName ? `, ${user.displayName}` : ''}.
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {items.length === 0
              ? 'Your simulations will appear here once you run one.'
              : `${formatNumber(items.length)} simulation${items.length === 1 ? '' : 's'} in ${repo.kind === 'cloud' ? 'your account' : 'this browser'}.`}
          </p>
        </div>
        <Link to="/simulate/new" className="btn-primary">
          + New Simulation
        </Link>
      </header>

      <div className="mt-6">
        <ConfigNotice compact />
      </div>

      {/* Status summary */}
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Completed', counts.completed, 'border-emerald-500/25 text-emerald-300'],
            ['Running', counts.running, 'border-electric-500/25 text-electric-300'],
            ['Draft', counts.draft, 'border-white/[0.12] text-slate-300'],
            ['Failed', counts.failed, 'border-rose-500/25 text-rose-300'],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className={`card border ${tone} px-4 py-3`}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</dt>
            <dd className="mono mt-1 text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Filter */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-bold text-white">My Simulations</h2>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'completed', 'running', 'draft', 'failed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                filter === f
                  ? 'border-electric-500/50 bg-electric-500/15 text-electric-200'
                  : 'border-white/[0.12] bg-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-56 animate-pulseSoft bg-white/[0.03]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-sm text-slate-300">
            {items.length === 0 ? 'No simulations yet.' : `No simulations with status “${filter}”.`}
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
            Describe a business idea, pick a location, and let the simulation engine run the market for you.
          </p>
          <Link to="/simulate/new" className="btn-primary mt-5">
            + New Simulation
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <SimulationCard
              key={s.id}
              simulation={s}
              showActions
              onOpen={(id) => navigate(`/simulation/${id}`)}
              onDuplicate={handleDuplicate}
              onDelete={(id) => setConfirmId(id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation — irreversible actions always ask first. */}
      {confirmId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="del-title">
          <div className="card w-full max-w-sm p-6">
            <h2 id="del-title" className="text-base font-bold text-white">
              Delete this simulation?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              This permanently removes the simulation, its rounds, events and results. What-If variants keep
              their own copy.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmId(null)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={() => handleDelete(confirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
