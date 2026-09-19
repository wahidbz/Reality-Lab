import { Link } from 'react-router-dom';
import type { SimulationListItem } from '../types/simulation';
import { formatDate, relativeTime, statusTone } from '../lib/format';

interface Props {
  simulation: SimulationListItem;
  onOpen?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
  /** Explore cards link to the read-only demo route instead of the owner route. */
  href?: string;
}

export default function SimulationCard({
  simulation: s,
  onOpen,
  onDuplicate,
  onDelete,
  showActions = false,
  href,
}: Props) {
  const score = typeof s.score === 'number' ? s.score : null;
  const target = href ?? `/simulation/${s.id}`;

  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={target} className="block truncate text-base font-bold text-white hover:text-electric-300">
            {s.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.description || 'No description provided.'}</p>
        </div>
        <span className={`badge shrink-0 ${statusTone(s.status)}`}>{s.status}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-500">Type</dt>
          <dd className="font-medium capitalize text-slate-200">{s.type}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Location</dt>
          <dd className="truncate font-medium text-slate-200">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Created</dt>
          <dd className="text-slate-300" title={s.created_at}>
            {formatDate(s.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Updated</dt>
          <dd className="text-slate-300">{relativeTime(s.updated_at)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Result</span>
          <div className="mono text-lg font-bold text-white">
            {score === null ? <span className="text-sm text-slate-400">Not run</span> : `${score} / 100`}
          </div>
        </div>
        {s.parent_simulation_id && (
          <span className="badge border-electric-500/30 bg-electric-500/10 text-electric-300">What-If</span>
        )}
      </div>

      {showActions && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={target} className="btn-primary flex-1 !py-2 text-xs" onClick={() => onOpen?.(s.id)}>
            Open
          </Link>
          <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => onDuplicate?.(s.id)}>
            Duplicate
          </button>
          <button type="button" className="btn-danger !py-2 text-xs" onClick={() => onDelete?.(s.id)}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
