-- Inventory: the school's asset register (issue 11)
--
-- The school asked for an Inventory Management area with six sections (uniforms and school wear, classroom
-- furniture, classroom facilities and equipment, office, laboratory, computers and ICT), each with Primary /
-- College, pictures (2MB max), quantity, condition, location, "add other items", reports, and admins only.
--
-- Built as ONE register with editable lists rather than six fixed pages, so a new section (library, sports store,
-- kitchen …) needs no new code:
-- 1. inventory_sections: the six sections, seeded; admins can add, rename or hide sections.
-- 2. inventory_catalogue: the usual items per section (seeded from the school's list) to pick from; "Other" items
--    are added the same way.
-- 3. inventory_locations: classrooms (seeded from the classes), offices, laboratory, ICT room, store …
-- 4. inventory_items: one line per item and place: section, Primary / College / Whole school, location, and how
--    many are New, Good, Fair, Damaged and Due for replacement (the total is worked out), notes and up to 6 photos.
-- 5. inventory_log: every item added, changed, archived or deleted, with what changed and who did it (trigger),
--    and the item's section. Adding and deleting keep a full copy of the item, so the history page (Inventory →
--    History) still shows what a deleted item was, where it was and how many there were.
--    Changes to the set-up lists are logged too (subject = section / usual item / location): added, renamed or
--    otherwise changed, hidden and shown again, with who did it.
-- 6. Storage bucket "inventory-photos": private, 2MB per picture (pictures are shrunk on the phone before upload).
-- 7. Nothing can be deleted from the inventory (items, sections, usual items, locations): admins Deactivate an
--    item with a reason from a fixed list (Other = the only free text), and can reactivate it. Sections, usual items
--    and locations are hidden instead. The reason is required by the database.
-- Everything is admins only (read and write), as asked.
--
-- Run the whole file once in the Supabase SQL editor; re-running is harmless (seed rows are only added once).
-- The editor may warn about "destructive operations": those are the `drop … if exists` lines that replace an older
-- copy of a trigger or policy. Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.inventory_sections (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_catalogue (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.inventory_sections(id) on delete cascade,
  name text not null,
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'other'
    check (kind in ('classroom','office','laboratory','ict_room','store','hall','outdoor','other')),
  school_part text not null default 'whole_school' check (school_part in ('primary','college','whole_school')),
  class_id uuid references public.classes(id) on delete set null,
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.inventory_sections(id),
  name text not null check (length(trim(name)) > 0),
  school_part text not null default 'whole_school' check (school_part in ('primary','college','whole_school')),
  location_id uuid references public.inventory_locations(id) on delete set null,
  qty_new int not null default 0 check (qty_new >= 0),
  qty_good int not null default 0 check (qty_good >= 0),
  qty_fair int not null default 0 check (qty_fair >= 0),
  qty_damaged int not null default 0 check (qty_damaged >= 0),
  qty_replace int not null default 0 check (qty_replace >= 0),
  quantity int generated always as (qty_new + qty_good + qty_fair + qty_damaged + qty_replace) stored,
  description text,
  photos text[] not null default '{}'::text[] check (coalesce(array_length(photos, 1), 0) <= 6),
  last_checked_on date,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deactivating (archived_at set) needs a reason from the list; Other needs typed text.
alter table public.inventory_items add column if not exists archive_reason text;
alter table public.inventory_items add column if not exists archive_note text;
alter table public.inventory_items drop constraint if exists inventory_items_archive_reason_check;
alter table public.inventory_items add constraint inventory_items_archive_reason_check check (
  (archived_at is null and archive_reason is null and archive_note is null)
  or (archived_at is not null
      and coalesce(archive_reason, '') in ('written_off','lost','stolen','sold','donated','mistake','other')
      and (archive_reason <> 'other' or length(trim(coalesce(archive_note, ''))) > 0))
);

create index if not exists inventory_items_section_idx on public.inventory_items(section_id) where archived_at is null;
create index if not exists inventory_items_location_idx on public.inventory_items(location_id) where archived_at is null;

create table if not exists public.inventory_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  action text not null check (action in ('added','changed','archived','restored','deleted')),
  changes jsonb not null default '{}'::jsonb,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now()
);
-- What the row is about: an item, or a change to the set-up lists (sections, usual items, locations).
alter table public.inventory_log add column if not exists subject text not null default 'item';
alter table public.inventory_log drop constraint if exists inventory_log_subject_check;
alter table public.inventory_log add constraint inventory_log_subject_check check (subject in ('item','section','catalogue','location'));
alter table public.inventory_log drop constraint if exists inventory_log_action_check;
alter table public.inventory_log add constraint inventory_log_action_check
  check (action in ('added','changed','archived','restored','deleted','hidden','shown'));

-- The section is kept on each log row so the history can be filtered by section even after an item is deleted.
alter table public.inventory_log add column if not exists section_id uuid references public.inventory_sections(id) on delete set null;
create index if not exists inventory_log_item_idx on public.inventory_log(item_id, created_at desc);
create index if not exists inventory_log_section_idx on public.inventory_log(section_id, created_at desc);
create index if not exists inventory_log_created_idx on public.inventory_log(created_at desc);

-- Access: admins only, as the school asked. The log is written by the trigger only.
alter table public.inventory_sections enable row level security;
alter table public.inventory_catalogue enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_log enable row level security;

-- Admins read, add and change; nobody deletes (deactivate / hide instead).
do $$
declare
  t text;
begin
  foreach t in array array['inventory_sections','inventory_catalogue','inventory_locations','inventory_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (coalesce(public.is_admin(), false))', t || '_admin_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (coalesce(public.is_admin(), false))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false))', t || '_admin_update', t);
    execute format('revoke delete on public.%I from anon, authenticated', t);
  end loop;
end;
$$;
drop policy if exists inventory_log_admin_read on public.inventory_log;
create policy inventory_log_admin_read on public.inventory_log
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.inventory_log from anon, authenticated;
revoke all on public.inventory_sections, public.inventory_catalogue, public.inventory_locations, public.inventory_items, public.inventory_log from anon;

-- Stamp who changed an item, then log it.
create or replace function public.inventory_items_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_items_stamp on public.inventory_items;
create trigger inventory_items_stamp
  before insert or update on public.inventory_items
  for each row execute function public.inventory_items_stamp();

create or replace function public.inventory_items_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  k text;
  v_name text;
begin
  v_name := (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid());
  if tg_op = 'INSERT' then
    insert into public.inventory_log (item_id, item_name, action, changes, done_by, done_by_name, section_id)
    values (new.id, new.name, 'added',
            jsonb_build_object('quantity', new.quantity, 'section_id', new.section_id, 'location_id', new.location_id,
                               'school_part', new.school_part, 'qty_new', new.qty_new, 'qty_good', new.qty_good,
                               'qty_fair', new.qty_fair, 'qty_damaged', new.qty_damaged, 'qty_replace', new.qty_replace),
            auth.uid(), v_name, new.section_id);
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- The item's earlier log rows lose their link (item_id set null), so give them the name and section to keep.
    insert into public.inventory_log (item_id, item_name, action, changes, done_by, done_by_name, section_id)
    values (null, old.name, 'deleted',
            jsonb_build_object('quantity', old.quantity, 'section_id', old.section_id, 'location_id', old.location_id,
                               'school_part', old.school_part, 'qty_new', old.qty_new, 'qty_good', old.qty_good,
                               'qty_fair', old.qty_fair, 'qty_damaged', old.qty_damaged, 'qty_replace', old.qty_replace,
                               'description', old.description),
            auth.uid(), v_name, old.section_id);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach k in array array['name','section_id','school_part','location_id','qty_new','qty_good','qty_fair','qty_damaged',
                           'qty_replace','description','photos','last_checked_on'] loop
    if v_old -> k is distinct from v_new -> k then
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
    end if;
  end loop;

  if old.archived_at is null and new.archived_at is not null then
    v_action := 'archived';
    v_changes := v_changes || jsonb_build_object('reason', new.archive_reason, 'reason_note', new.archive_note);
  elsif old.archived_at is not null and new.archived_at is null then
    v_action := 'restored';
    v_changes := v_changes || jsonb_build_object('reason', old.archive_reason, 'reason_note', old.archive_note);
  elsif v_changes <> '{}'::jsonb then
    v_action := 'changed';
  else
    return new;
  end if;

  insert into public.inventory_log (item_id, item_name, action, changes, done_by, done_by_name, section_id)
  values (new.id, new.name, v_action, v_changes, auth.uid(), v_name, new.section_id);
  return new;
end;
$$;
revoke all on function public.inventory_items_log() from public, anon, authenticated;

drop trigger if exists inventory_items_log on public.inventory_items;
create trigger inventory_items_log
  after insert or update or delete on public.inventory_items
  for each row execute function public.inventory_items_log();

-- Log rows written before the section was recorded get it from their item.
update public.inventory_log l
   set section_id = i.section_id
  from public.inventory_items i
 where l.item_id = i.id and l.section_id is null;

-- Seed the six sections and the school's lists (only once; admins can change them afterwards).
insert into public.inventory_sections (slug, name, description, sort) values
  ('uniforms', 'Uniforms and school wear', 'Regular uniforms, sportswear, Friday wear, special occasion wear and branded items.', 10),
  ('classroom-furniture', 'Classroom furniture', 'Chairs, desks and tables for pupils and teachers.', 20),
  ('classroom-equipment', 'Classroom facilities and equipment', 'Fans, doors, windows, boards, TVs, projectors, toys and teaching materials.', 30),
  ('office', 'Office', 'Office furniture, computers, printers, cabinets, air conditioners and supplies.', 40),
  ('laboratory', 'Laboratory', 'Apparatus, glassware, instruments, chemicals, models, furniture and safety equipment.', 50),
  ('ict', 'Computers and ICT', 'Computers, laptops, monitors, printers, projectors, networking and power backup.', 60)
on conflict (slug) do nothing;

insert into public.inventory_catalogue (section_id, name, sort)
select s.id, x.name, x.sort
from public.inventory_sections s
join (values
  ('uniforms', 'Regular school uniform', 10), ('uniforms', 'Sportswear / sports kit', 20), ('uniforms', 'Friday wear', 30),
  ('uniforms', 'Special occasion uniform', 40), ('uniforms', 'Branded clothing and accessories', 50),
  ('classroom-furniture', 'Pupils'' chairs', 10), ('classroom-furniture', 'Pupils'' desks and tables', 20),
  ('classroom-furniture', 'Teacher''s chair', 30), ('classroom-furniture', 'Teacher''s table', 40),
  ('classroom-equipment', 'Ceiling fan', 10), ('classroom-equipment', 'Standing fan', 20), ('classroom-equipment', 'Door', 30),
  ('classroom-equipment', 'Window', 40), ('classroom-equipment', 'Whiteboard / marker board', 50),
  ('classroom-equipment', 'Television', 60), ('classroom-equipment', 'Projector', 70),
  ('classroom-equipment', 'Toys and instructional materials', 80),
  ('office', 'Office table', 10), ('office', 'Office chair', 20), ('office', 'Computer', 30), ('office', 'Laptop', 40),
  ('office', 'Printer', 50), ('office', 'Photocopier', 60), ('office', 'Filing cabinet', 70), ('office', 'Shelf', 80),
  ('office', 'Air conditioner', 90), ('office', 'Fan', 100), ('office', 'Office electronics and accessories', 110),
  ('laboratory', 'Microscope', 10), ('laboratory', 'Test tubes and glassware', 20), ('laboratory', 'Measuring instruments', 30),
  ('laboratory', 'Chemicals and reagents', 40), ('laboratory', 'Models and specimens', 50),
  ('laboratory', 'Laboratory table', 60), ('laboratory', 'Laboratory stool', 70), ('laboratory', 'Safety equipment', 80),
  ('ict', 'Desktop computer', 10), ('ict', 'Laptop', 20), ('ict', 'Monitor', 30), ('ict', 'Keyboard', 40), ('ict', 'Mouse', 50),
  ('ict', 'Printer', 60), ('ict', 'Projector', 70), ('ict', 'Server / networking equipment', 80),
  ('ict', 'Router / internet device', 90), ('ict', 'UPS / power backup', 100), ('ict', 'ICT accessories', 110)
) as x(slug, name, sort) on x.slug = s.slug
on conflict (section_id, name) do nothing;

insert into public.inventory_locations (name, kind, school_part, class_id, sort)
select c.name, 'classroom', case when c.level::text = 'secondary' then 'college' else 'primary' end, c.id, 10
from public.classes c
where c.active
on conflict (name) do nothing;

insert into public.inventory_locations (name, kind, school_part, sort) values
  ('Head teacher''s office', 'office', 'whole_school', 50),
  ('Admin office', 'office', 'whole_school', 51),
  ('Staff room', 'office', 'whole_school', 52),
  ('Science laboratory', 'laboratory', 'college', 60),
  ('ICT room', 'ict_room', 'whole_school', 70),
  ('Store', 'store', 'whole_school', 80),
  ('Hall', 'hall', 'whole_school', 90)
on conflict (name) do nothing;

-- Sections, usual items and locations: log who added, changed, hid or showed them again. Created after the seed
-- rows above, so the starting lists are not logged as if someone had added them.
create or replace function public.inventory_setup_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := case tg_table_name
    when 'inventory_sections' then 'section'
    when 'inventory_catalogue' then 'catalogue'
    else 'location' end;
  v_section uuid;
  v_action text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  k text;
begin
  v_new := to_jsonb(new);
  v_section := case v_subject when 'section' then new.id when 'catalogue' then (v_new ->> 'section_id')::uuid else null end;
  if tg_op = 'INSERT' then
    v_action := 'added';
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'kind', v_new -> 'kind', 'school_part', v_new -> 'school_part', 'description', v_new -> 'description'));
  else
    v_old := to_jsonb(old);
    foreach k in array array['name','description','kind','school_part','section_id'] loop
      if v_new ? k and v_old -> k is distinct from v_new -> k then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
      end if;
    end loop;
    if (v_old ->> 'active')::boolean is distinct from (v_new ->> 'active')::boolean then
      v_action := case when (v_new ->> 'active')::boolean then 'shown' else 'hidden' end;
    elsif v_changes <> '{}'::jsonb then
      v_action := 'changed';
    else
      return new;
    end if;
  end if;

  insert into public.inventory_log (item_id, item_name, action, changes, done_by, done_by_name, section_id, subject)
  values (null, new.name, v_action, v_changes, auth.uid(),
          (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
          v_section, v_subject);
  return new;
end;
$$;
revoke all on function public.inventory_setup_log() from public, anon, authenticated;

drop trigger if exists inventory_sections_log on public.inventory_sections;
create trigger inventory_sections_log after insert or update on public.inventory_sections
  for each row execute function public.inventory_setup_log();
drop trigger if exists inventory_catalogue_log on public.inventory_catalogue;
create trigger inventory_catalogue_log after insert or update on public.inventory_catalogue
  for each row execute function public.inventory_setup_log();
drop trigger if exists inventory_locations_log on public.inventory_locations;
create trigger inventory_locations_log after insert or update on public.inventory_locations
  for each row execute function public.inventory_setup_log();

-- Pictures: private bucket, 2MB per picture, admins only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-photos', 'inventory-photos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inventory_photos_select on storage.objects;
create policy inventory_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory-photos' and coalesce(public.is_admin(), false));
drop policy if exists inventory_photos_insert on storage.objects;
create policy inventory_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory-photos' and coalesce(public.is_admin(), false));
drop policy if exists inventory_photos_update on storage.objects;
create policy inventory_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'inventory-photos' and coalesce(public.is_admin(), false))
  with check (bucket_id = 'inventory-photos' and coalesce(public.is_admin(), false));
drop policy if exists inventory_photos_delete on storage.objects;
create policy inventory_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory-photos' and coalesce(public.is_admin(), false));
