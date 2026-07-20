// שאילתת Supabase חסינה: timeout לכל ניסיון + עד N ניסיונות עם backoff.
// נועד למנוע מסכים שנתקעים על "טוען…" כשקריאה נתקעת (למשל stall של מנעול
// רענון ה-token ב-supabase-js ב-PWA של iOS) או נכשלת חד-פעמית.
// makeQuery חייב לייצר שאילתה חדשה בכל ניסיון (אי אפשר להשתמש שוב ב-builder).
export async function queryWithRetry<T = unknown>(
  makeQuery: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  opts: { timeouts?: number[] } = {},
): Promise<T> {
  // timeout מדורג: הבקשה הראשונה אחרי cold-start ב-PWA של iOS נתקעת ~10ש'
  // בעוד הריטריי מצליח מיד. ניסיון ראשון קצר → התאוששות מהירה; מאוחר יותר ארוך.
  const timeouts = opts.timeouts ?? [4000, 8000, 12000, 12000]
  let lastErr: unknown = null
  for (let i = 0; i < timeouts.length; i++) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeouts[i]) })
    try {
      const { data, error } = await Promise.race([makeQuery(), timeout]) as { data: T | null; error: { message?: string } | null }
      if (error) throw new Error(error.message || 'query error')
      return (data ?? ([] as unknown as T))
    } catch (e) {
      lastErr = e
      if (i < timeouts.length - 1) await new Promise(r => setTimeout(r, 250))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}
