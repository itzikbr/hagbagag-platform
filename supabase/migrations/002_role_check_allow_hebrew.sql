-- ============================================================
-- Migration 002 — Allow Hebrew role labels alongside English enum
-- חג בגג בע"מ | מאי 2026
-- ============================================================
-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ
-- ============================================================
--
-- Background
-- ----------
-- Migration 001 defined users.role with:
--   CHECK (role IN ('manager', 'office', 'field_worker', 'external'))
--
-- The Admin UI (src/pages/Admin.tsx, ROLE_OPTIONS) submits the English
-- enum values, but the deployed create-user edge function (or a direct
-- API caller) was observed inserting the Hebrew label 'שטח', which
-- violated users_role_check.
--
-- Rather than chase the caller, we widen the constraint to accept the
-- Hebrew aliases too. Both spellings remain valid; ROLE_LABELS in
-- Admin.tsx already maps English → Hebrew for display, and the new
-- entries below mirror that mapping so 'שטח' rows render correctly.
--
-- Note: 'field' (without _worker) is grandfathered in because Admin.tsx
-- treats user.role === 'field' as equivalent to 'field_worker'
-- (see UserCard role-selector at Admin.tsx:373).
-- ============================================================

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    -- English (canonical)
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
