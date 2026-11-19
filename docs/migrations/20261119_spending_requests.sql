-- Spending requests (daily expense requests) and locking down expense records
--
-- What it does, in plain words:
-- 1. Staff ask for money: an advance (buy first, account for it after), paying a supplier, or paying them back.
-- 2. Approvers with a spending limit approve, decline or send back, with a reason from a fixed list. Big requests
--    need two approvals. Nobody approves or pays their own request.
-- 3. A cashier / bursar pays out from the Paystack expenses wallet (the website confirms with Paystack), or records a
--    payment made another way (bank app, cash, POS).
-- 4. Whoever received an advance accounts for it with receipt photos and any change returned; another person checks
--    it. When a request closes, each receipt becomes one expense record, so spending is counted once.
-- 5. Everything is logged with who did it. Nothing can be deleted.
-- 6. Emails for each step, plus daily reminders and a 7:00 summary (see 20261119b_spending_schedule.sql).
-- 7. FIX: expense records, expense categories and budgets could be read, changed and deleted by every staff account
--    (teachers, front desk, nurse) through the database, although the pages were admins only. Now: admins only;
--    staff can read the category names (to choose one on a request). Expense records can no longer be deleted:
--    admins void them with a reason.
--
-- Run AFTER 20261118b_pupil_class_history.sql (needs 20261110_email.sql). Safe to run twice.
-- The SQL editor may warn about "destructive operations": those are `drop … if exists` lines that replace an older
-- copy of a policy, trigger or constraint. No data is deleted.

-- ---------------------------------------------------------------------------------------------------------------

