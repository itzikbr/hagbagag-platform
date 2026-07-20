-- 010_admin_users_rls.sql
-- באג: מסך ניהול המשתמשים (/admin/users) הביא רק את איציק עצמו.
-- הסיבה: לטבלת users היו מדיניות RLS ל-field(שורה עצמית)/manager(הכל)/office(הכל)
-- אבל לא ל-role='admin'. איציק הוא admin → ראה רק את השורה שלו (וגם עריכות נכשלו).
-- תיקון: גישה מלאה ל-admin, במתכונת manager_full_access_users.
create policy admin_full_access_users on public.users
  for all using (get_user_role() = 'admin') with check (get_user_role() = 'admin');
