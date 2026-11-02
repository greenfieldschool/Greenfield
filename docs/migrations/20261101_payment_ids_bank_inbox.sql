-- Payment IDs and the bank inbox
--
-- Parents pay by bank transfer and put two things in the transfer description:
--     <the child's admission number>  <a payment ID>        e.g.  GRE/2026/447 SF
-- The payment ID says what the money is for. It is either
--   - the short code of a fee type ("SF" = School fees, "UNI" = Uniform ...), set on each revenue category, or
--   - an invoice number (INV-2026-00012), which points at one exact invoice.
-- When the bank statement (CSV) or a bank email alert comes in, the app reads the admission number and the
-- payment ID from the description and lines the payment up with the child's invoice.
--
-- 1. revenue_categories.payment_code: the short fee-type code (unique, 2-8 letters/digits). Existing categories
--    get a code now (initials, e.g. "School fees" -> SF); admins can change them in Finance > Fees > Revenue categories.
-- 2. finance_bank_lines: the inbox. Every credit found on a statement or alert lands here once (a fingerprint
--    stops the same line being added twice), with who/what the app thinks it is for. Admins review it.
-- 3. record_bank_line(line, invoice, student): turns an inbox line into a posted payment and allocates it to the
--    invoice, in one step. Only admins can call it. record_bank_line_unchecked is for the email-alert endpoint,
--    which runs with the service key.
-- Run AFTER 20261019_teacher_subject_assignments.sql. Safe to run twice.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Payment codes
-- ---------------------------------------------------------------------------------------------------------------

alter table public.revenue_categories add column if not exists payment_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'revenue_categories_payment_code_format'
  ) then
    alter table public.revenue_categories
      add constraint revenue_categories_payment_code_format check (payment_code is null or payment_code ~ '^[A-Z0-9]{2,8}$');
  end if;
end;
$$;

create unique index if not exists revenue_categories_payment_code_uidx on public.revenue_categories (payment_code);

-- Give every category without a code one: initials of its words (School fees -> SF), or the first three letters
-- of a single word (Uniform -> UNI). Numbers are added when the code is taken or reserved.
do $$
declare
  c record;
  base text;
  candidate text;
  n int;
begin
  for c in select id, name from public.revenue_categories where payment_code is null order by created_at, name loop
    select coalesce(string_agg(upper(left(w, 1)), ''), '')
      into base
      from regexp_split_to_table(regexp_replace(c.name, '[^A-Za-z0-9 ]', ' ', 'g'), '\s+') as w
      where w <> '';
    if length(base) < 2 then
      base := upper(left(regexp_replace(c.name, '[^A-Za-z0-9]', '', 'g'), 3));
    end if;
    if length(base) < 2 then
      base := 'FEE';
    end if;
    base := left(base, 6);

    candidate := base;
    n := 1;
    while candidate in ('INV', 'NGN', 'GRE', 'POS', 'TRF', 'NIP')
      or exists (select 1 from public.revenue_categories x where x.payment_code = candidate) loop
      n := n + 1;
      candidate := base || n::text;
    end loop;

    update public.revenue_categories set payment_code = candidate where id = c.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The bank inbox
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.finance_bank_lines (
  id uuid primary key default gen_random_uuid(),
  -- date + amount + description + bank reference, so the same line is never added twice
  fingerprint text not null unique,
  source text not null default 'statement' check (source in ('statement', 'email', 'manual')),
  txn_date date,
  amount numeric(12,2) not null check (amount > 0),
  narration text not null,
  bank_reference text,
  status text not null default 'pending' check (status in ('pending', 'recorded', 'ignored')),
  -- what the app worked out from the description
  match_student_id uuid references public.students(id) on delete set null,
  match_invoice_id uuid references public.finance_invoices(id) on delete set null,
  match_category_id uuid references public.revenue_categories(id) on delete set null,
  -- auto = sure enough to record without a person; review = needs a look; none = nothing recognised
  match_level text not null default 'none' check (match_level in ('auto', 'review', 'none')),
  match_note text,
  payment_transaction_id uuid references public.finance_payment_transactions(id) on delete set null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_bank_lines_status_idx on public.finance_bank_lines (status, created_at desc);

drop trigger if exists finance_bank_lines_set_updated_at on public.finance_bank_lines;
create trigger finance_bank_lines_set_updated_at
  before update on public.finance_bank_lines
  for each row execute procedure public.set_updated_at();

alter table public.finance_bank_lines enable row level security;

-- Money records: admins only.
drop policy if exists finance_bank_lines_admin_all on public.finance_bank_lines;
create policy finance_bank_lines_admin_all
  on public.finance_bank_lines
  for all
  to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

revoke all on public.finance_bank_lines from anon;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Recording an inbox line as a payment
-- ---------------------------------------------------------------------------------------------------------------

-- Does the work without a permission check. Not callable through the API by signed-in users.
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

  insert into public.finance_payment_transactions (
    direction, guardian_id, student_id, academic_year_id, academic_term_id, amount, currency,
    provider, provider_txn_id, method, reference, notes, paid_at, status, received_by
  )
  values (
    'inflow', v_guardian, v_student, v_year, v_term, l.amount, 'NGN',
    'bank', l.fingerprint, 'transfer',
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

create or replace function public.record_bank_line(p_line uuid, p_invoice uuid default null, p_student uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can record payments';
  end if;
  return public.record_bank_line_unchecked(p_line, p_invoice, p_student, auth.uid());
end;
$$;

revoke all on function public.record_bank_line(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_bank_line(uuid, uuid, uuid) to authenticated;
