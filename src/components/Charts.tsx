import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RoundMetrics, ScoreComponent, SimulationTotals } from '../types/simulation';
import { formatCompactCurrency, formatNumber, formatPercent } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Shared bits                                                        */
/* ------------------------------------------------------------------ */

const GRID = 'rgba(255,255,255,0.07)';
const AXIS = '#64748b';

function ChartTooltip({ active, payload, label, suffix = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/15 bg-ink-900/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-semibold text-white">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-slate-300">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="mono font-semibold text-white">{typeof p.value === 'number' ? p.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p.value}{suffix}</span>
        </p>
      ))}
    </div>
  );
}

const AXIS_PROPS = {
  stroke: AXIS,
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

/** Responsive chart shell — heights are viewport-aware so mobile never overflows. */
function Shell({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {note && <p className="mt-0.5 text-xs text-slate-400">{note}</p>}
      </div>
      <div className="h-56 w-full sm:h-64">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Metrics over time                                                  */
/* ------------------------------------------------------------------ */

export function MetricsTimelineChart({ rounds }: { rounds: { round: number; metrics: RoundMetrics }[] }) {
  const data = useMemo(
    () =>
      rounds.map((r) => ({
        month: `M${r.round}`,
        Revenue: r.metrics.revenue,
        Costs: r.metrics.totalCost,
        Profit: r.metrics.profit,
      })),
    [rounds],
  );

  return (
    <Shell title="Revenue vs. costs vs. profit" note="Monthly figures produced by the simulation engine.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={(v: number) => formatCompactCurrency(v).replace(/\s?[A-Z]{3}$/, '')} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <Line type="monotone" dataKey="Revenue" stroke="#4d8bff" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Costs" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Profit" stroke="#34d399" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Shell>
  );
}

export function CustomersChart({ rounds }: { rounds: { round: number; metrics: RoundMetrics }[] }) {
  const data = useMemo(
    () =>
      rounds.map((r) => ({
        month: `M${r.round}`,
        Customers: r.metrics.customers,
        New: r.metrics.newCustomers,
        Returning: r.metrics.returningCustomers,
      })),
    [rounds],
  );

  return (
    <Shell title="Customers over time" note="Total monthly buyers split into new vs. returning.">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b6cff" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#2b6cff" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38d9ff" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#38d9ff" stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={40} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <Area type="monotone" dataKey="New" stackId="1" stroke="#4d8bff" fill="url(#gNew)" strokeWidth={1.5} />
          <Area type="monotone" dataKey="Returning" stackId="1" stroke="#38d9ff" fill="url(#gRet)" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </Shell>
  );
}

export function CashChart({ rounds, currency }: { rounds: { round: number; metrics: RoundMetrics }[]; currency: string }) {
  const data = useMemo(
    () =>
      rounds.map((r) => ({
        month: `M${r.round}`,
        Cash: r.metrics.cashBalance,
        'Market share %': Math.round(r.metrics.marketShare * 1000) / 10,
        'Satisfaction %': Math.round(r.metrics.avgSatisfaction * 1000) / 10,
        'Awareness %': Math.round((r.metrics.awareness ?? 0) * 1000) / 10,
      })),
    [rounds],
  );

  return (
    <Shell title={`Cash balance (${currency})`} note="Cumulative profit applied to the starting budget each month.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={(v: number) => formatCompactCurrency(v).replace(/\s?[A-Z]{3}$/, '')} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="Cash" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.Cash >= 0 ? '#2b6cff' : '#f43f5e'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Shell>
  );
}

export function HealthChart({ rounds }: { rounds: { round: number; metrics: RoundMetrics }[] }) {
  const data = useMemo(
    () =>
      rounds.map((r) => ({
        month: `M${r.round}`,
        'Market share %': Math.round(r.metrics.marketShare * 1000) / 10,
        'Retention %': Math.round(r.metrics.retentionRate * 1000) / 10,
        'Satisfaction %': Math.round(r.metrics.avgSatisfaction * 1000) / 10,
        'Awareness %': Math.round((r.metrics.awareness ?? 0) * 1000) / 10,
        'Comp. pressure %': Math.round(r.metrics.competitionPressure * 1000) / 10,
      })),
    [rounds],
  );

  return (
    <Shell title="Market health indicators" note="All values are percentages, so they share one axis.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={40} domain={[0, 100]} />
          <Tooltip content={<ChartTooltip suffix="%" />} />
          <Legend wrapperStyle={{ fontSize: 10, color: AXIS }} />
          <Line type="monotone" dataKey="Awareness %" stroke="#7aa7ff" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="Satisfaction %" stroke="#34d399" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="Retention %" stroke="#38d9ff" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="Market share %" stroke="#f59e0b" strokeWidth={1.8} dot={false} />
          <Line type="monotone" dataKey="Comp. pressure %" stroke="#f43f5e" strokeWidth={1.8} strokeDasharray="4 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Score views                                                        */
/* ------------------------------------------------------------------ */

export function ScoreRadar({ components }: { components: ScoreComponent[] }) {
  const data = components.map((c) => ({
    subject: c.label,
    score: Math.round(c.value * 100),
  }));

  return (
    <Shell title="Score composition" note="Each axis is a normalized sub-score (0–100) from the simulation metrics.">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={GRID} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: AXIS, fontSize: 10 }} />
          <Radar dataKey="score" stroke="#4d8bff" fill="#2b6cff" fillOpacity={0.35} />
          <Tooltip content={<ChartTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/** Horizontal weighted-contribution bars. */
export function ScoreBreakdown({ components }: { components: ScoreComponent[] }) {
  const max = Math.max(...components.map((c) => c.weight * 100));
  return (
    <ul className="space-y-3">
      {components.map((c) => (
        <li key={c.key}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-slate-200">
              {c.label} <span className="text-slate-500">· weight {Math.round(c.weight * 100)}%</span>
            </span>
            <span className="mono text-slate-300">
              {Math.round(c.value * 100)}/100 → {c.points.toFixed(1)} pts
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-electric-500 to-cyan-400"
              style={{ width: `${((c.weight * 100) / max) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{c.explanation}</p>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison                                                         */
/* ------------------------------------------------------------------ */

export interface CompareSeriesPoint {
  label: string;
  original: number;
  variant: number;
}

export function ComparisonBars({ data, currency, unit }: { data: CompareSeriesPoint[]; currency?: string; unit?: string }) {
  return (
    <Shell title="Original vs. variant" note={currency ? `Values in ${currency}.` : unit}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} angle={-18} textAnchor="end" height={52} />
          <YAxis {...AXIS_PROPS} width={50} tickFormatter={(v: number) => formatCompactCurrency(v).replace(/\s?[A-Z]{3}$/, '')} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <Bar dataKey="original" name="Original" fill="#4d8bff" radius={[4, 4, 0, 0]} />
          <Bar dataKey="variant" name="Variant" fill="#38d9ff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Shell>
  );
}

export function ComparisonTrendChart({
  rounds,
  variantRounds,
  metric,
  label,
}: {
  rounds: { round: number; metrics: RoundMetrics }[];
  variantRounds: { round: number; metrics: RoundMetrics }[];
  metric: keyof RoundMetrics;
  label: string;
}) {
  const len = Math.max(rounds.length, variantRounds.length);
  const data = Array.from({ length: len }, (_, i) => ({
    month: `M${i + 1}`,
    Original: (rounds[i]?.metrics?.[metric] as number) ?? null,
    Variant: (variantRounds[i]?.metrics?.[metric] as number) ?? null,
  }));

  return (
    <Shell title={`${label} — month by month`} note="Both runs share the same seed, so differences come from the changed variables.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={50} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
          <Line type="monotone" dataKey="Original" stroke="#4d8bff" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="Variant" stroke="#38d9ff" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Totals table (used on results + comparison)                        */
/* ------------------------------------------------------------------ */

export function TotalsGrid({ totals, currency }: { totals: SimulationTotals; currency: string }) {
  const rows: [string, string][] = [
    ['Total revenue', formatCompactCurrency(totals.totalRevenue, currency)],
    ['Total cost', formatCompactCurrency(totals.totalCost, currency)],
    ['Total profit', formatCompactCurrency(totals.totalProfit, currency)],
    ['Marketing spend', formatCompactCurrency(totals.totalMarketing, currency)],
    ['Units sold', formatNumber(totals.totalUnits)],
    ['New customers', formatNumber(totals.totalNewCustomers)],
    ['Returning customers', formatNumber(totals.totalReturningCustomers)],
    ['Avg monthly customers', formatNumber(totals.avgMonthlyCustomers, 1)],
    ['Peak customers', formatNumber(totals.peakCustomers)],
    ['Avg retention', formatPercent(totals.avgRetention)],
    ['Avg satisfaction', formatPercent(totals.avgSatisfaction)],
    ['Final market share', formatPercent(totals.finalMarketShare, 1)],
    ['Final cash', formatCompactCurrency(totals.finalCash, currency)],
    ['Breakeven month', totals.breakevenMonth ? `Month ${totals.breakevenMonth}` : 'Never'],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.08] pb-2">
          <dt className="text-xs text-slate-400">{k}</dt>
          <dd className="mono text-sm font-semibold text-white">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
