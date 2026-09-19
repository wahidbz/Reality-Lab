import type { CompetitorAgent, CustomerAgent, RoundResult } from '../types/simulation';
import { formatNumber, formatPercent } from '../lib/format';

interface Props {
  round: RoundResult;
  customers: CustomerAgent[];
  competitors: CompetitorAgent[];
}

/**
 * Aggregated agent activity — 100+ customers are NEVER rendered individually.
 * Segment bars + a competitor action feed instead.
 */
export default function AgentActivity({ round, customers, competitors }: Props) {
  const segments = new Map<string, number>();
  for (const c of customers) {
    segments.set(c.locationSegment, (segments.get(c.locationSegment) ?? 0) + 1);
  }
  const maxSegment = Math.max(1, ...segments.values());

  const priceSensitivityBuckets = [
    { label: 'Low price sensitivity', test: (c: CustomerAgent) => c.priceSensitivity < 0.4 },
    { label: 'Medium', test: (c: CustomerAgent) => c.priceSensitivity >= 0.4 && c.priceSensitivity < 0.7 },
    { label: 'High price sensitivity', test: (c: CustomerAgent) => c.priceSensitivity >= 0.7 },
  ].map((b) => ({ label: b.label, count: customers.filter(b.test).length }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Customer aggregation */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Customers — aggregated
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Purchased" value={formatNumber(round.activity.purchases)} tone="accent" />
          <Stat label="New" value={formatNumber(round.activity.newCustomers)} />
          <Stat label="Returning" value={formatNumber(round.activity.returningCustomers)} tone="positive" />
          <Stat label="Aware" value={formatNumber(round.activity.awareCustomers)} />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Awareness conversion
        </p>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-500 to-cyan-400 transition-all"
            style={{ width: `${Math.round((round.metrics.awareness ?? 0) * 100)}%` }}
            role="progressbar"
            aria-valuenow={Math.round((round.metrics.awareness ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Average awareness"
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">
          Average awareness {formatPercent(round.metrics.awareness)} · satisfaction {formatPercent(round.metrics.avgSatisfaction)}
        </p>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Customer segments
        </p>
        <ul className="mt-2 space-y-2">
          {[...segments.entries()].map(([seg, count]) => (
            <li key={seg} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs capitalize text-slate-400">{seg.replace(/_/g, ' ')}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className="block h-full rounded-full bg-electric-500/70"
                  style={{ width: `${(count / maxSegment) * 100}%` }}
                />
              </span>
              <span className="mono w-8 text-right text-xs text-slate-300">{count}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Price sensitivity mix
        </p>
        <ul className="mt-2 space-y-1.5">
          {priceSensitivityBuckets.map((b) => (
            <li key={b.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{b.label}</span>
              <span className="mono text-slate-200">{b.count} agents</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Competitor feed */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Competitors — reactions this month
        </h3>

        {round.activity.competitorActions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/[0.12] px-4 py-6 text-center text-sm text-slate-400">
            No competitor reacted in month {round.round}. Competitors only move when the business gains share.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {round.activity.competitorActions.map((a, i) => (
              <li key={i} className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <span className="text-sm font-semibold text-white">{a.competitor}</span>
                <span className="ml-2 text-sm text-slate-300">{a.action}</span>
              </li>
            ))}
          </ul>
        )}

        <h4 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Market structure
        </h4>
        <ul className="mt-2 space-y-2">
          {competitors.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-slate-300">
                {c.name}
                <span className="ml-1.5 text-slate-500">({c.strategy.replace(/_/g, ' ')})</span>
              </span>
              <span className="mono shrink-0 text-slate-400">
                {c.price.toFixed(2)} · {formatPercent(c.marketShare)} share
              </span>
            </li>
          ))}
          {competitors.length === 0 && <li className="text-xs text-slate-400">No competitors in this scenario.</li>}
        </ul>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Competitive pressure</p>
          <p className="mono mt-1 text-xl font-bold text-white">{formatPercent(round.metrics.competitionPressure)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Combines competitor marketing power, delivered quality and their price advantage over you.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' | 'positive' }) {
  const color = tone === 'accent' ? 'text-electric-300' : tone === 'positive' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mono mt-0.5 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
