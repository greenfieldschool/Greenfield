-- Records who did what, so the management pack can show heads' and teachers' actions from the work itself
-- (nothing is typed into the pack). From now on the signed-in person is filled in automatically on:
--   * teacher assignments (who assigned the teacher to a class or subject),
--   * registers (who took or changed a pupil's attendance mark),
--   * health/safety incidents and discipline records (who recorded them),
--   * payments, expenses and invoices (who recorded them; payments matched from the bank by the website stay blank).
-- Older records stay blank. Nothing else changes. Safe to run twice. The SQL editor may warn about "destructive
-- operations": that is only "drop trigger if exists", which replaces the trigger with the same one.

-- ----------------------------------------------------------------------------------------------------------------
alter table public.teacher_class_assignments
  add column if not exists assigned_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.teacher_subject_assignments
  add column if not exists assigned_by uuid references auth.users(id) on delete set null default auth.uid();

alter table public.welfare_incidents alter column reported_by set default auth.uid();
alter table public.welfare_discipline_records alter column reported_by set default auth.uid();
alter table public.finance_payment_transactions alter column received_by set default auth.uid();
alter table public.finance_expenses alter column created_by set default auth.uid();
alter table public.finance_invoices alter column created_by set default auth.uid();

-- Registers are saved as upserts: stamp the person on a new mark and when a mark changes.
create or replace function public.student_attendance_stamp_recorder()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and (tg_op = 'INSERT' or new.status is distinct from old.status or old.recorded_by is null) then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists student_attendance_stamp_recorder on public.student_attendance;
create trigger student_attendance_stamp_recorder
  before insert or update on public.student_attendance
  for each row execute function public.student_attendance_stamp_recorder();
