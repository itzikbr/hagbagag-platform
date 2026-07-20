import { Component, type ReactNode } from 'react'
import { reportClient, errDetail } from '../lib/report'

// ============================================================
// ErrorBoundary — קריסת render בכל מסך לא מפילה את כל האפליקציה.
// מציגה fallback עם כפתור ריענון, ומדווחת את השגיאה ל-journald (beacon).
// ============================================================
interface Props { children: ReactNode; name?: string }
interface State { hasError: boolean; msg: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, msg: '' }

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, msg: String((err as Error)?.message ?? err).slice(0, 200) }
  }

  componentDidCatch(err: unknown, info: unknown) {
    reportClient({ where: 'react-error-boundary', boundary: this.props.name ?? 'app', ...errDetail(err), stack: String((info as { componentStack?: string })?.componentStack ?? '').slice(0, 400) })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, gap: 14, padding: 24, direction: 'rtl', textAlign: 'center' }}>
        <span style={{ fontSize: 44 }}>⚠️</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>משהו השתבש במסך הזה</div>
        <div style={{ fontSize: 13, color: '#888', maxWidth: 320 }}>שאר האפליקציה ממשיכה לעבוד. נסה לרענן את המסך.</div>
        <button onClick={() => { this.setState({ hasError: false, msg: '' }); location.reload() }}
          style={{ background: '#CC0000', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          רענן
        </button>
      </div>
    )
  }
}
