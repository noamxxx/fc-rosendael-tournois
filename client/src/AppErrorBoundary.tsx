import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { err: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: unknown): State {
    return { err: err instanceof Error ? err : new Error(String(err)) }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info.componentStack)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen bg-[#f6f7fb] px-6 py-12 text-black">
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200/60 bg-white p-6 shadow-lg">
            <h1 className="text-lg font-extrabold text-red-900">Impossible d’afficher la page</h1>
            <p className="mt-2 text-sm text-black/65">
              Une erreur technique a interrompu le rendu. Tu peux recharger ou copier le message ci-dessous.
            </p>
            <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-black/10 bg-black/[0.03] p-3 text-xs text-red-800">
              {this.state.err.message}
            </pre>
            <button
              type="button"
              className="mt-5 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-black/[0.03]"
              onClick={() => window.location.reload()}
            >
              Recharger la page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
