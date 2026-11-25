-- Restore the link from a learner to their class (25 Nov 2026). Safe to run twice.
--
-- Why: the live database had no foreign key from students.class_id to classes, although docs/schema.sql has one
-- (students_class_id_fkey). Without it, any query that reads a learner together with their class
-- ("students … classes(name)") fails with "Could not find a relationship between 'students' and 'classes'".
-- That broke: creating learners' portal accounts, the learner and parent portal home pages, and "Recent payments"
-- on the admin dashboard.
--
-- NOT VALID adds the link for every new and changed row without checking the rows already there, so it can't fail on
-- an old learner whose class was deleted, and it changes no data. The check at the end lists any such learners; once
-- they are fixed (or if there are none), the last statement can validate the link.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'students_class_id_fkey' and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_class_id_fkey
      foreign key (class_id) references public.classes(id) on delete set null
      not valid;
  end if;
end;
$$;

-- Tell the API about the new link straight away.
notify pgrst, 'reload schema';

-- Learners whose class no longer exists (should be none). Fix them on their page (choose a class), then run:
--   alter table public.students validate constraint students_class_id_fkey;
select s.id, s.first_name, s.last_name, s.admission_number, s.class_id
from public.students s
where s.class_id is not null and not exists (select 1 from public.classes c where c.id = s.class_id);
