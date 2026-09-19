import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getRepository } from '../lib/store';
import { isSupabaseConfigured } from '../lib/supabase';
import { isAiConfigured } from '../lib/ai';
import { LOCALES } from '../lib/i18n';
import type { SimulationListItem } from '../types/simulation';
import ConfigNotice from '../components/ConfigNotice';
import { formatDate, formatNumber } from '../lib/format';

export default function Profile() {
  const { user, signOut, updateProfile, cloudAuth } = useAuth();
  const navigate = useNavigate();
  const repo = getRepository();

  const [items, setItems] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await repo.list(user.id));
    } finally {
      setLoading(false);
    }
  }, [repo, user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setName(user?.displayName ?? '');
  }, [user]);

  if (!user) return null;

  const completed = items.filter((i) => i.status === 'completed').length;
  const withVariants = items.filter((i) => i.parent_simulation_id).length;
  const bestScore = items.reduce<number | null>((best, i) => {
    if (typeof i.score !== 'number') return best;
    return best === null ? i.score : Math.max(best, i.score);
  }, null);

  const saveName = async () => {
    if (!name.trim() || name === user.displayName) return;
    setSaving(true);
    await updateProfile({ display_name: name.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="container-xl py-10">
      <header className="flex flex-wrap items-center gap-5">
        <span
          aria-hidden="true"
          className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-electric-500/30 bg-gradient-to-br from-electric-500/25 to-cyan-400/10 text-2xl font-extrabold text-electric-200"
        >
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Profile</h1>
          <p className="mt-1 truncate text-sm text-slate-400">{user.email || 'Local demo account'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`badge ${user.isDemo ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
              {user.isDemo ? 'Local demo account' : 'Authenticated account'}
            </span>
            <span className="badge border-white/15 bg-white/[0.06] text-slate-300">
              Storage: {repo.kind === 'cloud' ? 'Supabase cloud' : 'This browser'}
            </span>
          </div>
        </div>
        <Link to="/simulate/new" className="btn-primary sm:ml-auto">
          + New Simulation
        </Link>
      </header>

      <div className="mt-6">
        <ConfigNotice compact />
      </div>

      {/* ---------------------- STATS ---------------------- */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Your statistics">
        {[
          ['Simulations', loading ? '—' : formatNumber(items.length)],
          ['Completed', loading ? '—' : formatNumber(completed)],
          ['What-If variants', loading ? '—' : formatNumber(withVariants)],
          ['Best score', bestScore === null ? '—' : `${bestScore}/100`],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mono mt-1 text-xl font-bold text-white">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* ---------------------- SETTINGS ---------------------- */}
        <section className="card p-5 lg:col-span-2" aria-labelledby="settings">
          <h2 id="settings" className="text-lg font-bold text-white">
            Settings
          </h2>

          <div className="mt-5">
            <label htmlFor="displayName" className="label">
              Display name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="displayName"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={saveName} disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              No phone number is ever requested. Sign-in uses Google or email links only.
            </p>
          </div>

          <div className="mt-6">
            <p className="label">Language</p>
            <div className="flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <span
                  key={l.code}
                  className={`badge ${
                    l.enabled
                      ? 'border-electric-500/30 bg-electric-500/10 text-electric-200'
                      : 'border-white/[0.12] bg-white/[0.04] text-slate-500'
                  }`}
                >
                  {l.label}
                  {!l.enabled && ' · soon'}
                  {l.dir === 'rtl' && l.enabled && ' · RTL ready'}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              MVP 0.1 ships English. The translation layer and right-to-left support are already wired in, so Arabic,
              French, German and Spanish can be added by dropping in a dictionary.
            </p>
          </div>

          <div className="mt-6">
            <p className="label">Runtime capabilities</p>
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center gap-2">
                <span className={cloudAuth ? 'text-emerald-300' : 'text-slate-500'}>{cloudAuth ? '✓' : '·'}</span>
                <span className="text-slate-300">
                  Supabase cloud {cloudAuth ? 'connected' : 'not configured (local storage in use)'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className={isAiConfigured ? 'text-emerald-300' : 'text-slate-500'}>{isAiConfigured ? '✓' : '·'}</span>
                <span className="text-slate-300">
                  AI helper {isAiConfigured ? 'configured' : 'not configured (deterministic engine only)'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-300">✓</span>
                <span className="text-slate-300">Simulation engine always available and deterministic</span>
              </li>
            </ul>
          </div>

          <div className="mt-7 border-t border-white/10 pt-5">
            <button type="button" className="btn-danger" onClick={() => setConfirmSignOut(true)}>
              Sign out
            </button>
          </div>
        </section>

        {/* ---------------------- RECENT ---------------------- */}
        <section className="card p-5" aria-labelledby="recent">
          <h2 id="recent" className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Recent simulations
          </h2>
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulseSoft rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">No simulations yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {items.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/simulation/${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 transition hover:border-electric-500/35"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-200">{s.name}</span>
                      <span className="text-[11px] text-slate-500">{formatDate(s.created_at)}</span>
                    </span>
                    <span className="mono shrink-0 text-sm font-bold text-white">
                      {typeof s.score === 'number' ? s.score : '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {items.length > 6 && (
            <Link to="/dashboard" className="btn-ghost mt-3 w-full text-xs">
              View all {items.length}
            </Link>
          )}
        </section>
      </div>

      {/* Sign-out confirmation */}
      {confirmSignOut && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="so-title">
          <div className="card w-full max-w-sm p-6">
            <h2 id="so-title" className="text-base font-bold text-white">
              Sign out?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {repo.kind === 'cloud'
                ? 'Your simulations stay safe in your account.'
                : 'Simulations saved in this browser stay here, but you will need to sign in again to see them.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={async () => {
                  setConfirmSignOut(false);
                  await signOut();
                  navigate('/', { replace: true });
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-slate-500">
        {isSupabaseConfigured
          ? 'Row Level Security is enabled on every table: only you can read, update or delete your own simulations.'
          : 'Running locally: nothing leaves your browser until Supabase is configured.'}
      </p>
    </div>
  );
}
