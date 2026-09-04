import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Two-step reset: the wipe only runs after an explicit in-app confirm. */
  confirmingReset: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      confirmingReset: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, confirmingReset: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    // Deliberately NOT routed through the app dialog provider: this screen
    // exists for when the React tree is broken, which may include the
    // provider itself, so the confirm lives here as local two-step state.
    if (!this.state.confirmingReset) {
      this.setState({ confirmingReset: true });
      return;
    }
    // On the localStorage fallback backend this wipes every saved project.
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  private handleCancelReset = () => {
    this.setState({ confirmingReset: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6 select-text">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-950/80 border border-red-800/80 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Application Error</h2>
                <p className="text-xs text-slate-400">An unexpected error occurred during rendering</p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-red-300 overflow-x-auto max-h-48">
                <p className="font-bold">{this.state.error.toString()}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[11px] text-slate-500 mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-sky-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Page</span>
              </button>
              {this.state.confirmingReset ? (
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="error-reset-title"
                  aria-describedby="error-reset-message"
                  className="flex-1 rounded-xl border border-red-800/80 bg-red-950/40 p-3 space-y-2"
                >
                  <p id="error-reset-title" className="text-xs font-bold text-red-300">
                    Clear cached local settings and restart?
                  </p>
                  <p id="error-reset-message" className="text-[11px] leading-relaxed text-slate-400">
                    If your projects are stored in this browser&apos;s local storage (older
                    browsers / private mode), they will be deleted too. Export your project
                    file first if in doubt.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={this.handleReset}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      Clear &amp; restart
                    </button>
                    <button
                      onClick={this.handleCancelReset}
                      className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                    >
                      Keep data
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={this.handleReset}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
                  title="Clear cached local storage and restart fresh"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Cache & Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
