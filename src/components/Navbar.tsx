import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** The RL orbit mark — pure SVG, no external assets. */
export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Reality Lab logo"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="rlRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2b6cff" />
            <stop offset="100%" stopColor="#38d9ff" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="15" fill="#070b16" stroke="rgba(255,255,255,0.09)" />
        <circle
          cx="32"
          cy="32"
          r="21"
          fill="none"
          stroke="url(#rlRing)"
          strokeWidth="2"
          strokeDasharray="96 22"
          className="origin-center motion-safe:animate-orbit"
          style={{ transformBox: 'fill-box' }}
        />
        <circle cx="32" cy="32" r="13" fill="none" stroke="#38d9ff" strokeWidth="1.6" opacity="0.65" />
        <circle cx="53" cy="32" r="3.2" fill="#4d8bff" />
        <text
          x="32"
          y="40.5"
          textAnchor="middle"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="19"
          fontWeight="700"
          fill="#ffffff"
        >
          RL
        </text>
      </svg>
      {withText && (
        <span className="text-[15px] font-extrabold tracking-[0.16em] text-white">
          REALITY<span className="text-electric-400">LAB</span>
        </span>
      )}
    </span>
  );
}

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/simulate/new', label: 'Create' },
  { to: '/dashboard', label: 'My Simulations' },
  { to: '/profile', label: 'Profile' },
];

export default function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const isDemoRoute = location.pathname.startsWith('/explore') || location.pathname.startsWith('/simulation/demo');

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 backdrop-blur-xl">
        <nav className="container-xl flex h-16 items-center justify-between gap-4" aria-label="Main">
          <Link to="/" className="rounded-lg" aria-label="Reality Lab home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link to="/simulate/new" className="btn-primary hidden !px-3.5 !py-2 text-xs sm:inline-flex">
              Run a Simulation
            </Link>
            {user ? (
              <Link
                to="/profile"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 text-xs font-bold text-electric-300"
                aria-label={`Signed in as ${user.displayName}`}
              >
                {user.displayName.slice(0, 1).toUpperCase()}
              </Link>
            ) : (
              <Link to="/login" className="btn-secondary !px-3.5 !py-2 text-xs">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Mobile bottom navigation — large touch targets, safe-area aware. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 backdrop-blur-xl md:hidden safe-bottom"
        aria-label="Mobile"
      >
        <ul className="grid grid-cols-5">
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-semibold transition ${
                    isActive ? 'text-electric-300' : 'text-slate-500'
                  }`
                }
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {l.label === 'Home' ? '◇' : l.label === 'Explore' ? '◎' : l.label === 'Create' ? '✚' : l.label === 'My Simulations' ? '▤' : '◍'}
                </span>
                <span className="truncate">{l.label === 'My Simulations' ? 'Mine' : l.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Spacer so content never hides behind the mobile nav. */}
      {!isDemoRoute && <div className="h-16 md:hidden" aria-hidden="true" />}
      <div className="h-16 md:hidden" aria-hidden="true" />
    </>
  );
}
