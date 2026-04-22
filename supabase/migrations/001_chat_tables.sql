-- ============================================================
-- Migration 001 — Chat Module Tables
-- חג בגג בע"מ | אפריל 2026
-- ============================================================
-- הרצה: Supabase Dashboard → SQL Editor → הדבק והרץ
-- ============================================================


-- ========== USERS ==========
-- טבלת משתמשים (מרחיבה את auth.users של Supabase)
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('manager', 'office', 'field_worker', 'external')),
  avatar_url  text,
  is_active   bool DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- אינדקס לחיפוש לפי תפקיד
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);

-- ========== CONVERSATIONS ==========
-- שיחות (ישירות + קבוצות)
CREATE TABLE IF NOT EXISTS public.conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL CHECK (type IN ('direct', 'group')),
  name         text,           -- null לשיחות ישירות, שם הקבוצה לקבוצות
  avatar_url   text,
  created_by   uuid REFERENCES public.users(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_updated_idx ON public.conversations(updated_at DESC);

-- ========== CONVERSATION MEMBERS ==========
-- משתתפי שיחה
CREATE TABLE IF NOT EXISTS public.conversation_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  can_add_members  bool DEFAULT false,
  joined_at        timestamptz DEFAULT now(),
  left_at          timestamptz,  -- null = פעיל
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS members_user_idx        ON public.conversation_members(user_id);
CREATE INDEX IF NOT EXISTS members_conversation_idx ON public.conversation_members(conversation_id);

-- ========== MESSAGES ==========
-- הודעות
CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        uuid REFERENCES public.users(id),       -- null = הודעת מערכת
  sender_name      text NOT NULL,
  content          text,
  message_type     text NOT NULL DEFAULT 'text'
                   CHECK (message_type IN ('text', 'image', 'file', 'system')),
  file_url         text,
  file_name        text,
  file_size        int,
  is_pinned        bool DEFAULT false,
  is_deleted       bool DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

-- אינדקס לטעינת הודעות לפי שיחה
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx       ON public.messages(sender_id);

-- ========== MESSAGE READS ==========
-- מעקב קריאות
CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at     timestamptz DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS reads_user_idx ON public.message_reads(user_id);

-- ========== SAVED MESSAGES ==========
-- הודעות שמורות (לחיצה ארוכה → שמור)
CREATE TABLE IF NOT EXISTS public.saved_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  saved_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, message_id)
);


-- ============================================================
-- REALTIME
-- ============================================================
-- הפעל Realtime על הודעות — כל הודעה חדשה מגיעה מיידית
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- הוסף לפרסום ב-Realtime (אם טרם הוגדר)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;


-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_messages      ENABLE ROW LEVEL SECURITY;

-- --- users ---
-- כל משתמש מחובר יכול לקרוא פרופילים
CREATE POLICY "users_read" ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- משתמש יכול לעדכן רק את עצמו; מנהל יכול לעדכן הכל
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (
    auth.uid() = id OR
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'manager'
  );

-- --- conversations ---
-- קריאה: רק למשתתפים בשיחה
CREATE POLICY "conv_read" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = conversations.id
        AND user_id = auth.uid()
        AND left_at IS NULL
    )
  );

-- יצירה: כל משתמש מחובר
CREATE POLICY "conv_insert" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- --- conversation_members ---
CREATE POLICY "members_read" ON public.conversation_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

CREATE POLICY "members_insert" ON public.conversation_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- --- messages ---
-- קריאה: רק משתתפי השיחה
CREATE POLICY "msg_read" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
        AND left_at IS NULL
    )
  );

-- שליחה: רק משתתפי השיחה
CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
        AND left_at IS NULL
    )
  );

-- --- message_reads ---
CREATE POLICY "reads_insert" ON public.message_reads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reads_read" ON public.message_reads
  FOR SELECT USING (auth.uid() = user_id);

-- --- saved_messages ---
CREATE POLICY "saved_all" ON public.saved_messages
  FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- עדכן updated_at של conversations כשמגיעה הודעה חדשה
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_update_conv_ts
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();


-- ============================================================
-- STORAGE — avatars bucket
-- ============================================================
-- ב-Supabase Dashboard → Storage → צור bucket בשם "avatars"
-- עם הגדרות:
--   Public bucket: true
--   Max file size: 5MB
--   Allowed MIME types: image/*
-- ============================================================

-- הצלחת! כל הטבלאות הוגדרו.
