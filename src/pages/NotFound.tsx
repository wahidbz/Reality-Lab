import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container-xl grid min-h-[60vh] place-items-center py-16">
      <div className="card mx-auto max-w-md p-8 text-center">
        <p className="mono text-4xl font-extrabold text-electric-400">404</p>
        <h1 className="mt-3 text-lg font-bold text-white">This route does not exist</h1>
        <p className="mt-2 text-sm text-slate-400">
          The page you were looking for is not part of Reality Lab MVP 0.1.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link to="/" className="btn-primary">
            Back to home
          </Link>
          <Link to="/explore" className="btn-secondary">
            Explore simulations
          </Link>
        </div>
      </div>
    </div>
  );
}
