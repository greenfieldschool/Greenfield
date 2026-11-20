-- Payment corrections, the accepted way (20261120_payment_corrections.sql)
-- Needs 20261101_payment_ids_bank_inbox.sql (bank inbox) already run. Safe to run twice.
--
-- Before this, an admin could change the amount, date or pupil of a recorded payment and save over it, delete a
-- payment outright, or mark it void with no reason. Every staff role (teachers too) could do the same in the
-- database. Accepted bookkeeping says recorded money is never edited or deleted:
--   1. Only admins can see or record payments (the database enforces it, not just the page).
--   2. Once recorded, the amount, date, pupil, parent, term and method are locked. Only the reference and notes can
--      be changed, and each change is logged.
--   3. A mistake is put right by REVERSING the payment with a reason from a fixed list (reverse_payment). The
--      reversed payment stays on record, crossed out, with who reversed it, when and why. The correct payment is then
--      entered again and points back to the one it corrects (corrects_payment_id).
--   4. Moving a payment to another invoice goes through move_payment_invoice with a reason, and is logged.
--   5. Payments can't be deleted by anyone.
--   6. Every step goes into finance_payment_log, which nobody can edit or delete.
-- A bank-matched payment that is reversed goes back to the bank inbox as "to check", so it can be matched again.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Reversal details and the link from a corrected payment to the one it replaces
-- ---------------------------------------------------------------------------------------------------------------

alter table public.finance_payment_transactions
  add column if not exists void_reason text,
  add column if not exists void_note text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null,
  add column if not exists voided_by_name text,
  add column if not exists corrects_payment_id uuid references public.finance_payment_transactions(id);

do $$
begin
  alter table public.finance_payment_transactions
    add constraint finance_payment_transactions_void_reason_check check (
      coalesce(void_reason, '') in ('', 'wrong_amount', 'wrong_pupil', 'wrong_details', 'duplicate', 'bank_reversed', 'not_received', 'other')
      and (coalesce(void_reason, '') <> 'other' or length(trim(coalesce(void_note, ''))) >= 3)
    );
exception when duplicate_object then null;
end $$;

create index if not exists finance_payment_transactions_corrects_idx
  on public.finance_payment_transactions (corrects_payment_id) where corrects_payment_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The payment history (written only by the triggers below)
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.finance_payment_log (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payment_transactions(id),
  action text not null check (action in ('recorded', 'details_changed', 'invoice_linked', 'invoice_unlinked', 'allocation_changed', 'reversed')),
  invoice_id uuid references public.finance_invoices(id) on delete set null,
  invoice_number text,
  amount numeric(12,2),
  changes jsonb not null default '{}'::jsonb,
  reason text,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists finance_payment_log_payment_idx on public.finance_payment_log (payment_id, created_at);
create index if not exists finance_payment_log_created_idx on public.finance_payment_log (created_at desc);

alter table public.finance_payment_log enable row level security;
drop policy if exists finance_payment_log_admin_select on public.finance_payment_log;
create policy finance_payment_log_admin_select on public.finance_payment_log
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete, truncate on public.finance_payment_log from anon, authenticated;

create or replace function public.finance_payment_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(trim(p.full_name), ''), p.email) from public.profiles p where p.id = auth.uid()),
    case when auth.uid() is null then 'The website (automatic)' end
  );
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Only admins can see or change payments and their invoice links (was: every staff role)
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists finance_payment_transactions_staff_all on public.finance_payment_transactions;
drop policy if exists finance_payment_transactions_admin_select on public.finance_payment_transactions;
drop policy if exists finance_payment_transactions_admin_insert on public.finance_payment_transactions;
drop policy if exists finance_payment_transactions_admin_update on public.finance_payment_transactions;
create policy finance_payment_transactions_admin_select on public.finance_payment_transactions
  for select to authenticated using (coalesce(public.is_admin(), false));
