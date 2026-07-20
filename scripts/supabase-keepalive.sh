#!/usr/bin/env bash
# ============================================================
# Supabase keep-alive — פינג קל כל 4 דקות כדי שהחיבור/הפרויקט יישאר "חם"
# ומקטין את הלטנציה של הבקשה הראשונה (cold-start).
# מותקן כ-cron: */4 * * * * /root/hagbagag-platform/scripts/supabase-keepalive.sh
# ============================================================
set -u
ENV="/root/hagbagag-platform/.env.local"
LOG="/root/supabase-keepalive.log"

clean() {  # מסיר CR, גרשיים ורווחים מסביב לערך
  local v="$1"
  v="${v%$'\r'}"; v="${v//\"/}"; v="${v//\'/}"
  v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

URL="$(clean "$(grep -m1 '^VITE_SUPABASE_URL='      "$ENV" 2>/dev/null | cut -d= -f2-)")"
KEY="$(clean "$(grep -m1 '^VITE_SUPABASE_ANON_KEY=' "$ENV" 2>/dev/null | cut -d= -f2-)")"

ts="$(date '+%F %T')"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "$ts keepalive SKIP — missing URL/KEY in $ENV" >> "$LOG"
  exit 0
fi

# שאילתה זולה שמריצה SQL בצד השרת (RLS מחזיר [] ל-anon — לא משנה, המטרה לחמם).
# משתמשים ב-execution_sheets: ה-RLS שלו משתמש רק ב-auth.role()/auth.uid() ולכן
# עובד עם מפתח anon (200). materials_catalog קורא ל-is_admin() ש-anon לא רשאי
# להריץ → 401, לכן לא מתאים ל-keepalive.
code="$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
  "$URL/rest/v1/execution_sheets?select=id&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY")"

echo "$ts keepalive HTTP $code" >> "$LOG"

# שמירה על לוג קטן (500 שורות אחרונות)
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
