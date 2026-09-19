import { supabaseConfigMessage, isSupabaseConfigured } from '../lib/supabase';

/**
 * Shown when Supabase env vars are missing. It explains local mode instead of
 * crashing — the whole product still works.
 */
export default function ConfigNotice({ compact = false }: { compact?: boolean }) {
  if (isSupabaseConfigured) return null;

  return (
    <div
      role="status"
      className={`card border-amber-500/25 bg-amber-500/[0.06] ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex gap-3">
        <span aria-hidden="true" className="text-lg text-amber-300">
          ⚙
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-200">Running in local mode</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">{supabaseConfigMessage}</p>
        </div>
      </div>
    </div>
  );
}
