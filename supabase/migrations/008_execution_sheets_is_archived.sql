-- ============================================================
-- Migration 008 — execution_sheets: archived → is_archived + RLS
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- 1) שינוי שם העמודה archived → is_archived (שמירת ערכים קיימים).
-- 2) מדיניות RLS שמאפשרת לכל משתמש מחובר (צוות מהימן) לעדכן כל דף —
--    כדי שהעברה לארכיון תישמר גם לדף submitted וגם לדף שנוצר ע"י
--    משתמש אחר. עד כה עדכון כזה נחסם בשקט (0 שורות, ללא error),
--    כך שהארכוב "נראה עבד" בממשק אך לא נשמר. עקבי עם מדיניות
--    המחיקה הקיימת ("כל מחובר יכול למחוק").
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='execution_sheets' AND column_name='archived')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='execution_sheets' AND column_name='is_archived') THEN
    ALTER TABLE execution_sheets RENAME COLUMN archived TO is_archived;
  END IF;
END $$;

ALTER TABLE execution_sheets ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS execution_sheets_archived_idx;
CREATE INDEX IF NOT EXISTS execution_sheets_is_archived_idx ON execution_sheets (is_archived);

DROP POLICY IF EXISTS "Authenticated users can update any sheet" ON execution_sheets;
CREATE POLICY "Authenticated users can update any sheet"
  ON execution_sheets
  FOR UPDATE
  TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
