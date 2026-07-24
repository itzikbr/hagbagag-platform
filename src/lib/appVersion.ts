// ============================================================
// זיהוי "גרסה חדשה זמינה" — משווים את hash הבנדל שרץ כעת מול זה שמופיע
// ב-index.html העדכני מהשרת. לא תלוי ב-Service Worker / bump ידני:
// כל deploy מחליף את שם הבנדל, וכך מזוהה אוטומטית שיש גרסה חדשה.
// ============================================================

// hash הבנדל שנטען בפועל בדף (מתוך <script src="/assets/index-<hash>.js">)
export function runningBundle(): string | null {
  try {
    const src = Array.from(document.getElementsByTagName('script'))
      .map(e => e.getAttribute('src') || '')
      .find(x => /\/assets\/index-.*\.js/.test(x))
    return src ? (src.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null) : null
  } catch { return null }
}

// hash הבנדל הפרוס כרגע — נשלף מ-index.html טרי (index.html מוגש no-cache).
export async function deployedBundle(): Promise<string | null> {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null
  } catch {
    return null
  }
}
