import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[360px] w-full flex items-center justify-center p-6 bg-[#050505] text-white">
          <div className="max-w-md w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <AlertTriangle size={120} />
            </div>

            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-5 text-red-400">
              <AlertTriangle size={28} />
            </div>

            <h2 className="text-xl font-black uppercase tracking-tight text-white mb-2">
              {this.props.fallbackTitle || 'Component Error Encountered'}
            </h2>

            <p className="text-xs text-zinc-400 leading-relaxed mb-6 font-mono">
              An unexpected runtime error occurred while rendering this view. Your session and data are secure.
            </p>

            {this.state.error && (
              <div className="mb-6 p-3 rounded-xl bg-black/60 border border-zinc-800 text-left overflow-x-auto max-h-28 text-[11px] font-mono text-zinc-400">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold transition-all cursor-pointer"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neon-cyan hover:bg-white text-black text-xs font-mono font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-neon-cyan/10"
              >
                <RefreshCw size={14} /> Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
