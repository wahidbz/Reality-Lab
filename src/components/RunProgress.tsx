import type { SimulationPhase } from '../simulation/engine';
import { PHASE_LABELS } from '../simulation/engine';

const ORDER: SimulationPhase[] = [
  'initializing',
  'creating_agents',
  'running_market',
  'processing_events',
  'calculating',
  'report',
  'complete',
];

interface Props {
  phase: SimulationPhase | null;
  percent: number;
  title?: string;
}

/**
 * Staged loading overlay with a progress bar and the labelled phases required
 * by the spec. Announced to assistive tech via role="status".
 */
export default function RunProgress({ phase, percent, title = 'Running simulation' }: Props) {
  const currentIndex = phase ? ORDER.indexOf(phase) : 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/85 p-4 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="card w-full max-w-md p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-full border border-electric-500/40 bg-electric-500/10"
          >
            <span className="block h-4 w-4 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-white">{title}</h2>
            <p className="text-xs text-slate-400">{phase ? PHASE_LABELS[phase] : 'Preparing...'}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-electric-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
          <p className="mono mt-2 text-right text-xs text-slate-400">{Math.round(percent)}%</p>
        </div>

        <ul className="mt-4 space-y-1.5">
          {ORDER.map((p, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <li
                key={p}
                className={`flex items-center gap-2 text-xs ${
                  done ? 'text-emerald-300' : active ? 'text-electric-300' : 'text-slate-500'
                }`}
              >
                <span aria-hidden="true">{done ? '✓' : active ? '▸' : '·'}</span>
                {PHASE_LABELS[p]}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
