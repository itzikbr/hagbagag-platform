-- 009_materials_catalog.sql
-- לשונית חומרים חכמה: קטלוג חומרים + ברירות מחדל לפי סוג עבודה/קירוי.
-- קריאה לכל authenticated; כתיבה רק ל-is_admin() (איציק).

create table if not exists public.materials_catalog (
  id uuid primary key default gen_random_uuid(),
  category_code text not null,          -- אס/פנ/רע/פח/מר/אל/עץ/בד/כל
  category_name text not null,
  item_code text not null unique,       -- קידומת קטגוריה + 4 ספרות (למשל פח-0001)
  name text not null,
  price numeric not null default 0,
  is_default boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.materials_defaults (
  id uuid primary key default gen_random_uuid(),
  work_type text not null,              -- roofReplace / gutters / aluminum / insulation / asbestos / other
  roof_type text,                       -- panel / iskoreet / roof-tiles / null
  material_item_code text not null references public.materials_catalog(item_code) on update cascade on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_materials_catalog_category on public.materials_catalog(category_code, sort_order);
create index if not exists idx_materials_defaults_work on public.materials_defaults(work_type, roof_type, sort_order);

alter table public.materials_catalog enable row level security;
alter table public.materials_defaults enable row level security;

create policy authenticated_read_materials_catalog on public.materials_catalog
  for select using (auth.role() = 'authenticated');
create policy admin_all_materials_catalog on public.materials_catalog
  for all using (is_admin()) with check (is_admin());

create policy authenticated_read_materials_defaults on public.materials_defaults
  for select using (auth.role() = 'authenticated');
create policy admin_all_materials_defaults on public.materials_defaults
  for all using (is_admin()) with check (is_admin());

-- ── Seed: 10 פריטים לכל קטגוריה, 4 ראשונים is_default=true ──
insert into public.materials_catalog (category_code, category_name, item_code, name, price, is_default, sort_order, is_active)
select c.code, c.cname,
       c.code || '-' || lpad(g::text, 4, '0'),
       'פריט ' || c.cname || ' ' || g,
       0, (g <= 4), g, true
from (values
  ('אס','אסבסט'),('פנ','פאנלים'),('רע','רעפים'),('פח','פחחות'),
  ('מר','מרזבים'),('אל','אלומיניום'),('עץ','עץ'),('בד','בידוד'),('כל','כללי')
) as c(code,cname)
cross join generate_series(1,10) as g
on conflict (item_code) do nothing;

-- ── Seed: ברירות מחדל לפי עבודה ──
insert into public.materials_defaults (work_type, roof_type, material_item_code, sort_order) values
('roofReplace','panel','פנ-0001',1),('roofReplace','panel','פנ-0002',2),('roofReplace','panel','פנ-0003',3),('roofReplace','panel','פנ-0004',4),
('roofReplace','iskoreet','אס-0001',1),('roofReplace','iskoreet','אס-0002',2),('roofReplace','iskoreet','אס-0003',3),
('roofReplace','roof-tiles','רע-0001',1),('roofReplace','roof-tiles','רע-0002',2),('roofReplace','roof-tiles','רע-0003',3),('roofReplace','roof-tiles','עץ-0001',4),('roofReplace','roof-tiles','עץ-0002',5),
('gutters',null,'מר-0001',1),('gutters',null,'מר-0002',2),('gutters',null,'מר-0003',3),('gutters',null,'פח-0001',4),('gutters',null,'פח-0002',5),('gutters',null,'פח-0003',6),
('aluminum',null,'אל-0001',1),('aluminum',null,'אל-0002',2),('aluminum',null,'אל-0003',3);
