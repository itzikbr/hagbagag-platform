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

# ── ניטור: התראת טלגרם על מעבר מצב בלבד (OK↔FAIL) כדי לא לספם כל 4 דק' ──
STATE="/root/supabase-keepalive.state"
SECRETS="/root/chagagi/secrets.env"
status="OK"; [ "$code" = "200" ] || status="FAIL"
prev="$(cat "$STATE" 2>/dev/null || echo NONE)"
echo "$status" > "$STATE"
if [ "$status" != "$prev" ] && [ "$prev" != "NONE" ]; then
  TG_TOKEN="$(clean "$(grep -m1 '^TELEGRAM_BOT_TOKEN='      "$SECRETS" 2>/dev/null | cut -d= -f2-)")"
  TG_CHAT="$(clean  "$(grep -m1 '^TELEGRAM_ALERT_CHAT_ID=' "$SECRETS" 2>/dev/null | cut -d= -f2-)")"
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
    if [ "$status" = "FAIL" ]; then
      msg="⚠️ Supabase keepalive נכשל — HTTP $code ($ts). ייתכן שהפרויקט הושהה או תקלת רשת."
    else
      msg="✅ Supabase keepalive חזר לתקין (HTTP 200) — $ts"
    fi
    curl -s -o /dev/null -m 15 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$TG_CHAT" --data-urlencode "text=$msg"
    echo "$ts ALERT sent ($prev→$status)" >> "$LOG"
  fi
fi

# שמירה על לוג קטן (500 שורות אחרונות)
tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
