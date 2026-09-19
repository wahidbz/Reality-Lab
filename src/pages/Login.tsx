import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ConfigNotice from '../components/ConfigNotice';
import { Logo } from '../components/Navbar';

export default function Login() {
  const { user, loading, cloudAuth, signInWithGoogle, signInWithEmail, verifyEmailOtp, signInAsDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const redirectTo = location.state?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="container-xl grid min-h-[60vh] place-items-center">
        <span className="h-8 w-8 rounded-full border-2 border-electric-400 border-t-transparent motion-safe:animate-spin" />
      </div>
    );
  }

  if (user) return <Navigate to={redirectTo} replace />;

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await signInWithGoogle();
    setBusy(false);
    if (err) setError(err);
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true);
    const { error: err, sent } = await signInWithEmail(email);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (sent) {
      setStep('sent');
      setInfo(`We sent a sign-in link and a 6-digit code to ${email}. Open the link, or enter the code below.`);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await verifyEmailOtp(email, code.trim());
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="container-xl py-12 sm:py-20">
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center text-center">
          <Logo size={44} withText={false} />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">Sign in to Reality Lab</h1>
          <p className="mt-2 text-sm text-slate-400">
            Continue with Google or an email link. No passwords, no phone numbers.
          </p>
        </div>

        <div className="mt-6">
          <ConfigNotice compact />
        </div>

        <div className="card mt-5 p-6">
          {error && (
            <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {info}
            </p>
          )}

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy || !cloudAuth}
            className="btn-secondary w-full !py-3"
            aria-describedby={!cloudAuth ? 'google-help' : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C37.3 41.1 44 36 44 24c0-1.3-.1-2.6-.4-3.9z"/>
            </svg>
            Continue with Google
          </button>
          {!cloudAuth && (
            <p id="google-help" className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Google sign-in becomes available once Supabase is configured. Use the demo account below in the
              meantime.
            </p>
          )}

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {/* Email */}
          {step === 'idle' ? (
            <form onSubmit={handleEmail} noValidate>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary mt-3 w-full !py-3" disabled={busy || !cloudAuth}>
                {busy ? 'Sending…' : 'Continue with Email'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} noValidate>
              <label htmlFor="code" className="label">
                6-digit code from your email
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="input mono tracking-[0.4em]"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
              <button type="submit" className="btn-primary mt-3 w-full !py-3" disabled={busy || code.length < 6}>
                {busy ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setStep('idle')}>
                Use a different email
              </button>
            </form>
          )}

          {/* Local demo access */}
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold text-slate-200">Explore without an account</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Continue as a local demo user. Simulations are stored in this browser and everything — including
              What-If variants — works exactly the same.
            </p>
            <button
              type="button"
              className="btn-secondary mt-3 w-full"
              onClick={() => {
                signInAsDemo(email || undefined);
                navigate(redirectTo, { replace: true });
              }}
            >
              Continue as demo user
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          By continuing you agree that simulation results are scenario-based simulations, not predictions.
        </p>
      </div>
    </div>
  );
}