-- Settings (one row). Amounts in naira.
create table if not exists public.spending_settings (
  id smallint primary key default 1 check (id = 1),
  second_approval_above numeric(12,2) not null default 250000 check (second_approval_above > 0),
  approver_may_pay_up_to numeric(12,2) not null default 50000 check (approver_may_pay_up_to >= 0),
  account_within_days smallint not null default 3 check (account_within_days between 1 and 30),
  no_receipt_max numeric(12,2) not null default 5000 check (no_receipt_max >= 0),
  split_check_amount numeric(12,2) not null default 50000 check (split_check_amount > 0),
  low_balance_alert numeric(12,2) check (low_balance_alert is null or low_balance_alert >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.spending_settings (id) values (1) on conflict (id) do nothing;

-- Who may approve (up to an amount) and who may pay out. One row per person; removing = limit null and pay off.
create table if not exists public.spending_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approve_up_to numeric(12,2) check (approve_up_to is null or approve_up_to > 0),
  can_pay_out boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.spending_permission_log (
  id bigint generated always as identity primary key,
  subject text not null check (subject in ('permission', 'settings')),
  user_id uuid,
  user_name text,
  changes jsonb not null,
  note text,
  done_by uuid,
  done_by_name text,
  done_at timestamptz not null default now()
);
create index if not exists spending_permission_log_at_idx on public.spending_permission_log (done_at desc);

-- Bank details of staff (to pay them) and suppliers. A change = a new row; the old one is deactivated.
create table if not exists public.spending_payees (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('staff', 'supplier')),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (btrim(name) <> '' and length(name) <= 120),
  bank_name text not null check (btrim(bank_name) <> '' and length(bank_name) <= 80),
  bank_code text check (bank_code is null or bank_code ~ '^[0-9A-Za-z]{2,12}$'),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text check (account_name is null or length(account_name) <= 120),
  account_checked_at timestamptz,
  paystack_recipient_code text,
  active boolean not null default true,
  replaced_by uuid references public.spending_payees(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  check (kind <> 'staff' or user_id is not null)
);
create unique index if not exists spending_payees_one_staff_idx on public.spending_payees (user_id) where kind = 'staff' and active;
create unique index if not exists spending_payees_supplier_account_idx
  on public.spending_payees (coalesce(bank_code, lower(bank_name)), account_number) where kind = 'supplier' and active;
create unique index if not exists spending_payees_supplier_name_idx
  on public.spending_payees (lower(btrim(name))) where kind = 'supplier' and active;

create table if not exists public.spending_counters (
  year int primary key,
  last_no int not null default 0
);

create table if not exists public.spending_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  kind text not null check (kind in ('advance', 'supplier', 'reimburse')),
  status text not null default 'submitted'
    check (status in ('submitted', 'sent_back', 'approved', 'declined', 'cancelled', 'paying', 'paid', 'checking', 'closed')),
  requester_id uuid not null references auth.users(id) on delete restrict,
  requester_name text,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  purpose text not null check (btrim(purpose) <> '' and length(purpose) <= 500),
  amount numeric(12,2) not null check (amount > 0 and amount <= 100000000),
  needed_by date,
  -- What the approver saw (snapshot of the payee row, on purpose).
  payee_id uuid not null references public.spending_payees(id) on delete restrict,
  payee_name text not null,
  bank_name text not null,
  bank_code text,
  account_number text not null,
  account_name text,
  flags text[] not null default '{}',
  approvals_needed smallint not null default 1 check (approvals_needed in (1, 2)),
  -- Paying out
  pay_method text check (pay_method is null or pay_method in ('paystack', 'bank_app', 'cash', 'pos')),
  pay_reference text,
  pay_slip_path text,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  paid_by_name text,
  charge numeric(12,2) not null default 0 check (charge >= 0),
  due_by date,
  paystack_reference text unique,
  paystack_attempt int not null default 0,
  paystack_transfer_code text,
  paystack_status text,
  paystack_message text,
  paying_by uuid references auth.users(id) on delete set null,
  -- Accounting for an advance
  change_returned numeric(12,2) check (change_returned is null or change_returned >= 0),
  accounted_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spending_requests_status_idx on public.spending_requests (status, submitted_at);
create index if not exists spending_requests_requester_idx on public.spending_requests (requester_id, created_at desc);
create index if not exists spending_requests_category_idx on public.spending_requests (category_id, created_at);

create table if not exists public.spending_approvals (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.spending_requests(id) on delete restrict,
  approver_id uuid not null references auth.users(id) on delete restrict,
  approver_name text,
  limit_at numeric(12,2) not null,
  approved_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create unique index if not exists spending_approvals_once_idx on public.spending_approvals (request_id, approver_id) where withdrawn_at is null;

create table if not exists public.spending_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.spending_requests(id) on delete restrict,
  stage text not null check (stage in ('request', 'accounting')),
  file_path text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  file_hash text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  amount numeric(12,2) not null check (amount > 0),
  vendor text not null check (btrim(vendor) <> '' and length(vendor) <= 120),
  spent_on date not null,
  category_id uuid references public.expense_categories(id) on delete restrict,
  no_receipt_reason text check (no_receipt_reason is null or no_receipt_reason in ('no_receipt_given', 'transport_fare', 'receipt_lost', 'other')),
  seller_phone text check (seller_phone is null or length(seller_phone) <= 20),
  note text check (note is null or length(note) <= 300),
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  remove_reason text,
  -- A picture, or a reason there is none (Other needs a note).
  check ((file_path is not null) <> (no_receipt_reason is not null)),
  check (no_receipt_reason is distinct from 'other' or coalesce(btrim(note), '') <> '')
);
create index if not exists spending_receipts_request_idx on public.spending_receipts (request_id);
create unique index if not exists spending_receipts_hash_idx on public.spending_receipts (file_hash) where file_hash is not null and removed_at is null;
create index if not exists spending_receipts_similar_idx on public.spending_receipts (lower(btrim(vendor)), amount, spent_on) where removed_at is null;

create table if not exists public.spending_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.spending_requests(id) on delete restrict,
  action text not null,
  from_status text,
  to_status text,
  reason_code text,
  note text,
  done_by uuid,
  done_by_name text,
  done_at timestamptz not null default now()
);
create index if not exists spending_events_request_idx on public.spending_events (request_id, done_at);

-- Money moved from the main account into the Paystack expenses wallet (moving the school's own money, not spending).
create table if not exists public.spending_wallet_topups (
  id uuid primary key default gen_random_uuid(),
  amount numeric(12,2) not null check (amount > 0),
  topped_on date not null,
  reference text check (reference is null or length(reference) <= 80),
  note text check (note is null or length(note) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_name text,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text check (void_reason is null or void_reason in ('entered_twice', 'wrong_amount', 'other')),
  void_note text,
  check ((voided_at is null) = (void_reason is null)),
  check (void_reason is distinct from 'other' or coalesce(btrim(void_note), '') <> '')
);

-- Expense records: link to the request/receipt they came from, and void instead of delete.
alter table public.finance_expenses add column if not exists spending_request_id uuid references public.spending_requests(id) on delete restrict;
alter table public.finance_expenses add column if not exists spending_receipt_id uuid references public.spending_receipts(id) on delete restrict;
alter table public.finance_expenses add column if not exists voided_at timestamptz;
alter table public.finance_expenses add column if not exists voided_by uuid references auth.users(id) on delete set null;
alter table public.finance_expenses add column if not exists void_reason text;
alter table public.finance_expenses add column if not exists void_note text;
alter table public.finance_expenses drop constraint if exists finance_expenses_void_check;
alter table public.finance_expenses add constraint finance_expenses_void_check check (
  (voided_at is null) = (void_reason is null)
  and (void_reason is null or void_reason in ('entered_twice', 'wrong_details', 'not_school_expense', 'other'))
  and (void_reason is distinct from 'other' or coalesce(btrim(void_note), '') <> '')
);
create unique index if not exists finance_expenses_receipt_once_idx on public.finance_expenses (spending_receipt_id) where spending_receipt_id is not null;
create unique index if not exists finance_expenses_charge_once_idx on public.finance_expenses (spending_request_id)
  where spending_request_id is not null and spending_receipt_id is null;

insert into public.expense_categories (name, description)
values ('Bank charges', 'Transfer fees and stamp duty on payments')
on conflict (name) do nothing;

-- Staff can switch spending emails off and on like the others.
alter table public.email_preferences add column if not exists spending boolean not null default true;
alter table public.email_outbox drop constraint if exists email_outbox_category_check;
alter table public.email_outbox add constraint email_outbox_category_check
  check (category in ('notification', 'message', 'announcement', 'test', 'spending'));

create or replace function public.email_address_for(p_user uuid, p_category text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  left join public.email_preferences p on p.user_id = u.id
  where u.id = p_user
    and u.email is not null and u.email like '%@%'
    and case p_category
          when 'notification' then coalesce(p.notifications, true)
          when 'message' then coalesce(p.messages, true)
          when 'announcement' then coalesce(p.announcements, true)
          when 'spending' then coalesce(p.spending, true)
          else true
        end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers

create or replace function public.spending_lagos_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Africa/Lagos')::date; $$;

create or replace function public.spending_add_working_days(p_from date, p_days int)
returns date
language plpgsql
immutable
as $$
declare
  d date := p_from;
  n int := 0;
begin
  while n < greatest(p_days, 0) loop
    d := d + 1;
    if extract(isodow from d) < 6 then
      n := n + 1;
    end if;
  end loop;
  return d;
end;
$$;

create or replace function public.spending_my_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Unknown') from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.spending_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Unknown') from public.profiles p where p.id = p_user;
$$;

create or replace function public.spending_is_staff_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role::text in ('super_admin', 'admin', 'teacher', 'front_desk', 'nurse') from public.profiles where id = p_user), false);
$$;

create or replace function public.spending_approve_limit(p_user uuid default auth.uid())
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when public.spending_is_staff_user(p_user)
              then coalesce((select approve_up_to from public.spending_permissions where user_id = p_user), 0)
              else 0 end;
$$;

create or replace function public.spending_can_pay(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.spending_is_staff_user(p_user)
     and coalesce((select can_pay_out from public.spending_permissions where user_id = p_user), false);
$$;

-- Admins and anyone with a spending permission see every request.
create or replace function public.spending_sees_all()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false) or public.spending_approve_limit() > 0 or public.spending_can_pay();
$$;

create or replace function public.spending_can_see(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.spending_sees_all(), false)
      or exists (select 1 from public.spending_requests r where r.id = p_request and r.requester_id = auth.uid());
$$;

create or replace function public.spending_reason_ok(p_list text, p_code text, p_note text)
returns boolean
language sql
immutable
as $$
  select p_code = any (case p_list
      when 'decline' then array['not_in_budget', 'not_needed', 'too_expensive', 'duplicate', 'missing_details', 'other']
      when 'send_back' then array['missing_details', 'wrong_amount', 'wrong_bank_details', 'need_quote', 'other']
      when 'cancel' then array['no_longer_needed', 'made_by_mistake', 'duplicate', 'other']
      when 'return' then array['receipts_unclear', 'amounts_dont_match', 'missing_receipt', 'change_not_received', 'other']
      when 'remove_receipt' then array['added_by_mistake', 'wrong_amount', 'other']
      else array[]::text[] end)
    and (p_code <> 'other' or coalesce(btrim(p_note), '') <> '');
$$;

create or replace function public.spending_log(p_request uuid, p_action text, p_from text, p_to text, p_reason text default null, p_note text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.spending_events (request_id, action, from_status, to_status, reason_code, note, done_by, done_by_name)
  values (p_request, p_action, p_from, p_to, p_reason, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(),
          coalesce(public.spending_my_name(), case when auth.uid() is null then 'Paystack / system' end));
$$;

-- Paystack's price list for a transfer, plus the ₦50 stamp duty on ₦10,000 or more.
create or replace function public.spending_paystack_charge(p_amount numeric)
returns numeric
language sql
immutable
as $$
  select (case when p_amount <= 5000 then 10 when p_amount <= 50000 then 25 else 50 end)
       + (case when p_amount >= 10000 then 50 else 0 end);
$$;

-- Posts the expense records for a request that is closing: one per receipt, and the bank charge. Internal.
create or replace function public.spending_post_expenses(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  t record;
begin
  select * into r from public.spending_requests where id = p_request;
  select id, academic_year_id into t from public.academic_terms where is_active order by starts_on desc nulls last limit 1;

  insert into public.finance_expenses (academic_year_id, academic_term_id, category_id, vendor_name, description, amount,
                                       method, reference, spent_at, attachment_path, created_by, spending_request_id, spending_receipt_id)
  select t.academic_year_id, t.id, coalesce(x.category_id, r.category_id), x.vendor,
         left(r.request_no || ': ' || r.purpose || coalesce(' (' || x.note || ')', ''), 1000), x.amount,
         r.pay_method, r.request_no, (x.spent_on + time '12:00') at time zone 'Africa/Lagos', x.file_path, auth.uid(),
         r.id, x.id
  from public.spending_receipts x
  where x.request_id = r.id and x.removed_at is null
  on conflict do nothing;

  if r.charge > 0 then
    insert into public.finance_expenses (academic_year_id, academic_term_id, category_id, vendor_name, description, amount,
                                         method, reference, spent_at, created_by, spending_request_id)
    select t.academic_year_id, t.id, c.id, 'Paystack', 'Transfer charge for ' || r.request_no, r.charge,
           r.pay_method, coalesce(r.pay_reference, r.request_no), coalesce(r.paid_at, now()), auth.uid(), r.id
    from public.expense_categories c where c.name = 'Bank charges'
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Asking (new request, or resubmitting one that was sent back)
--
-- p: {id?, kind, category_id, purpose, amount, needed_by?,
--     payee_id? | payee: {name, bank_name, bank_code?, account_number, account_name?, checked?},
--     receipts?: [{path, hash, amount, vendor, spent_on, note?}]  -- required for supplier / reimburse}
create or replace function public.spending_save_request(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s public.spending_settings;
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_kind text := p->>'kind';
  v_cat uuid := nullif(p->>'category_id', '')::uuid;
  v_purpose text := btrim(coalesce(p->>'purpose', ''));
  v_amount numeric := round(coalesce(nullif(p->>'amount', '')::numeric, 0), 2);
  v_needed date := nullif(p->>'needed_by', '')::date;
  v_payee public.spending_payees;
  v_new_payee boolean := false;
  v_old_payee uuid;
  v_other_name text;
  pe jsonb := p->'payee';
  old public.spending_requests;
  v_flags text[] := '{}';
  v_no text;
  v_year int := extract(year from public.spending_lagos_today())::int;
  v_n int;
  v_sum numeric;
  rc jsonb;
  v_budget numeric;
  v_used numeric;
begin
  if me is null or not public.spending_is_staff_user(me) then
    raise exception 'Only staff can ask for money.';
  end if;
  select * into s from public.spending_settings where id = 1;
  if v_kind is null or v_kind not in ('advance', 'supplier', 'reimburse') then
    raise exception 'Choose what kind of request this is.';
  end if;
  if v_cat is null or not exists (select 1 from public.expense_categories where id = v_cat) then
    raise exception 'Choose what the money is for (the category).';
  end if;
  if v_purpose = '' then
    raise exception 'Say what the money is for.';
  end if;
  if v_amount <= 0 then
    raise exception 'Type the amount needed.';
  end if;

  if v_id is not null then
    select * into old from public.spending_requests where id = v_id for update;
    if not found or old.requester_id <> me then
      raise exception 'You can only change your own request.';
    end if;
    if old.status <> 'sent_back' then
      raise exception 'This request can only be changed after it has been sent back to you.';
    end if;
  end if;

  -- One overdue advance blocks a new advance (retire before fresh).
  if v_kind = 'advance' and exists (
    select 1 from public.spending_requests
    where requester_id = me and kind = 'advance' and status in ('paid', 'checking') and due_by < public.spending_lagos_today()
      and (v_id is null or id <> v_id)
  ) then
    raise exception 'You have an advance that is overdue. Account for it before asking for a new one.';
  end if;

  -- Who is paid: a saved payee, or new details (which replace the old ones).
  if nullif(p->>'payee_id', '') is not null then
    select * into v_payee from public.spending_payees where id = (p->>'payee_id')::uuid and active;
    if not found then
      raise exception 'Those bank details are no longer in use. Enter them again.';
    end if;
    if v_kind in ('advance', 'reimburse') and not (v_payee.kind = 'staff' and v_payee.user_id = me) then
      raise exception 'Advances and pay-backs go to your own bank account.';
    end if;
    if v_kind = 'supplier' and v_payee.kind <> 'supplier' then
      raise exception 'Choose a supplier.';
    end if;
  elsif pe is not null then
    if coalesce(pe->>'account_number', '') !~ '^[0-9]{10}$' then
      raise exception 'The account number must be 10 digits.';
    end if;
    if v_kind = 'supplier' then
      if coalesce(btrim(pe->>'name'), '') = '' then
        raise exception 'Type the supplier''s name.';
      end if;
      select * into v_payee from public.spending_payees
      where kind = 'supplier' and active and lower(btrim(name)) = lower(btrim(pe->>'name'));
    else
      select * into v_payee from public.spending_payees where kind = 'staff' and active and user_id = me;
    end if;
    if found and (v_payee.account_number <> pe->>'account_number'
                  or coalesce(v_payee.bank_code, lower(v_payee.bank_name)) <> coalesce(nullif(pe->>'bank_code', ''), lower(btrim(pe->>'bank_name')))) then
      v_old_payee := v_payee.id;
      update public.spending_payees set active = false, deactivated_at = now() where id = v_old_payee;
      v_new_payee := true;
    elsif not found then
      v_new_payee := true;
    end if;
    if v_new_payee and v_kind = 'supplier' then
      select name into v_other_name from public.spending_payees
      where kind = 'supplier' and active and account_number = pe->>'account_number'
        and coalesce(bank_code, lower(bank_name)) = coalesce(nullif(pe->>'bank_code', ''), lower(btrim(pe->>'bank_name')));
      if v_other_name is not null then
        raise exception 'That account is already saved for the supplier "%". Choose that supplier instead.', v_other_name;
      end if;
    end if;
    if v_new_payee then
      insert into public.spending_payees (kind, user_id, name, bank_name, bank_code, account_number, account_name, account_checked_at, created_by)
      values (case when v_kind = 'supplier' then 'supplier' else 'staff' end,
              case when v_kind = 'supplier' then null else me end,
              case when v_kind = 'supplier' then btrim(pe->>'name') else coalesce(public.spending_my_name(), 'Staff') end,
              btrim(pe->>'bank_name'), nullif(btrim(coalesce(pe->>'bank_code', '')), ''), pe->>'account_number',
              nullif(btrim(coalesce(pe->>'account_name', '')), ''),
              case when coalesce((pe->>'checked')::boolean, false) then now() end, me)
      returning * into v_payee;
      if v_old_payee is not null then
        update public.spending_payees set replaced_by = v_payee.id where id = v_old_payee;
      end if;
      v_flags := v_flags || 'new_bank_details'::text;
    end if;
  else
    raise exception 'Enter the bank details for the payment.';
  end if;

  -- Possible split purchase: small requests in the same category within 7 days that together pass the check amount.
  select coalesce(sum(amount), 0) into v_sum from public.spending_requests
  where requester_id = me and category_id = v_cat and created_at >= now() - interval '7 days'
    and status not in ('declined', 'cancelled') and (v_id is null or id <> v_id);
  if v_amount <= s.split_check_amount and v_sum + v_amount > s.split_check_amount and v_sum > 0 then
    v_flags := v_flags || 'split_check'::text;
  end if;

  -- Over the category's budget for this term (when a budget exists).
  select f.budget, f.spent + f.committed into v_budget, v_used from public.spending_category_figures() f where f.category_id = v_cat;
  if v_budget is not null and v_used + v_amount > v_budget then
    v_flags := v_flags || 'over_budget'::text;
  end if;

  if v_id is null then
    insert into public.spending_counters (year, last_no) values (v_year, 1)
    on conflict (year) do update set last_no = public.spending_counters.last_no + 1
    returning last_no into v_n;
    v_no := 'SR-' || v_year || '-' || lpad(v_n::text, 5, '0');
    insert into public.spending_requests (request_no, kind, requester_id, requester_name, category_id, purpose, amount, needed_by,
                                          payee_id, payee_name, bank_name, bank_code, account_number, account_name, flags, approvals_needed)
    values (v_no, v_kind, me, public.spending_my_name(), v_cat, v_purpose, v_amount, v_needed,
            v_payee.id, v_payee.name, v_payee.bank_name, v_payee.bank_code, v_payee.account_number, v_payee.account_name,
            v_flags, case when v_amount > s.second_approval_above then 2 else 1 end)
    returning id into v_id;
    perform public.spending_log(v_id, 'submitted', null, 'submitted');
  else
    update public.spending_requests
       set kind = v_kind, category_id = v_cat, purpose = v_purpose, amount = v_amount, needed_by = v_needed,
           payee_id = v_payee.id, payee_name = v_payee.name, bank_name = v_payee.bank_name, bank_code = v_payee.bank_code,
           account_number = v_payee.account_number, account_name = v_payee.account_name, flags = v_flags,
           approvals_needed = case when v_amount > s.second_approval_above then 2 else 1 end,
           status = 'submitted', submitted_at = now(), updated_at = now()
     where id = v_id;
    -- Receipts attached when asking are replaced by the ones sent now.
    update public.spending_receipts set removed_at = now(), removed_by = me, remove_reason = 'replaced_on_resubmit'
     where request_id = v_id and stage = 'request' and removed_at is null;
    perform public.spending_log(v_id, 'resubmitted', 'sent_back', 'submitted');
  end if;

  -- Receipts or invoice (supplier / pay me back): required, and must add up to the amount.
  if v_kind in ('supplier', 'reimburse') then
    if jsonb_typeof(p->'receipts') is distinct from 'array' or jsonb_array_length(p->'receipts') = 0 then
      raise exception '%', case when v_kind = 'supplier' then 'Add a photo of the supplier''s invoice or quote.' else 'Add a photo of your receipt.' end;
    end if;
    for rc in select * from jsonb_array_elements(p->'receipts') loop
      perform public.spending_insert_receipt(v_id, 'request', rc);
    end loop;
    select coalesce(sum(amount), 0) into v_sum from public.spending_receipts where request_id = v_id and removed_at is null;
    if v_sum <> v_amount then
      raise exception 'The receipts add up to ₦% but the request is for ₦%. Make them match.', to_char(v_sum, 'FM999,999,999,990.00'), to_char(v_amount, 'FM999,999,999,990.00');
    end if;
  end if;

  return v_id;
end;
$$;

-- Adds one receipt (internal; callers check who may). rc: {path?, hash?, amount, vendor, spent_on, category_id?,
-- no_receipt_reason?, seller_phone?, note?}
create or replace function public.spending_insert_receipt(p_request uuid, p_stage text, rc jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_path text := nullif(rc->>'path', '');
  v_hash text := lower(nullif(rc->>'hash', ''));
  v_amount numeric := round(coalesce(nullif(rc->>'amount', '')::numeric, 0), 2);
  v_vendor text := btrim(coalesce(rc->>'vendor', ''));
  v_on date := nullif(rc->>'spent_on', '')::date;
  v_other text;
  v_id uuid;
begin
  if v_amount <= 0 then raise exception 'Type the amount on each receipt.'; end if;
  if v_vendor = '' then raise exception 'Type who was paid (the seller) for each receipt.'; end if;
  if v_on is null or v_on > public.spending_lagos_today() then raise exception 'Give the date on each receipt (not in the future).'; end if;
  if v_path is not null and v_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then
    raise exception 'That receipt picture could not be found. Add it again.';
  end if;
  if v_path is null and p_stage = 'request' then
    raise exception 'Add a photo of each receipt or invoice.';
  end if;
  if v_path is null and (coalesce(rc->>'no_receipt_reason', '') not in ('no_receipt_given', 'transport_fare', 'receipt_lost', 'other')
                         or (rc->>'no_receipt_reason' = 'other' and coalesce(btrim(rc->>'note'), '') = '')) then
    raise exception 'Add a receipt photo, or choose why there is no receipt (and explain Other).';
  end if;
  if v_hash is not null then
    select r.request_no into v_other from public.spending_receipts x join public.spending_requests r on r.id = x.request_id
    where x.file_hash = v_hash and x.removed_at is null limit 1;
    if v_other is not null then
      raise exception 'This receipt picture has already been used on %.', v_other;
    end if;
  end if;
  insert into public.spending_receipts (request_id, stage, file_path, file_hash, amount, vendor, spent_on, category_id,
                                        no_receipt_reason, seller_phone, note, added_by, added_by_name)
  values (p_request, p_stage, v_path, v_hash, v_amount, v_vendor, v_on, nullif(rc->>'category_id', '')::uuid,
          case when v_path is null then rc->>'no_receipt_reason' end,
          nullif(btrim(coalesce(rc->>'seller_phone', '')), ''), nullif(btrim(coalesce(rc->>'note', '')), ''), me, public.spending_my_name())
  returning id into v_id;

  -- Same seller, amount and date already on another receipt: flag it for the checker.
  if exists (select 1 from public.spending_receipts x where x.id <> v_id and x.removed_at is null
             and lower(btrim(x.vendor)) = lower(v_vendor) and x.amount = v_amount and x.spent_on = v_on) then
    update public.spending_requests set flags = array(select distinct unnest(flags || 'similar_receipt'::text)) where id = p_request;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Deciding

create or replace function public.spending_decide(p_request uuid, p_decision text, p_reason text default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.spending_requests;
  s public.spending_settings;
  v_limit numeric := public.spending_approve_limit(me);
  v_count int;
  v_covers boolean;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  select * into s from public.spending_settings where id = 1;
  if r.status <> 'submitted' then raise exception 'This request is not waiting for a decision.'; end if;
  if r.requester_id = me then raise exception 'You can''t decide on your own request.'; end if;
  if v_limit < least(r.amount, s.second_approval_above) then
    raise exception 'Your approval limit doesn''t cover this request.';
  end if;

  if p_decision = 'approve' then
    if exists (select 1 from public.spending_approvals where request_id = r.id and approver_id = me and withdrawn_at is null) then
      raise exception 'You have already approved this request.';
    end if;
    select count(*), coalesce(bool_or(limit_at >= r.amount), false) into v_count, v_covers
    from public.spending_approvals where request_id = r.id and withdrawn_at is null;
    if v_count + 1 >= r.approvals_needed and not (v_covers or v_limit >= r.amount) then
      raise exception 'The final approval must come from someone whose limit covers ₦%.', to_char(r.amount, 'FM999,999,999,990.00');
    end if;
    insert into public.spending_approvals (request_id, approver_id, approver_name, limit_at) values (r.id, me, public.spending_my_name(), v_limit);
    if v_count + 1 >= r.approvals_needed then
      update public.spending_requests set status = 'approved', updated_at = now() where id = r.id;
      perform public.spending_log(r.id, 'approved', 'submitted', 'approved', null, p_note);
      return 'approved';
    end if;
    perform public.spending_log(r.id, 'first_approval', 'submitted', 'submitted', null, p_note);
    return 'first_approval';
  elsif p_decision in ('decline', 'send_back') then
    if not public.spending_reason_ok(p_decision, p_reason, p_note) then
      raise exception 'Choose a reason (and explain it if you choose Other).';
    end if;
    update public.spending_approvals set withdrawn_at = now() where request_id = r.id and withdrawn_at is null;
    update public.spending_requests set status = case when p_decision = 'decline' then 'declined' else 'sent_back' end, updated_at = now()
     where id = r.id;
    perform public.spending_log(r.id, case when p_decision = 'decline' then 'declined' else 'sent_back' end, 'submitted',
                                case when p_decision = 'decline' then 'declined' else 'sent_back' end, p_reason, p_note);
    return p_decision;
  end if;
  raise exception 'Unknown decision.';
end;
$$;

create or replace function public.spending_cancel(p_request uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if not (r.requester_id = auth.uid() or coalesce(public.is_admin(), false)) then
    raise exception 'Only the person who asked, or an admin, can cancel a request.';
  end if;
  if r.status not in ('submitted', 'sent_back', 'approved') then
    raise exception 'This request can''t be cancelled now (it is being paid or has been paid).';
  end if;
  if not public.spending_reason_ok('cancel', p_reason, p_note) then
    raise exception 'Choose a reason (and explain it if you choose Other).';
  end if;
  update public.spending_approvals set withdrawn_at = now() where request_id = r.id and withdrawn_at is null;
  update public.spending_requests set status = 'cancelled', updated_at = now() where id = r.id;
  perform public.spending_log(r.id, 'cancelled', r.status, 'cancelled', p_reason, p_note);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Paying out

-- Checks the person paying may pay this request. Internal.
create or replace function public.spending_check_payer(r public.spending_requests, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s public.spending_settings;
begin
  select * into s from public.spending_settings where id = 1;
  if not public.spending_can_pay(me) then raise exception 'You don''t have permission to pay out.'; end if;
  if r.requester_id = me then raise exception 'You can''t pay out your own request.'; end if;
  if exists (select 1 from public.spending_approvals where request_id = r.id and approver_id = me and withdrawn_at is null) then
    if r.amount > s.approver_may_pay_up_to then
      raise exception 'You approved this request, so someone else must pay it out.';
    end if;
    if coalesce(btrim(p_note), '') = '' then
      raise exception 'You approved this request too. Add a note saying why no one else can pay it out.';
    end if;
  end if;
end;
$$;

-- Marks a request paid (internal): advances wait to be accounted for; the others close and post their expenses.
create or replace function public.spending_mark_paid(p_request uuid, p_method text, p_reference text, p_slip text, p_charge numeric,
                                                     p_by uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  s public.spending_settings;
  v_to text;
begin
  select * into r from public.spending_requests where id = p_request for update;
  select * into s from public.spending_settings where id = 1;
  v_to := case when r.kind = 'advance' then 'paid' else 'closed' end;
  update public.spending_requests
     set status = v_to, pay_method = p_method, pay_reference = nullif(btrim(coalesce(p_reference, '')), ''), pay_slip_path = p_slip,
         paid_at = now(), paid_by = p_by, paid_by_name = public.spending_name_of(p_by), charge = coalesce(p_charge, 0),
         due_by = case when r.kind = 'advance' then public.spending_add_working_days(public.spending_lagos_today(), s.account_within_days) end,
         closed_at = case when v_to = 'closed' then now() end, closed_by = case when v_to = 'closed' then p_by end,
         updated_at = now()
   where id = r.id;
  perform public.spending_log(r.id, 'paid', r.status, 'paid', null, p_note);
  if v_to = 'closed' then
    perform public.spending_post_expenses(r.id);
    perform public.spending_log(r.id, 'closed', 'paid', 'closed');
  end if;
  return v_to;
end;
$$;

-- Paid another way (bank app, cash, POS).
create or replace function public.spending_record_payout(p_request uuid, p_method text, p_reference text, p_slip text default null,
                                                         p_charge numeric default 0, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'approved' then raise exception 'Only approved requests can be paid.'; end if;
  perform public.spending_check_payer(r, p_note);
  if p_method is null or p_method not in ('bank_app', 'cash', 'pos') then raise exception 'Choose how it was paid.'; end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then raise exception 'Type the transfer or POS reference.'; end if;
  if p_slip is not null and p_slip !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then
    raise exception 'That slip picture could not be found. Add it again.';
  end if;
  if coalesce(p_charge, 0) < 0 or coalesce(p_charge, 0) > 10000 then raise exception 'The bank charge looks wrong.'; end if;
  return public.spending_mark_paid(r.id, p_method, p_reference, p_slip, p_charge, auth.uid(), p_note);
end;
$$;

-- Starts a Paystack payment: checks, sets "paying" and returns what the website needs to call Paystack.
create or replace function public.spending_paystack_begin(p_request uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  v_ref text;
  v_recipient text;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'approved' then raise exception 'Only approved requests can be paid.'; end if;
  perform public.spending_check_payer(r, p_note);
  if r.bank_code is null then
    raise exception 'These bank details weren''t checked with Paystack, so they can''t be paid through it. Pay another way, or send the request back.';
  end if;
  v_ref := 'greenfield-' || lower(r.request_no) || '-' || (r.paystack_attempt + 1);
  update public.spending_requests
     set status = 'paying', paystack_attempt = paystack_attempt + 1, paystack_reference = v_ref, paystack_status = 'starting',
         paystack_transfer_code = null, paystack_message = null, paying_by = auth.uid(), updated_at = now()
   where id = r.id;
  perform public.spending_log(r.id, 'paying', 'approved', 'paying', null, p_note);
  select paystack_recipient_code into v_recipient from public.spending_payees where id = r.payee_id;
  return jsonb_build_object('reference', v_ref, 'amount', r.amount, 'request_no', r.request_no, 'payee_id', r.payee_id,
                            'name', r.payee_name, 'bank_code', r.bank_code, 'account_number', r.account_number,
                            'account_name', r.account_name, 'recipient_code', v_recipient, 'purpose', r.purpose);
end;
$$;

-- What Paystack said (website server with the service key only: webhook, or after a check with Paystack).
create or replace function public.spending_paystack_result(p_reference text, p_status text, p_transfer_code text default null,
                                                           p_message text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
begin
  select * into r from public.spending_requests where paystack_reference = p_reference for update;
  if not found then return 'unknown'; end if;
  if r.status <> 'paying' then
    -- Already settled. A reversal after success is flagged for people to deal with.
    if p_status = 'reversed' and r.status in ('paid', 'checking', 'closed') and not ('payment_reversed' = any (r.flags)) then
      update public.spending_requests set flags = flags || 'payment_reversed'::text, paystack_status = 'reversed', updated_at = now() where id = r.id;
      perform public.spending_log(r.id, 'payment_reversed', r.status, r.status, null, p_message);
    end if;
    return 'ignored';
  end if;
  if p_status = 'success' then
    update public.spending_requests set paystack_status = 'success', paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code) where id = r.id;
    return public.spending_mark_paid(r.id, 'paystack', coalesce(p_transfer_code, r.paystack_transfer_code, p_reference), null,
                                     public.spending_paystack_charge(r.amount), r.paying_by, null);
  elsif p_status in ('failed', 'reversed', 'abandoned') then
    update public.spending_requests set status = 'approved', paystack_status = p_status, paystack_message = left(p_message, 300), updated_at = now() where id = r.id;
    perform public.spending_log(r.id, 'payment_failed', 'paying', 'approved', null, p_message);
    return 'failed';
  else
    -- otp, pending, received: still in progress
    update public.spending_requests set paystack_status = p_status, paystack_transfer_code = coalesce(p_transfer_code, paystack_transfer_code),
           paystack_message = left(p_message, 300), updated_at = now() where id = r.id;
    return 'waiting';
  end if;
end;
$$;

-- Remembers Paystack's recipient for a payee (service key only).
create or replace function public.spending_set_recipient(p_payee uuid, p_code text, p_account_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.spending_payees set paystack_recipient_code = p_code,
         account_name = coalesce(nullif(btrim(p_account_name), ''), account_name), account_checked_at = now()
   where id = p_payee;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Accounting for an advance

create or replace function public.spending_add_receipt(p_request uuid, rc jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  v_id uuid;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found or r.requester_id <> auth.uid() then raise exception 'You can only add receipts to your own request.'; end if;
  if r.status <> 'paid' or r.kind <> 'advance' then raise exception 'Receipts are added after an advance is paid, before you send it for checking.'; end if;
  v_id := public.spending_insert_receipt(r.id, 'accounting', rc);
  perform public.spending_log(r.id, 'receipt_added', r.status, r.status, null,
          (select vendor || ' ₦' || to_char(amount, 'FM999,999,999,990.00') from public.spending_receipts where id = v_id));
  return v_id;
end;
$$;

create or replace function public.spending_remove_receipt(p_receipt uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  x public.spending_receipts;
  r public.spending_requests;
begin
  select * into x from public.spending_receipts where id = p_receipt;
  if not found or x.removed_at is not null then raise exception 'Receipt not found.'; end if;
  select * into r from public.spending_requests where id = x.request_id for update;
  if r.requester_id <> auth.uid() or r.status <> 'paid' or x.stage <> 'accounting' then
    raise exception 'Only your own receipts can be taken off, before you send them for checking.';
  end if;
  if not public.spending_reason_ok('remove_receipt', p_reason, p_note) then raise exception 'Choose a reason.'; end if;
  update public.spending_receipts set removed_at = now(), removed_by = auth.uid(), remove_reason = p_reason where id = x.id;
  perform public.spending_log(r.id, 'receipt_removed', r.status, r.status, p_reason, coalesce(p_note, x.vendor));
end;
$$;

create or replace function public.spending_send_accounting(p_request uuid, p_change numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  v_sum numeric;
  v_change numeric := round(coalesce(p_change, 0), 2);
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found or r.requester_id <> auth.uid() then raise exception 'You can only account for your own advance.'; end if;
  if r.status <> 'paid' or r.kind <> 'advance' then raise exception 'This advance isn''t waiting to be accounted for.'; end if;
  if v_change < 0 then raise exception 'The change can''t be less than zero.'; end if;
  select coalesce(sum(amount), 0) into v_sum from public.spending_receipts where request_id = r.id and removed_at is null and stage = 'accounting';
  if v_sum + v_change <> r.amount then
    raise exception 'Receipts (₦%) plus change (₦%) must equal the ₦% you were paid.',
      to_char(v_sum, 'FM999,999,999,990.00'), to_char(v_change, 'FM999,999,999,990.00'), to_char(r.amount, 'FM999,999,999,990.00');
  end if;
  update public.spending_requests set status = 'checking', change_returned = v_change, accounted_at = now(), updated_at = now() where id = r.id;
  perform public.spending_log(r.id, 'accounted', 'paid', 'checking', null,
          case when v_change > 0 then 'Change returned: ₦' || to_char(v_change, 'FM999,999,999,990.00') end);
end;
$$;

create or replace function public.spending_check_accounting(p_request uuid, p_decision text, p_reason text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.spending_requests;
  s public.spending_settings;
  v_unreceipted numeric;
begin
  select * into r from public.spending_requests where id = p_request for update;
  if not found then raise exception 'Request not found.'; end if;
  select * into s from public.spending_settings where id = 1;
  if r.status <> 'checking' then raise exception 'This advance isn''t waiting to be checked.'; end if;
  if r.requester_id = me then raise exception 'Someone else must check your receipts.'; end if;
  if not (public.spending_can_pay(me) or public.spending_approve_limit(me) > 0) then
    raise exception 'Only a cashier or an approver can check receipts.';
  end if;
  if p_decision = 'accept' then
    select coalesce(max(amount), 0) into v_unreceipted from public.spending_receipts
    where request_id = r.id and removed_at is null and file_path is null;
    if v_unreceipted > s.no_receipt_max and public.spending_approve_limit(me) <= 0 then
      raise exception 'An item without a receipt is over ₦%, so an approver must accept it.', to_char(s.no_receipt_max, 'FM999,999,999,990');
    end if;
    update public.spending_requests set status = 'closed', closed_at = now(), closed_by = me, updated_at = now() where id = r.id;
    perform public.spending_post_expenses(r.id);
    perform public.spending_log(r.id, 'closed', 'checking', 'closed', null, p_note);
  elsif p_decision = 'return' then
    if not public.spending_reason_ok('return', p_reason, p_note) then raise exception 'Choose a reason (and explain Other).'; end if;
    update public.spending_requests set status = 'paid', change_returned = null, accounted_at = null, updated_at = now() where id = r.id;
    perform public.spending_log(r.id, 'returned', 'checking', 'paid', p_reason, p_note);
  else
    raise exception 'Unknown decision.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Permissions, settings, wallet top-ups, voiding expenses

create or replace function public.spending_set_permission(p_user uuid, p_approve_up_to numeric, p_can_pay boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old public.spending_permissions;
  v_limit numeric := case when coalesce(p_approve_up_to, 0) > 0 then round(p_approve_up_to, 2) end;
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then
    raise exception 'Only a super admin can give or change spending permissions.';
  end if;
  if p_user = auth.uid() and (select count(*) from public.profiles where role = 'super_admin') > 1 then
    raise exception 'Another super admin must change your own spending permissions.';
  end if;
  if not public.spending_is_staff_user(p_user) then
    raise exception 'Spending permissions are for staff accounts only.';
  end if;
  select * into old from public.spending_permissions where user_id = p_user;
  if old.approve_up_to is not distinct from v_limit and coalesce(old.can_pay_out, false) = coalesce(p_can_pay, false) then
    return;
  end if;
  insert into public.spending_permissions (user_id, approve_up_to, can_pay_out, updated_by, updated_at)
  values (p_user, v_limit, coalesce(p_can_pay, false), auth.uid(), now())
  on conflict (user_id) do update set approve_up_to = excluded.approve_up_to, can_pay_out = excluded.can_pay_out,
                                      updated_by = excluded.updated_by, updated_at = now();
  insert into public.spending_permission_log (subject, user_id, user_name, changes, note, done_by, done_by_name)
  values ('permission', p_user, public.spending_name_of(p_user),
          jsonb_build_object('approve_up_to', jsonb_build_array(old.approve_up_to, v_limit),
                             'can_pay_out', jsonb_build_array(coalesce(old.can_pay_out, false), coalesce(p_can_pay, false))),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), public.spending_my_name());
end;
$$;

create or replace function public.spending_save_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old public.spending_settings;
  new_row public.spending_settings;
begin
  if coalesce(public.current_role()::text, '') <> 'super_admin' then
    raise exception 'Only a super admin can change the spending settings.';
  end if;
  select * into old from public.spending_settings where id = 1;
  update public.spending_settings set
    second_approval_above = coalesce(nullif(p->>'second_approval_above', '')::numeric, second_approval_above),
    approver_may_pay_up_to = coalesce(nullif(p->>'approver_may_pay_up_to', '')::numeric, approver_may_pay_up_to),
    account_within_days = coalesce(nullif(p->>'account_within_days', '')::smallint, account_within_days),
    no_receipt_max = coalesce(nullif(p->>'no_receipt_max', '')::numeric, no_receipt_max),
    split_check_amount = coalesce(nullif(p->>'split_check_amount', '')::numeric, split_check_amount),
    low_balance_alert = case when p ? 'low_balance_alert' then nullif(p->>'low_balance_alert', '')::numeric else low_balance_alert end,
    updated_by = auth.uid(), updated_at = now()
  where id = 1
  returning * into new_row;
  insert into public.spending_permission_log (subject, changes, done_by, done_by_name)
  select 'settings', jsonb_object_agg(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new_row) -> k)), auth.uid(), public.spending_my_name()
  from unnest(array['second_approval_above', 'approver_may_pay_up_to', 'account_within_days', 'no_receipt_max', 'split_check_amount', 'low_balance_alert']) k
  where (to_jsonb(old) -> k) is distinct from (to_jsonb(new_row) -> k)
  having count(*) > 0;
end;
$$;

create or replace function public.spending_record_topup(p_amount numeric, p_on date, p_reference text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (coalesce(public.is_admin(), false) or public.spending_can_pay()) then
    raise exception 'Only admins and cashiers can record wallet top-ups.';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Type the amount moved into the wallet.'; end if;
  if p_on is null or p_on > public.spending_lagos_today() then raise exception 'Give the date of the top-up (not in the future).'; end if;
  insert into public.spending_wallet_topups (amount, topped_on, reference, note, recorded_by, recorded_by_name)
  values (round(p_amount, 2), p_on, nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), public.spending_my_name())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.spending_void_topup(p_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.is_admin(), false) or public.spending_can_pay()) then
    raise exception 'Only admins and cashiers can correct wallet top-ups.';
  end if;
  update public.spending_wallet_topups
     set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason, void_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id and voided_at is null;
  if not found then raise exception 'Top-up not found, or already marked as a mistake.'; end if;
end;
$$;

create or replace function public.finance_void_expense(p_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.finance_expenses;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can correct expense records.'; end if;
  select * into e from public.finance_expenses where id = p_id for update;
  if not found or e.voided_at is not null then raise exception 'Expense not found, or already voided.'; end if;
  if e.spending_request_id is not null then
    raise exception 'This expense came from spending request records. Ask the developers to correct it so the request stays right.';
  end if;
  update public.finance_expenses set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason,
         void_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Figures for screens

-- Per category this term: budget (if one is set), spent (expense records), committed (requests approved or paid, not closed).
create or replace function public.spending_category_figures()
returns table (category_id uuid, name text, budget numeric, spent numeric, committed numeric)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select id, academic_year_id, starts_on, ends_on from public.academic_terms where is_active order by starts_on desc nulls last limit 1)
  select c.id, c.name,
         (select sum(bl.budgeted_amount) from public.finance_budget_lines bl join public.finance_budgets b on b.id = bl.budget_id
           where bl.expense_category_id = c.id and b.academic_term_id = (select id from t)),
         coalesce((select sum(e.amount) from public.finance_expenses e
           where e.category_id = c.id and e.voided_at is null
             and e.spent_at >= coalesce((select starts_on from t), date_trunc('year', now())::date)
             and e.spent_at < coalesce((select ends_on from t) + 1, now() + interval '1 day')), 0),
         coalesce((select sum(r.amount) from public.spending_requests r
           where r.category_id = c.id and r.status in ('approved', 'paying', 'paid', 'checking')), 0)
  from public.expense_categories c
  where coalesce(public.is_staff(), false)
  order by c.name;
$$;

-- Counts for the dashboard badge and the tabs.
create or replace function public.spending_my_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'to_approve', (select count(*) from public.spending_requests r, public.spending_settings s
                   where s.id = 1 and r.status = 'submitted' and r.requester_id <> auth.uid()
                     and public.spending_approve_limit() >= least(r.amount, s.second_approval_above)
                     and not exists (select 1 from public.spending_approvals a where a.request_id = r.id and a.approver_id = auth.uid() and a.withdrawn_at is null)),
    'to_pay', case when public.spending_can_pay() then (select count(*) from public.spending_requests where status in ('approved', 'paying') and requester_id <> auth.uid()) else 0 end,
    'to_check', case when public.spending_can_pay() or public.spending_approve_limit() > 0
                     then (select count(*) from public.spending_requests where status = 'checking' and requester_id <> auth.uid()) else 0 end,
    'mine_to_do', (select count(*) from public.spending_requests where requester_id = auth.uid() and status in ('sent_back', 'paid'))
  )
  where coalesce(public.is_staff(), false);
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Emails for each step (category "spending"; links to the staff dashboard)

create or replace function public.spending_email(p_user uuid, r public.spending_requests, p_subject text, p_heading text, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  select public.email_enqueue(p_user, 'spending', p_subject, p_heading, p_body, '/admin/spending/' || r.id, r.id, 1);
$$;

create or replace function public.spending_events_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.spending_requests;
  s public.spending_settings;
  u uuid;
  amt text;
  reason_text text;
begin
  select * into r from public.spending_requests where id = new.request_id;
  select * into s from public.spending_settings where id = 1;
  amt := '₦' || to_char(r.amount, 'FM999,999,999,990.00');
  reason_text := coalesce(initcap(replace(new.reason_code, '_', ' ')), '') || coalesce(': ' || new.note, '');

  if new.action in ('submitted', 'resubmitted', 'first_approval') then
    for u in select p.user_id from public.spending_permissions p
             where public.spending_approve_limit(p.user_id) >= least(r.amount, s.second_approval_above)
               and p.user_id <> r.requester_id
               and not exists (select 1 from public.spending_approvals a where a.request_id = r.id and a.approver_id = p.user_id and a.withdrawn_at is null)
    loop
      perform public.spending_email(u, r, r.request_no || ': ' || amt || ' waiting for your approval',
        coalesce(r.requester_name, 'A member of staff') || ' asked for ' || amt,
        r.purpose || case when new.action = 'first_approval' then E'\n\nIt has one approval and needs a second.' else '' end);
    end loop;
  elsif new.action = 'approved' then
    perform public.spending_email(r.requester_id, r, r.request_no || ' approved', 'Your request for ' || amt || ' was approved',
      'It will be paid soon. You''ll get an email when it is.');
    for u in select p.user_id from public.spending_permissions p where public.spending_can_pay(p.user_id) and p.user_id <> r.requester_id loop
      perform public.spending_email(u, r, r.request_no || ': ' || amt || ' ready to pay', 'Approved and ready to pay: ' || amt,
        coalesce(r.requester_name, '') || ': ' || r.purpose);
    end loop;
  elsif new.action in ('declined', 'sent_back') then
    perform public.spending_email(r.requester_id, r,
      r.request_no || case when new.action = 'declined' then ' declined' else ' sent back for changes' end,
      case when new.action = 'declined' then 'Your request for ' || amt || ' was declined' else 'Your request for ' || amt || ' needs changes' end,
      'Reason: ' || reason_text);
  elsif new.action = 'paid' then
    perform public.spending_email(r.requester_id, r, r.request_no || ' paid',
      case when r.kind = 'supplier' then amt || ' was paid to ' || r.payee_name else amt || ' was paid to your account' end,
      case when r.kind = 'advance' then 'Please add your receipts and any change by ' || to_char(r.due_by, 'FMDay DD Mon YYYY') || '.' else 'The request is now closed.' end);
  elsif new.action = 'payment_failed' then
    for u in select p.user_id from public.spending_permissions p where public.spending_can_pay(p.user_id) and p.user_id <> r.requester_id loop
      perform public.spending_email(u, r, r.request_no || ': Paystack payment failed', 'The Paystack payment of ' || amt || ' did not go through',
        coalesce(new.note, 'Paystack gave no reason.') || E'\n\nThe request is back in "To pay".');
    end loop;
  elsif new.action = 'payment_reversed' then
    for u in select p.user_id from public.spending_permissions p where public.spending_can_pay(p.user_id) loop
      perform public.spending_email(u, r, r.request_no || ': payment reversed by the bank', 'Paystack says the payment of ' || amt || ' was reversed',
        'Check the Paystack dashboard and the request.');
    end loop;
  elsif new.action = 'accounted' then
    for u in select p.user_id from public.spending_permissions p
             where (public.spending_can_pay(p.user_id) or public.spending_approve_limit(p.user_id) > 0) and p.user_id <> r.requester_id loop
      perform public.spending_email(u, r, r.request_no || ': receipts to check', coalesce(r.requester_name, 'Staff') || ' accounted for ' || amt,
        'Check the receipts and any change returned.');
    end loop;
  elsif new.action = 'returned' then
    perform public.spending_email(r.requester_id, r, r.request_no || ': receipts need another look', 'Your receipts for ' || amt || ' were sent back',
      'Reason: ' || reason_text);
  elsif new.action = 'closed' and r.kind = 'advance' then
    perform public.spending_email(r.requester_id, r, r.request_no || ' closed', 'Your advance of ' || amt || ' is closed', 'Thank you.');
  end if;
  return null;
exception when others then
  raise warning 'spending_events_email failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists spending_events_email on public.spending_events;
create trigger spending_events_email after insert on public.spending_events
  for each row execute function public.spending_events_email();

-- Daily reminders and the 7:00 summary (scheduled by 20261119b_spending_schedule.sql, weekdays).
create or replace function public.spending_daily_run()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.spending_lagos_today();
  s public.spending_settings;
  r public.spending_requests;
  u uuid;
  n int := 0;
  late int;
  v_body text;
begin
  select * into s from public.spending_settings where id = 1;

  -- Advances due soon or overdue
  for r in select * from public.spending_requests where status = 'paid' and kind = 'advance' and due_by is not null loop
    late := today - r.due_by;
    if late >= -2 and late <= 0 then
      perform public.spending_email(r.requester_id, r, r.request_no || ': receipts due ' || to_char(r.due_by, 'FMDay DD Mon'),
        'Please account for your advance of ₦' || to_char(r.amount, 'FM999,999,999,990.00'), 'Add your receipts and any change by ' || to_char(r.due_by, 'FMDay DD Mon') || '.');
      n := n + 1;
    elsif late > 0 then
      perform public.spending_email(r.requester_id, r, r.request_no || ': receipts overdue', 'Your advance is ' || late || ' day(s) overdue',
        'Add your receipts and any change today. You can''t get a new advance until this one is accounted for.');
      n := n + 1;
      if late >= 3 then
        for u in select p.user_id from public.spending_permissions p
                 where p.user_id <> r.requester_id
                   and (public.spending_can_pay(p.user_id)
                        or exists (select 1 from public.spending_approvals a where a.request_id = r.id and a.approver_id = p.user_id and a.withdrawn_at is null)
                        or (late >= 7 and public.spending_approve_limit(p.user_id) >= s.second_approval_above)) loop
          perform public.spending_email(u, r, r.request_no || ': advance overdue (' || late || ' days)',
            coalesce(r.requester_name, 'A member of staff') || ' hasn''t accounted for ₦' || to_char(r.amount, 'FM999,999,999,990.00'),
            'It was due on ' || to_char(r.due_by, 'FMDay DD Mon') || '.');
          n := n + 1;
        end loop;
      end if;
    end if;
  end loop;

  -- Waiting for approval for more than a working day
  for r in select * from public.spending_requests where status = 'submitted' and public.spending_add_working_days((submitted_at at time zone 'Africa/Lagos')::date, 1) < today loop
    for u in select p.user_id from public.spending_permissions p
             where public.spending_approve_limit(p.user_id) >= least(r.amount, s.second_approval_above) and p.user_id <> r.requester_id
               and not exists (select 1 from public.spending_approvals a where a.request_id = r.id and a.approver_id = p.user_id and a.withdrawn_at is null) loop
      perform public.spending_email(u, r, r.request_no || ': still waiting for approval', 'A request for ₦' || to_char(r.amount, 'FM999,999,999,990.00') || ' is still waiting',
        coalesce(r.requester_name, '') || ': ' || r.purpose);
      n := n + 1;
    end loop;
  end loop;

  -- Morning summary for cashiers and top approvers
  select 'Waiting for approval: ' || count(*) filter (where status = 'submitted') || E'\n'
      || 'Approved, waiting to be paid: ' || count(*) filter (where status in ('approved', 'paying')) || E'\n'
      || 'Receipts to check: ' || count(*) filter (where status = 'checking') || E'\n'
      || 'Money with staff (advances not yet accounted for): ₦' || to_char(coalesce(sum(amount) filter (where status in ('paid', 'checking') and kind = 'advance'), 0), 'FM999,999,999,990.00') || E'\n'
      || 'Overdue advances: ' || count(*) filter (where status = 'paid' and kind = 'advance' and due_by < today)
    into v_body
  from public.spending_requests
  having count(*) filter (where status in ('submitted', 'approved', 'paying', 'checking', 'paid')) > 0;
  if v_body is not null then
    for u in select p.user_id from public.spending_permissions p
             where public.spending_can_pay(p.user_id) or public.spending_approve_limit(p.user_id) >= s.second_approval_above loop
      perform public.email_enqueue(u, 'spending', 'Spending requests this morning', 'Spending requests: where things stand', v_body, '/admin/spending', null, 2);
      n := n + 1;
    end loop;
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Access (RLS). Reads by policy; every write through the functions above.

alter table public.spending_settings enable row level security;
alter table public.spending_permissions enable row level security;
alter table public.spending_permission_log enable row level security;
alter table public.spending_payees enable row level security;
alter table public.spending_counters enable row level security;
alter table public.spending_requests enable row level security;
alter table public.spending_approvals enable row level security;
alter table public.spending_receipts enable row level security;
alter table public.spending_events enable row level security;
alter table public.spending_wallet_topups enable row level security;

drop policy if exists spending_settings_read on public.spending_settings;
create policy spending_settings_read on public.spending_settings for select to authenticated using (coalesce(public.is_staff(), false));
drop policy if exists spending_permissions_read on public.spending_permissions;
create policy spending_permissions_read on public.spending_permissions for select to authenticated using (coalesce(public.is_staff(), false));
drop policy if exists spending_permission_log_read on public.spending_permission_log;
create policy spending_permission_log_read on public.spending_permission_log for select to authenticated using (coalesce(public.is_admin(), false));
drop policy if exists spending_payees_read on public.spending_payees;
create policy spending_payees_read on public.spending_payees for select to authenticated
  using ((kind = 'staff' and user_id = auth.uid()) or (kind = 'supplier' and coalesce(public.is_staff(), false)) or public.spending_sees_all());
drop policy if exists spending_requests_read on public.spending_requests;
create policy spending_requests_read on public.spending_requests for select to authenticated
  using (requester_id = auth.uid() or public.spending_sees_all());
drop policy if exists spending_approvals_read on public.spending_approvals;
create policy spending_approvals_read on public.spending_approvals for select to authenticated using (public.spending_can_see(request_id));
drop policy if exists spending_receipts_read on public.spending_receipts;
create policy spending_receipts_read on public.spending_receipts for select to authenticated using (public.spending_can_see(request_id));
drop policy if exists spending_events_read on public.spending_events;
create policy spending_events_read on public.spending_events for select to authenticated using (public.spending_can_see(request_id));
drop policy if exists spending_wallet_topups_read on public.spending_wallet_topups;
create policy spending_wallet_topups_read on public.spending_wallet_topups for select to authenticated
  using (coalesce(public.is_admin(), false) or public.spending_can_pay());

revoke insert, update, delete, truncate on public.spending_settings, public.spending_permissions, public.spending_permission_log,
  public.spending_payees, public.spending_counters, public.spending_requests, public.spending_approvals, public.spending_receipts,
  public.spending_events, public.spending_wallet_topups from anon, authenticated;
revoke select on public.spending_counters from anon, authenticated;

-- FIX: money records admins only (they were open to every staff role). Staff may read category names.
drop policy if exists finance_expenses_staff_all on public.finance_expenses;
drop policy if exists finance_expenses_admin_read on public.finance_expenses;
create policy finance_expenses_admin_read on public.finance_expenses for select to authenticated using (coalesce(public.is_admin(), false));
drop policy if exists finance_expenses_admin_insert on public.finance_expenses;
create policy finance_expenses_admin_insert on public.finance_expenses for insert to authenticated
  with check (coalesce(public.is_admin(), false) and spending_request_id is null and spending_receipt_id is null and voided_at is null);
revoke update, delete, truncate on public.finance_expenses from anon, authenticated;

drop policy if exists expense_categories_staff_all on public.expense_categories;
drop policy if exists expense_categories_staff_read on public.expense_categories;
create policy expense_categories_staff_read on public.expense_categories for select to authenticated using (coalesce(public.is_staff(), false));
drop policy if exists expense_categories_admin_write on public.expense_categories;
create policy expense_categories_admin_write on public.expense_categories for all to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

drop policy if exists finance_budgets_staff_all on public.finance_budgets;
drop policy if exists finance_budgets_admin_all on public.finance_budgets;
create policy finance_budgets_admin_all on public.finance_budgets for all to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));
drop policy if exists finance_budget_lines_staff_all on public.finance_budget_lines;
drop policy if exists finance_budget_lines_admin_all on public.finance_budget_lines;
create policy finance_budget_lines_admin_all on public.finance_budget_lines for all to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

-- Functions: what the app may call, and the internal ones it may not.
revoke all on function public.spending_lagos_today() from public, anon;
revoke all on function public.spending_add_working_days(date, int) from public, anon;
revoke all on function public.spending_my_name() from public, anon, authenticated;
revoke all on function public.spending_name_of(uuid) from public, anon, authenticated;
revoke all on function public.spending_is_staff_user(uuid) from public, anon, authenticated;
revoke all on function public.spending_approve_limit(uuid) from public, anon;
revoke all on function public.spending_can_pay(uuid) from public, anon;
revoke all on function public.spending_sees_all() from public, anon;
revoke all on function public.spending_can_see(uuid) from public, anon;
revoke all on function public.spending_reason_ok(text, text, text) from public, anon;
revoke all on function public.spending_log(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.spending_paystack_charge(numeric) from public, anon;
revoke all on function public.spending_post_expenses(uuid) from public, anon, authenticated;
revoke all on function public.spending_insert_receipt(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.spending_check_payer(public.spending_requests, text) from public, anon, authenticated;
revoke all on function public.spending_mark_paid(uuid, text, text, text, numeric, uuid, text) from public, anon, authenticated;
revoke all on function public.spending_paystack_result(text, text, text, text) from public, anon, authenticated;
revoke all on function public.spending_set_recipient(uuid, text, text) from public, anon, authenticated;
revoke all on function public.spending_email(uuid, public.spending_requests, text, text, text) from public, anon, authenticated;
revoke all on function public.spending_events_email() from public, anon, authenticated;
revoke all on function public.spending_daily_run() from public, anon, authenticated;
-- Used by the read policies, so signed-in people must be able to run them (they only answer about themselves).
grant execute on function public.spending_sees_all(), public.spending_can_see(uuid), public.spending_approve_limit(uuid),
  public.spending_can_pay(uuid) to authenticated;
grant execute on function public.spending_paystack_result(text, text, text, text) to service_role;
grant execute on function public.spending_set_recipient(uuid, text, text) to service_role;
grant execute on function public.spending_daily_run() to service_role;

revoke all on function public.spending_save_request(jsonb) from public, anon;
revoke all on function public.spending_decide(uuid, text, text, text) from public, anon;
revoke all on function public.spending_cancel(uuid, text, text) from public, anon;
revoke all on function public.spending_record_payout(uuid, text, text, text, numeric, text) from public, anon;
revoke all on function public.spending_paystack_begin(uuid, text) from public, anon;
revoke all on function public.spending_add_receipt(uuid, jsonb) from public, anon;
revoke all on function public.spending_remove_receipt(uuid, text, text) from public, anon;
revoke all on function public.spending_send_accounting(uuid, numeric) from public, anon;
revoke all on function public.spending_check_accounting(uuid, text, text, text) from public, anon;
revoke all on function public.spending_set_permission(uuid, numeric, boolean, text) from public, anon;
revoke all on function public.spending_save_settings(jsonb) from public, anon;
revoke all on function public.spending_record_topup(numeric, date, text, text) from public, anon;
revoke all on function public.spending_void_topup(uuid, text, text) from public, anon;
revoke all on function public.finance_void_expense(uuid, text, text) from public, anon;
revoke all on function public.spending_category_figures() from public, anon;
revoke all on function public.spending_my_counts() from public, anon;
grant execute on function public.spending_save_request(jsonb), public.spending_decide(uuid, text, text, text),
  public.spending_cancel(uuid, text, text), public.spending_record_payout(uuid, text, text, text, numeric, text),
  public.spending_paystack_begin(uuid, text), public.spending_add_receipt(uuid, jsonb),
  public.spending_remove_receipt(uuid, text, text), public.spending_send_accounting(uuid, numeric),
  public.spending_check_accounting(uuid, text, text, text), public.spending_set_permission(uuid, numeric, boolean, text),
  public.spending_save_settings(jsonb), public.spending_record_topup(numeric, date, text, text),
  public.spending_void_topup(uuid, text, text), public.finance_void_expense(uuid, text, text),
  public.spending_category_figures(), public.spending_my_counts() to authenticated;

-- Storage: receipts and payment slips, private, 2MB, pictures and PDFs, each person uploads into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spending-files', 'spending-files', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists spending_files_insert on storage.objects;
create policy spending_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'spending-files' and coalesce(public.is_staff(), false) and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists spending_files_select on storage.objects;
create policy spending_files_select on storage.objects for select to authenticated
  using (bucket_id = 'spending-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.spending_sees_all()));