create policy finance_payment_transactions_admin_insert on public.finance_payment_transactions
  for insert to authenticated with check (coalesce(public.is_admin(), false));
create policy finance_payment_transactions_admin_update on public.finance_payment_transactions
  for update to authenticated using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));
revoke delete, truncate on public.finance_payment_transactions from anon, authenticated;

drop policy if exists finance_payment_allocations_staff_all on public.finance_payment_allocations;
drop policy if exists finance_payment_allocations_admin_all on public.finance_payment_allocations;
create policy finance_payment_allocations_admin_all on public.finance_payment_allocations
  for all to authenticated using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Lock recorded payments
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.finance_payment_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reversing boolean := coalesce(current_setting('app.payment_reverse', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted. Reverse it with a reason instead.';
  end if;

  if tg_op = 'INSERT' then
    if new.status::text = 'void' then
      raise exception 'Record the payment first; reverse it afterwards with a reason.';
    end if;
    new.void_reason := null; new.void_note := null; new.voided_at := null; new.voided_by := null; new.voided_by_name := null;
    if new.corrects_payment_id is not null and not exists (
      select 1 from public.finance_payment_transactions t where t.id = new.corrects_payment_id and t.status::text = 'void'
    ) then
      raise exception 'Reverse the wrong payment before entering the correct one.';
    end if;
    return new;
  end if;

  -- UPDATE. A parent, pupil or term being removed elsewhere clears the link (foreign key "set null"); allow that.
  if pg_trigger_depth() > 1
     and new.amount = old.amount and new.status = old.status and new.paid_at = old.paid_at
     and (new.guardian_id is not distinct from old.guardian_id or new.guardian_id is null)
     and (new.student_id is not distinct from old.student_id or new.student_id is null)
     and (new.academic_year_id is not distinct from old.academic_year_id or new.academic_year_id is null)
     and (new.academic_term_id is not distinct from old.academic_term_id or new.academic_term_id is null)
     and (new.received_by is not distinct from old.received_by or new.received_by is null)
     and (new.voided_by is not distinct from old.voided_by or new.voided_by is null) then
    return new;
  end if;

  if new.direction is distinct from old.direction
     or new.guardian_id is distinct from old.guardian_id
     or new.student_id is distinct from old.student_id
     or new.academic_year_id is distinct from old.academic_year_id
     or new.academic_term_id is distinct from old.academic_term_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider
     or new.provider_txn_id is distinct from old.provider_txn_id
     or new.method is distinct from old.method
     or new.paid_at is distinct from old.paid_at
     or new.received_by is distinct from old.received_by
     or new.created_at is distinct from old.created_at
     or new.corrects_payment_id is distinct from old.corrects_payment_id then
    raise exception 'A recorded payment can''t be changed. Reverse it with a reason, then enter the correct payment.';
  end if;

  if old.status::text = 'void' and new.status::text <> 'void' then
    raise exception 'A reversed payment stays reversed. Enter the payment again instead.';
  end if;

  if (new.status is distinct from old.status
      or new.void_reason is distinct from old.void_reason
      or new.void_note is distinct from old.void_note
      or new.voided_at is distinct from old.voided_at
      or new.voided_by is distinct from old.voided_by
      or new.voided_by_name is distinct from old.voided_by_name)
     and not v_reversing then
    raise exception 'Use "Reverse this payment" and choose a reason.';
  end if;

  return new;
end;
$$;

drop trigger if exists finance_payment_guard on public.finance_payment_transactions;
create trigger finance_payment_guard
  before insert or update or delete on public.finance_payment_transactions
  for each row execute function public.finance_payment_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Log every payment step
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.finance_payment_log_txn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.finance_payment_log (payment_id, action, amount, changes, done_by, done_by_name)
    values (
      new.id, 'recorded', new.amount,
      jsonb_strip_nulls(jsonb_build_object(
        'direction', new.direction, 'method', new.method, 'paid_at', new.paid_at, 'reference', new.reference,
        'student_id', new.student_id, 'guardian_id', new.guardian_id, 'provider', new.provider,
        'corrects_payment_id', new.corrects_payment_id
      )),
      auth.uid(), public.finance_payment_actor_name()
    );
    return new;
  end if;

  if new.status::text = 'void' and old.status::text <> 'void' then
    insert into public.finance_payment_log (payment_id, action, amount, reason, changes, done_by, done_by_name)
    values (new.id, 'reversed', new.amount, new.void_reason, jsonb_strip_nulls(jsonb_build_object('note', new.void_note)), auth.uid(), public.finance_payment_actor_name());
    return new;
  end if;

  if new.reference is distinct from old.reference then
    v_changes := v_changes || jsonb_build_object('reference', jsonb_build_object('from', old.reference, 'to', new.reference));
  end if;
  if new.notes is distinct from old.notes then
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('from', old.notes, 'to', new.notes));
  end if;
  if v_changes <> '{}'::jsonb then
    insert into public.finance_payment_log (payment_id, action, changes, done_by, done_by_name)
    values (new.id, 'details_changed', v_changes, auth.uid(), public.finance_payment_actor_name());
  end if;
  return new;
end;
$$;

drop trigger if exists finance_payment_log_txn on public.finance_payment_transactions;
create trigger finance_payment_log_txn
  after insert or update on public.finance_payment_transactions
  for each row execute function public.finance_payment_log_txn();

-- Invoice links. Removing or changing a link needs move_payment_invoice (which gives a reason), except when the
-- invoice itself is being removed elsewhere (foreign key cascade).
create or replace function public.finance_allocation_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.amount = old.amount and new.invoice_id = old.invoice_id
     and new.payment_transaction_id = old.payment_transaction_id then
    return new; -- the same link saved again (e.g. an online payment notice sent twice)
  end if;
  if tg_op = 'INSERT' then
    select t.status::text into v_status from public.finance_payment_transactions t where t.id = new.payment_transaction_id;
    if v_status = 'void' then
      raise exception 'That payment has been reversed, so it can''t be linked to an invoice.';
    end if;
    if new.amount <= 0 then
      raise exception 'The amount paid towards an invoice must be more than zero.';
    end if;
    return new;
  end if;
  if pg_trigger_depth() > 1 or coalesce(current_setting('app.payment_move', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Use "Move to another invoice" and give a reason.';
end;
$$;

drop trigger if exists finance_allocation_guard on public.finance_payment_allocations;
create trigger finance_allocation_guard
  before insert or update or delete on public.finance_payment_allocations
  for each row execute function public.finance_allocation_guard();

create or replace function public.finance_payment_log_alloc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.payment_reason', true), '');
  r record;
begin
  if tg_op = 'UPDATE' and new.amount = old.amount and new.invoice_id = old.invoice_id then
    return new;
  end if;
  r := case when tg_op = 'DELETE' then old else new end;
  -- The payment may be gone only if a whole test database is being cleared; skip quietly then.
  if not exists (select 1 from public.finance_payment_transactions t where t.id = r.payment_transaction_id) then
    return r;
  end if;
  insert into public.finance_payment_log (payment_id, action, invoice_id, invoice_number, amount, reason, changes, done_by, done_by_name)
  values (
    r.payment_transaction_id,
    case tg_op when 'INSERT' then 'invoice_linked' when 'DELETE' then 'invoice_unlinked' else 'allocation_changed' end,
    case when tg_op = 'DELETE' and not exists (select 1 from public.finance_invoices i where i.id = r.invoice_id) then null else r.invoice_id end,
    (select i.invoice_no from public.finance_invoices i where i.id = r.invoice_id),
    r.amount,
    v_reason,
    case when tg_op = 'UPDATE' then jsonb_build_object('amount', jsonb_build_object('from', old.amount, 'to', new.amount)) else '{}'::jsonb end,
    auth.uid(), public.finance_payment_actor_name()
  );
  return r;
end;
$$;

drop trigger if exists finance_payment_log_alloc on public.finance_payment_allocations;
create trigger finance_payment_log_alloc
  after insert or update or delete on public.finance_payment_allocations
  for each row execute function public.finance_payment_log_alloc();

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Reverse a payment, and move a payment to another invoice
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.reverse_payment(p_payment uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_line uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can reverse payments';
  end if;
  if coalesce(p_reason, '') not in ('wrong_amount', 'wrong_pupil', 'wrong_details', 'duplicate', 'bank_reversed', 'not_received', 'other') then
    raise exception 'Choose a reason from the list';
  end if;
  if p_reason = 'other' and length(coalesce(v_note, '')) < 3 then
    raise exception 'Type the reason when you choose Other';
  end if;

  select * into t from public.finance_payment_transactions where id = p_payment for update;
  if not found then
    raise exception 'That payment no longer exists';
  end if;
  if t.status::text = 'void' then
    raise exception 'That payment has already been reversed';
  end if;

  perform set_config('app.payment_reverse', 'on', true);
  update public.finance_payment_transactions
     set status = 'void',
         void_reason = p_reason,
         void_note = v_note,
         voided_at = now(),
         voided_by = auth.uid(),
         voided_by_name = public.finance_payment_actor_name()
   where id = p_payment;
  perform set_config('app.payment_reverse', 'off', true);

  -- A payment matched from the bank goes back to the bank inbox so the line can be matched again.
  update public.finance_bank_lines
     set status = 'pending', payment_transaction_id = null, recorded_by = null, recorded_at = null
   where payment_transaction_id = p_payment
  returning id into v_line;

  return jsonb_build_object('payment_id', p_payment, 'bank_line_reopened', v_line is not null);
end;
$$;

revoke all on function public.reverse_payment(uuid, text, text) from public, anon;
grant execute on function public.reverse_payment(uuid, text, text) to authenticated;

-- Moves the whole payment to one invoice (or to "paid in advance" when p_invoice is null). Pays the invoice up to
-- what it still owes; anything over stays as paid in advance.
create or replace function public.move_payment_invoice(p_payment uuid, p_invoice uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  inv record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_balance numeric := 0;
  v_alloc numeric := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can move payments';
  end if;
  if length(coalesce(v_reason, '')) < 3 then
    raise exception 'Say why the payment is being moved';
  end if;

  select * into t from public.finance_payment_transactions where id = p_payment for update;
  if not found then
    raise exception 'That payment no longer exists';
  end if;
  if t.status::text = 'void' then
    raise exception 'That payment has been reversed, so it can''t be moved';
  end if;
  if t.direction::text <> 'inflow' then
    raise exception 'Only money received can be put towards an invoice';
  end if;

  if p_invoice is not null then
    select i.id, i.student_id, i.status::text as status into inv from public.finance_invoices i where i.id = p_invoice;
    if not found then
      raise exception 'That invoice no longer exists';
    end if;
    if inv.status = 'void' then
      raise exception 'That invoice is cancelled';
    end if;
    if t.student_id is not null and inv.student_id is distinct from t.student_id then
      raise exception 'That invoice is for a different pupil. If the payment was for another pupil, reverse it and enter it again.';
    end if;
  end if;

  perform set_config('app.payment_move', 'on', true);
  perform set_config('app.payment_reason', v_reason, true);
  delete from public.finance_payment_allocations where payment_transaction_id = p_payment;
  if p_invoice is not null then
    select coalesce(b.balance, 0) into v_balance from public.finance_invoice_balances b where b.invoice_id = p_invoice;
    v_alloc := least(t.amount, greatest(v_balance, 0));
    if v_alloc > 0 then
      insert into public.finance_payment_allocations (payment_transaction_id, invoice_id, amount)
      values (p_payment, p_invoice, v_alloc);
    end if;
  end if;
  perform set_config('app.payment_move', 'off', true);
  perform set_config('app.payment_reason', '', true);

  return jsonb_build_object('allocated', v_alloc, 'on_account', t.amount - v_alloc);
end;
$$;

revoke all on function public.move_payment_invoice(uuid, uuid, text) from public, anon;
grant execute on function public.move_payment_invoice(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Bank matching: a line whose payment was reversed can be recorded again
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.record_bank_line_unchecked(p_line uuid, p_invoice uuid, p_student uuid, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  inv record;
  v_student uuid := p_student;
  v_guardian uuid;
  v_year uuid;
  v_term uuid;
  v_balance numeric := 0;
  v_alloc numeric := 0;
  v_txn uuid;
  v_key text;
  v_n int := 1;
begin
  select * into l from public.finance_bank_lines where id = p_line for update;
  if not found then
    raise exception 'That bank line no longer exists';
  end if;
  if l.status <> 'pending' then
    raise exception 'That bank line was already recorded or ignored';
  end if;

  if p_invoice is not null then
    select i.student_id, i.bill_to_guardian_id, i.academic_year_id, i.academic_term_id, i.status
      into inv
      from public.finance_invoices i
      where i.id = p_invoice;
    if not found then
      raise exception 'That invoice no longer exists';
    end if;
    if inv.status = 'void' then
      raise exception 'That invoice is void';
    end if;
    v_student := coalesce(v_student, inv.student_id);
    v_guardian := inv.bill_to_guardian_id;
    v_year := inv.academic_year_id;
    v_term := inv.academic_term_id;
    select coalesce(b.balance, 0) into v_balance from public.finance_invoice_balances b where b.invoice_id = p_invoice;
  end if;

  if v_student is null and p_invoice is null then
    raise exception 'Choose the student or invoice this payment is for';
  end if;

  if v_guardian is null and v_student is not null then
    select sg.guardian_id into v_guardian
      from public.student_guardians sg
      where sg.student_id = v_student
      order by sg.is_primary desc
      limit 1;
  end if;

  -- The bank line's fingerprint is the payment's key. If an earlier payment from this line was reversed, the
  -- reversed one keeps its key and the new one gets the next free key (fingerprint#2, #3 ...).
  v_key := l.fingerprint;
  while exists (select 1 from public.finance_payment_transactions t where t.provider = 'bank' and t.provider_txn_id = v_key) loop
    v_n := v_n + 1;
    v_key := l.fingerprint || '#' || v_n;
  end loop;

  insert into public.finance_payment_transactions (
    direction, guardian_id, student_id, academic_year_id, academic_term_id, amount, currency,
    provider, provider_txn_id, method, reference, notes, paid_at, status, received_by
  )
  values (
    'inflow', v_guardian, v_student, v_year, v_term, l.amount, 'NGN',
    'bank', v_key, 'transfer',
    coalesce(nullif(l.bank_reference, ''), left(l.narration, 120)),
    'From the bank ' || l.source || ': ' || l.narration,
    case when l.txn_date is null then now() else (l.txn_date::text || ' 12:00:00+01')::timestamptz end,
    'posted', p_by
  )
  returning id into v_txn;

  if p_invoice is not null and v_balance > 0 then
    v_alloc := least(l.amount, v_balance);
    insert into public.finance_payment_allocations (payment_transaction_id, invoice_id, amount)
    values (v_txn, p_invoice, v_alloc);
  end if;

  update public.finance_bank_lines
     set status = 'recorded',
         match_student_id = v_student,
         match_invoice_id = p_invoice,
         payment_transaction_id = v_txn,
         recorded_by = p_by,
         recorded_at = now()
   where id = p_line;

  return jsonb_build_object('payment_id', v_txn, 'allocated', v_alloc, 'on_account', l.amount - v_alloc);
end;
$$;

revoke all on function public.record_bank_line_unchecked(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_bank_line_unchecked(uuid, uuid, uuid, uuid) to service_role;
