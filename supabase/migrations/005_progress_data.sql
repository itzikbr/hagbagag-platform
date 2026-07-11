-- ============================================================
-- Migration 005 — execution_sheets: progress_data jsonb
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- לשונית "🚦 התקדמות" ב-NewExecutionSheet מאחסנת את מצב ההתקדמות
-- (היתר אסבסט, ספקים, תכנון ביצוע) כ-jsonb יחיד על ה-header.
-- ============================================================

ALTER TABLE execution_sheets ADD COLUMN IF NOT EXISTS progress_data jsonb DEFAULT '{}';
