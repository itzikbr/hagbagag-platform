#!/usr/bin/env bash
# ============================================================
# תזכורת חידוש טוקן Drive — כל עוד ה-OAuth app במצב Testing, הטוקן
# פג אחרי 7 ימים (חוק קשיח של Google ל-scope רגיש, לא ניתן לעקוף בקוד).
#
# עדכון 21/08/2026: הגרסה הקודמת הסתמכה רק על ספירת ימים מ-last_renewed,
# ולכן שלחה "עומד לפוג" ארבעה ימים אחרי שהטוקן כבר פג בפועל. עכשיו נשאל
# את drive-auth-server מה המצב האמיתי (רענון אמיתי מול Google + קריאת
# Drive), ורק אם השאילתה נכשלת נופלים חזרה לספירת הימים.
#
# מותקן כ-cron: 0 8 * * * /root/hagbagag-platform/scripts/drive-token-reminder.sh
# ============================================================
set -u
LAST_RENEWED_FILE="/root/drive-auth/last_renewed"
SECRETS="/root/chagagi/secrets.env"
LOG="/root/drive-token-reminder.log"
STATUS_URL="http://127.0.0.1:3004/drive-auth/status"
RENEW_LINK="https://hagapp.hagbagag.co.il/drive-auth"
REMIND_AFTER_DAYS=6   # הטוקן פג ביום 7 — מזכירים יום לפני

clean() {
  local v="$1"
  v="${v%$'\r'}"; v="${v//\"/}"; v="${v//\'/}"
  v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

send_tg() {
  local msg="$1"
  local tok chat
  tok="$(clean "$(grep -m1 '^TELEGRAM_BOT_TOKEN='      "$SECRETS" 2>/dev/null | cut -d= -f2-)")"
  chat="$(clean "$(grep -m1 '^TELEGRAM_ALERT_CHAT_ID=' "$SECRETS" 2>/dev/null | cut -d= -f2-)")"
  if [ -z "$tok" ] || [ -z "$chat" ]; then
    echo "$ts SKIP — missing Telegram creds" >> "$LOG"; return 1
  fi
  curl -s -o /dev/null -m 15 "https://api.telegram.org/bot$tok/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=$msg"
}

ts="$(date '+%F %T')"
last="$(cat "$LAST_RENEWED_FILE" 2>/dev/null || echo 0)"
now="$(date +%s)"
days_elapsed=$(( (now - last) / 86400 ))

# מצב אמיתי מהשירות: valid=true/false. אם השירות לא זמין — status ריק.
status_json="$(curl -s -m 20 "$STATUS_URL" 2>/dev/null)"
valid="$(printf '%s' "$status_json" | grep -o '"valid"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$')"

if [ "$valid" = "false" ]; then
  send_tg "🔴 טוקן ה-Drive פג ואינו פעיל. חידוש בלחיצה אחת: $RENEW_LINK"
  echo "$ts EXPIRED — reminder sent (days_elapsed=$days_elapsed)" >> "$LOG"
elif [ "$valid" = "true" ]; then
  if [ "$days_elapsed" -ge "$REMIND_AFTER_DAYS" ]; then
    send_tg "🔑 טוקן ה-Drive עומד לפוג (יום $days_elapsed מ-7) — חידוש בלחיצה אחת: $RENEW_LINK"
    echo "$ts REMINDER sent — valid, days_elapsed=$days_elapsed" >> "$LOG"
  else
    echo "$ts OK — token valid, $days_elapsed days since renewal" >> "$LOG"
  fi
else
  # השירות לא ענה — לא בולעים בשקט, נופלים לספירת ימים ומדווחים
  echo "$ts WARN — drive-auth-server unreachable, falling back to day count" >> "$LOG"
  if [ "$last" = "0" ]; then
    echo "$ts SKIP — no $LAST_RENEWED_FILE yet" >> "$LOG"
  elif [ "$days_elapsed" -ge "$REMIND_AFTER_DAYS" ]; then
    send_tg "🔑 טוקן ה-Drive עומד לפוג (יום $days_elapsed מ-7) — חידוש: $RENEW_LINK
⚠️ שירות drive-auth לא הגיב, הבדיקה מבוססת תאריך בלבד."
    echo "$ts REMINDER sent (fallback) — days_elapsed=$days_elapsed" >> "$LOG"
  fi
fi

tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
