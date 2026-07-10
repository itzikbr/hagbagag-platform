-- ============================================================
-- Migration 003 — Add 'admin' role
-- חג בגג בע"מ | יולי 2026
-- ============================================================
-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ
-- (או הוחל דרך apply_migration)
-- ============================================================
--
-- Background
-- ----------
-- Migration 002 widened users_role_check to accept English + Hebrew
-- aliases, but not an 'admin' role. The personal admin module
-- (src/pages/ItzikDashboard.tsx + the ⚡ tab in BottomNav) is gated on
-- role === 'admin' || role === 'manager'. To let a user actually be an
-- admin (superset of manager), the CHECK constraint must accept 'admin'.
--
-- We rebuild the constraint with 'admin' added; all previously valid
-- values remain valid.
-- ============================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    -- English (canonical)
    'admin',
    'manager',
    'office',
    'field_worker',
    'field',
    'external',
    -- Hebrew aliases
    'מנהל',
    'משרד',
    'שטח',
    'חיצוני'
  ));
