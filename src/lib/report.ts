// דיווח beacon לשרת (gemini-server → journald). fire-and-forget, לא חוסם ולא זורק.
// שימושי לאבחון שגיאות מהנייד בלי גישה ל-console.
export function reportClient(payload: Record<string, unknown>): void {
  try {
    fetch('/gemini-api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, ua: navigator.userAgent.slice(0, 120), t: new Date().toISOString() }),
      keepalive: true,
    }).catch(() => { /* noop */ })
  } catch { /* noop */ }
}

// מפרק שגיאת Supabase / כללית לפרטים קריאים ללוג.
export function errDetail(e: unknown): Record<string, unknown> {
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; name?: unknown }
    return {
      msg: String(o.message ?? e).slice(0, 300),
      code: o.code != null ? String(o.code) : undefined,
      details: o.details != null ? String(o.details).slice(0, 200) : undefined,
      hint: o.hint != null ? String(o.hint).slice(0, 200) : undefined,
      name: o.name != null ? String(o.name) : undefined,
    }
  }
  return { msg: String(e).slice(0, 300) }
}
