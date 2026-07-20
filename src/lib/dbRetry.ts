// שאילתת Supabase חסינה: timeout לכל ניסיון + עד N ניסיונות עם backoff.
// נועד למנוע מסכים שנתקעים על "טוען…" כשקריאה נתקעת (למשל stall של מנעול
// רענון ה-token ב-supabase-js ב-PWA של iOS) או נכשלת חד-פעמית.
// makeQuery חייב לייצר שאילתה חדשה בכל ניסיון (אי אפשר להשתמש שוב ב-builder).
export async function queryWithRetry<T = unknown>(
  makeQuery: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  opts: { attempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3
  const timeoutMs = opts.timeoutMs ?? 10000
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs) })
    try {
      const { data, error } = await Promise.race([makeQuery(), timeout]) as { data: T | null; error: { message?: string } | null }
      if (error) throw new Error(error.message || 'query error')
      return (data ?? ([] as unknown as T))
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}
