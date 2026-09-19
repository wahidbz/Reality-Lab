import type { ReactNode } from 'react';

export type MetricTone = 'default' | 'positive' | 'negative' | 'accent';

const TONE: Record<MetricTone, string> = {
  default: 'text-white',
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  accent: 'text-electric-300',
};

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: MetricTone;
  icon?: string;
  hint?: string;
  delta?: number | null;
  deltaSuffix?: string;
}

/**
 * A single metric tile. `delta` renders a signed change chip derived from real
 * round data (never hard-coded).
 */
export default function MetricCard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  hint,
  delta,
  deltaSuffix = '',
}: Props) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const deltaPositive = hasDelta && (delta as number) >= 0;

  return (
    <div className="card card-hover p-4" title={hint}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        {icon && (
          <span aria-hidden="true" className="text-sm text-electric-400/80">
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-2 text-xl font-bold tracking-tight mono sm:text-2xl ${TONE[tone]}`}>{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {sub && <span className="text-xs text-slate-400">{sub}</span>}
        {hasDelta && (
          <span
            className={`badge ${
              deltaPositive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {deltaPositive ? '▲' : '▼'} {Math.abs(Math.round((delta as number) * 100))}
            {deltaSuffix || '%'}
          </span>
        )}
      </div>
    </div>
  );
}
