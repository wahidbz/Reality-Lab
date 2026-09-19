import type { SimEvent } from '../types/simulation';

const SEVERITY: Record<SimEvent['severity'], string> = {
  low: 'border-white/15 bg-white/[0.06] text-slate-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  high: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
};

const TYPE_ICON: Partial<Record<SimEvent['type'], string>> & Record<string, string> = {
  business_launched: '◈',
  competitor_enters: '⚑',
  competitor_price_cut: '↓',
  competitor_marketing_push: '📣',
  competitor_quality_upgrade: '✦',
  demand_spike: '⬆',
  demand_decline: '⬇',
  marketing_success: '◉',
  marketing_failure: '⚠',
  satisfaction_increase: '+',
  satisfaction_decline: '−',
  cost_increase: '€',
  viral_exposure: '★',
  cash_warning: '!',
};

interface Props {
  events: SimEvent[];
  /** Limit shown (timeline paginates on long runs). */
  max?: number;
  compact?: boolean;
}

/** Chronological event timeline. Every row is a real engine event. */
export default function Timeline({ events, max, compact = false }: Props) {
  const items = [...events].sort((a, b) => a.month - b.month || a.type.localeCompare(b.type));
  const shown = typeof max === 'number' ? items.slice(0, max) : items;

  if (shown.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/[0.12] px-4 py-6 text-center text-sm text-slate-400">
        No events occurred in this scenario yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-white/10 pl-5">
      {shown.map((e, i) => (
        <li key={`${e.id}-${i}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[27px] top-1.5 grid h-4 w-4 place-items-center rounded-full border border-electric-500/50 bg-ink-900 text-[8px] text-electric-300"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-xs font-semibold text-electric-300">Month {e.month}</span>
            <span className={`badge ${SEVERITY[e.severity]}`}>
              {TYPE_ICON[e.type] ?? '•'} {e.type.replace(/_/g, ' ')}
            </span>
            <span className="mono text-[11px] text-slate-500">
              {e.impact.label}: {typeof e.impact.value === 'number' ? e.impact.value.toLocaleString('en-US') : e.impact.value}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">{e.description}</p>
          {!compact && <p className="mt-0.5 text-xs text-slate-500">Impact kind: {e.impact.kind}</p>}
        </li>
      ))}
      {typeof max === 'number' && items.length > max && (
        <li className="text-xs text-slate-500">+ {items.length - max} more events across the scenario.</li>
      )}
    </ol>
  );
}
