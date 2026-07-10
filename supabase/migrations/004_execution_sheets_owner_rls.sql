-- ============================================================
-- Migration 004 — execution_sheets: owner-based save (INSERT/UPDATE)
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- הרצה: Supabase Dashboard → SQL Editor, או apply_migration
-- ============================================================
--
-- Background
-- ----------
-- Saving a sheet failed with "new row violates row-level security policy".
-- The existing UPDATE policy "Authenticated users can update non-submitted
-- sheets" defines USING (status <> 'submitted') with NO explicit WITH CHECK.
-- In Postgres, an UPDATE policy with no WITH CHECK reuses its USING
-- expression as the new-row check — so the NEW row must also satisfy
-- status <> 'submitted'. Submitting a sheet (field -> submitted) therefore
-- fails for every non-manager, since only "Managers can reopen submitted
-- sheets" permits a submitted new-row (and only for role = 'manager').
--
-- Fix
-- ---
-- Add ADDITIVE, owner-scoped permissive policies. Permissive policies are
-- OR'd, so an owner (created_by = auth.uid()) may insert and update their
-- own row regardless of status — including setting status = 'submitted'.
-- The existing collaborative-edit and manager-reopen policies remain intact.
-- created_by is the owner column and is set to auth.uid() by the client
-- (src/pages/NewExecutionSheet.tsx persist()).
-- ============================================================

DROP POLICY IF EXISTS "Owners can insert their own sheets" ON public.execution_sheets;
CREATE POLICY "Owners can insert their own sheets"
  ON public.execution_sheets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Owners can update their own sheets" ON public.execution_sheets;
CREATE POLICY "Owners can update their own sheets"
  ON public.execution_sheets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
