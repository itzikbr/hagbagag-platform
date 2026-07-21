-- 013_chat_files_bucket.sql
-- Storage bucket לקבצי/תמונות צ'אט. ציבורי (public read) → URL קבוע בלי re-sign
-- בצ'אט חי; נתיבים כוללים uuid אקראי. העלאה מוגבלת למשתמשים מחוברים.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', true, 26214400)  -- 25MB
on conflict (id) do update set public = true, file_size_limit = 26214400;

create policy chat_files_read on storage.objects
  for select using (bucket_id = 'chat-files');
create policy chat_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-files');
create policy chat_files_owner_delete on storage.objects
  for delete to authenticated using (bucket_id = 'chat-files' and owner = auth.uid());
