-- 012_chat_creation_by_members.sql
-- מאפשר למשתמשים רגילים (לא רק admin) ליצור שיחות.
-- 1) שיחת 1-על-1: get_or_create_direct_chat היה חוסם לא-admin. הסרנו את החסימה
--    (הפונקציה SECURITY DEFINER ומכניסה groups/group_members בעצמה).
-- 2) קבוצה: NewGroup עושה insert ישיר → נוספו מדיניות INSERT + SELECT ליוצר,
--    ומדיניות להודעת המערכת (sender_id null) שנוצרת עם הקבוצה.

create or replace function public.get_or_create_direct_chat(p_other_user_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_lock_key bigint; v_group_id uuid; v_other_name text;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_other_user_id is null or p_other_user_id = v_me then raise exception 'invalid other user'; end if;
  if v_me < p_other_user_id then v_a := v_me; v_b := p_other_user_id; else v_a := p_other_user_id; v_b := v_me; end if;
  v_lock_key := ('x' || substr(md5(v_a::text || v_b::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);
  select g.id into v_group_id from groups g
   where g.type='direct'
     and exists (select 1 from group_members gm where gm.group_id=g.id and gm.user_id=v_a and gm.left_at is null)
     and exists (select 1 from group_members gm where gm.group_id=g.id and gm.user_id=v_b and gm.left_at is null)
   limit 1;
  if v_group_id is not null then return v_group_id; end if;
  select full_name into v_other_name from users where id=p_other_user_id;
  insert into groups (name, type, created_by) values (coalesce(v_other_name,'שיחה ישירה'),'direct',v_me) returning id into v_group_id;
  insert into group_members (group_id, user_id) values (v_group_id, v_me),(v_group_id, p_other_user_id);
  return v_group_id;
end $function$;

create or replace function public.is_group_creator(gid uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists (select 1 from public.groups where id=gid and created_by=auth.uid())
$$;
revoke execute on function public.is_group_creator(uuid) from anon;

create policy member_create_groups on public.groups
  for insert with check (created_by = auth.uid());
create policy creator_read_groups on public.groups
  for select using (created_by = auth.uid());   -- נחוץ ל-INSERT...RETURNING
create policy creator_add_group_members on public.group_members
  for insert with check (public.is_group_creator(group_id));
create policy member_send_system_messages on public.messages
  for insert with check (public.is_group_member(group_id) and sender_id is null);
