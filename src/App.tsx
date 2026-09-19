import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './lib/AuthProvider';
import { useAuth } from './lib/auth';

import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateSimulation from './pages/CreateSimulation';
import SimulationPage from './pages/Simulation';
import Results from './pages/Results';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import Comparison from './pages/Comparison';
import NotFound from './pages/NotFound';

/** Gate for pages that need an account (local demo counts as an account). */
function RequireUser({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function PageSpinner({ label }: { label: string }) {
  return (
    <div className="container-xl grid min-h-[50vh] place-items-center">
      <div className="text-center">
        <span className="mx-auto block h-8 w-8 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
        <p className="mt-3 text-sm text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/** Footer with the mandatory disclaimer on every page. */
function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 py-8 md:mb-0">
      <div className="container-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold tracking-[0.16em] text-slate-400">
            REALITY<span className="text-electric-400">LAB</span>
          </span>
          <span>MVP 0.1 · Business simulations</span>
          <Link to="/explore" className="hover:text-slate-300">
            Explore
          </Link>
          <Link to="/simulate/new" className="hover:text-slate-300">
            New simulation
          </Link>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-slate-500">
          Simulation results are scenario-based simulations, not predictions or guarantees of real-world
          outcomes.
        </p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-electric-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col">
          <Navbar />
          <main id="main" className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/explore" element={<Explore />} />
              <Route
                path="/dashboard"
                element={
                  <RequireUser>
                    <Dashboard />
                  </RequireUser>
                }
              />
              <Route
                path="/simulate/new"
                element={
                  <RequireUser>
                    <CreateSimulation />
                  </RequireUser>
                }
              />
              {/* Demo route — public, no login required, runs the real engine. */}
              <Route path="/simulation/demo/:slug" element={<SimulationPage mode="demo" />} />
              <Route path="/simulation/:id" element={<SimulationPage mode="own" />} />
              <Route path="/simulation/:id/results" element={<Results />} />
              <Route path="/compare/:originalId/:variantId" element={<Comparison />} />
              <Route
                path="/profile"
                element={
                  <RequireUser>
                    <Profile />
                  </RequireUser>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </ErrorBoundary>
    </AuthProvider>
  );
}
