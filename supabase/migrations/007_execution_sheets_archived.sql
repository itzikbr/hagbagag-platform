-- ============================================================
-- Migration 007 — execution_sheets: ארכיון
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- דגל ארכוב לכל דף ביצוע. רשימת הדפים מסתירה דפים מאורכבים
-- (archived=true) בתצוגה הראשית ומציגה אותם במסך "📦 ארכיון".
-- ============================================================

ALTER TABLE execution_sheets ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS execution_sheets_archived_idx ON execution_sheets (archived);
