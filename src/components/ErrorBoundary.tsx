import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render-time errors and shows a friendly message.
 * Raw stack traces are never shown to the user.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In a real deployment this is where an error reporter would be called.
    console.error('[Reality Lab] Unhandled error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="container-xl py-16">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-xl text-rose-300">
            !
          </div>
          <h1 className="mt-4 text-lg font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-400">
            This part of Reality Lab hit an unexpected error. Your saved simulations are unaffected.
          </p>
          <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-400">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a href="/" className="btn-secondary">
              Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
