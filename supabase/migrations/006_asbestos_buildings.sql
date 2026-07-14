-- ============================================================
-- Migration 006 — execution_sheets: החלפת אסבסט (רב-מבנים)
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- בלוק "הסרת אסבסט" (שדה בודד) הוחלף ב-"החלפת אסבסט" התומך במספר
-- מבנים (מבנים) לכל פרויקט. המקור הקנוני של הטופס נשאר
-- buildings.work_content jsonb (blocks.asbestos.buildings[]).
--
-- כאן מוסיפים עמודות מושכפלות (denormalized) על ה-header לצורך
-- שאילתות/דיווח וסיכום ברשימת הדפים — נכתבות ב-persist() לצד
-- work_content, כך שהן תמיד מסונכרנות בעת שמירה.
--   • asbestos_buildings   — מערך המבנים המלא (jsonb)
--   • asbestos_total_area  — סה"כ מ"ר גגות (numeric)
-- ============================================================

ALTER TABLE execution_sheets ADD COLUMN IF NOT EXISTS asbestos_buildings jsonb DEFAULT '[]'::jsonb;
ALTER TABLE execution_sheets ADD COLUMN IF NOT EXISTS asbestos_total_area numeric DEFAULT 0;
