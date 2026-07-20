-- 011_chat_membership_rls.sql
-- לפני: messages/groups/group_members היו נעולים ל-is_admin() בלבד → רק איציק
-- ראה/קיבל צ'אט; משתמש רגיל (field/office) ראה 0 הודעות ולא קיבל realtime
-- (realtime מכבד RLS). אחרי: חבר קבוצה קורא/שולח הודעות בקבוצותיו.
-- פונקציית SECURITY DEFINER מונעת רקורסיית RLS על group_members.
create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and left_at is null
  );
$$;
revoke execute on function public.is_group_member(uuid) from anon;

create policy member_read_messages on public.messages
  for select using (public.is_group_member(group_id));
create policy member_send_messages on public.messages
  for insert with check (public.is_group_member(group_id) and sender_id = auth.uid());

create policy member_read_groups on public.groups
  for select using (public.is_group_member(id));

create policy member_read_group_members on public.group_members
  for select using (public.is_group_member(group_id));
