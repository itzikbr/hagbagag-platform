#!/usr/bin/env bash
# ============================================================
# תזכורת חידוש טוקן Drive — כל עוד ה-OAuth app במצב Testing, הטוקן
# פג אחרי 7 ימים (חוק קשיח של Google ל-scope רגיש, לא ניתן לעקוף בקוד).
# desktop_flow.py exchange מעדכן /root/drive-auth/last_renewed בכל חידוש
# מוצלח. הסקריפט הזה רק קורא ומזכיר — לא מחדש בעצמו (Google מחייב אישור
# אנושי אינטראקטיבי).
# מותקן כ-cron: 0 8 * * * /root/hagbagag-platform/scripts/drive-token-reminder.sh
# ============================================================
set -u
LAST_RENEWED_FILE="/root/drive-auth/last_renewed"
SECRETS="/root/chagagi/secrets.env"
LOG="/root/drive-token-reminder.log"
REMIND_AFTER_DAYS=6   # הטוקן פג ביום 7 — מזכירים יום לפני, וכל יום אחרי עד שיחדש

clean() {
  local v="$1"
  v="${v%$'\r'}"; v="${v//\"/}"; v="${v//\'/}"
  v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

ts="$(date '+%F %T')"
last="$(cat "$LAST_RENEWED_FILE" 2>/dev/null || echo 0)"
now="$(date +%s)"
days_elapsed=$(( (now - last) / 86400 ))

if [ "$last" = "0" ]; then
  echo "$ts SKIP — no $LAST_RENEWED_FILE yet (token never renewed via desktop_flow.py)" >> "$LOG"
  exit 0
fi

if [ "$days_elapsed" -lt "$REMIND_AFTER_DAYS" ]; then
  echo "$ts OK — $days_elapsed days since last renewal, no reminder needed" >> "$LOG"
  exit 0
fi

TG_TOKEN="$(clean "$(grep -m1 '^TELEGRAM_BOT_TOKEN='      "$SECRETS" 2>/dev/null | cut -d= -f2-)")"
TG_CHAT="$(clean  "$(grep -m1 '^TELEGRAM_ALERT_CHAT_ID=' "$SECRETS" 2>/dev/null | cut -d= -f2-)")"

if [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ]; then
  echo "$ts SKIP — missing Telegram creds, days_elapsed=$days_elapsed" >> "$LOG"
  exit 0
fi

msg="🔑 טוקן ה-Drive עומד לפוג (יום $days_elapsed מ-7) — לחיצה אחת לחידוש: https://hagapp.hagbagag.co.il/drive-auth"
curl -s -o /dev/null -m 15 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
  --data-urlencode "chat_id=$TG_CHAT" --data-urlencode "text=$msg"

echo "$ts REMINDER sent — days_elapsed=$days_elapsed" >> "$LOG"

tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
