-- Payment plans, default fees and early payment discounts (school policy "Fees and payment plans").
--
-- What it does, in plain words:
--   1. Fixes a leak: the invoice balance lists (finance_invoice_totals, finance_invoice_balances,
--      finance_guardian_balances) ran with the owner's rights, so anyone with the website's public key could read
--      every family's invoices, balances, names, emails and phone numbers. They now show staff everything (as before)
--      and a parent only their own family. The signed-out key can't read them at all.
--   2. Invoices, invoice lines and adjustments can be read by staff (report cards need balances) but only admins can
--      change them (the finance pages were already admins only; the database let any staff member write).
--   3. Fee types (revenue categories) can be marked as tuition, for early payment discounts.
--   4. Payment plans: a parent (on the portal, up to the first day of term) or an admin (from the signed paper
--      agreement) chooses 2 to 5 payments for an invoice. The percentages and due dates come from the policy.
--      Every plan records who agreed, their name, how, when and the policy version.
--   5. Missed payments: an admin adds the default fee (the higher of NGN 2,500 or 3% of the term's fees) or waives
--      it with a reason, once per missed payment. Parents are told on the portal and by email.
--   6. Early payment discounts on tuition, checked against when the money arrived.
--   Nothing is deleted: plans are cancelled, fees and discounts are removed with a reason, all in fee_plan_events.
--
-- Run AFTER 20261120_payment_corrections.sql. Safe to run twice. The SQL editor may warn about "destructive
-- operations": those are the "drop policy / drop trigger if exists" lines that replace older versions. Expected.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Balance lists: staff see all, a parent sees only their own family, signed-out sees nothing
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.can_see_family_money(p_guardian uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_staff(), false)
      or exists (select 1 from public.guardian_user_links gul where gul.user_id = auth.uid() and gul.guardian_id = p_guardian);
$$;
revoke all on function public.can_see_family_money(uuid) from public, anon;
grant execute on function public.can_see_family_money(uuid) to authenticated;

create or replace view public.finance_invoice_totals as
 select
   i.id as invoice_id,
   i.invoice_no,
   i.bill_to_guardian_id,
   i.student_id,
   i.academic_year_id,
   i.academic_term_id,
   i.issue_date,
   i.due_date,
   i.status,
   i.currency,
   coalesce(
     (
       select sum(ii.quantity * ii.unit_amount)
       from public.finance_invoice_items ii
       where ii.invoice_id = i.id
     ),
     0
   ) as items_total,
   coalesce(
     (
       select sum(a.amount)
       from public.finance_invoice_adjustments a
       where a.invoice_id = i.id
         and a.type in ('discount','waiver','writeoff')
     ),
     0
   ) as adjustments_minus_total,
   coalesce(
     (
       select sum(a.amount)
       from public.finance_invoice_adjustments a
       where a.invoice_id = i.id
         and a.type = 'penalty'
     ),
     0
   ) as adjustments_plus_total
 from public.finance_invoices i
 where public.can_see_family_money(i.bill_to_guardian_id);

create or replace view public.finance_guardian_balances as
 select
   g.id as guardian_id,
   g.full_name,
   g.email,
   g.phone,
   coalesce(sum(b.invoice_total), 0) as invoiced_total,
   coalesce(sum(b.allocated_total), 0) as paid_total,
   coalesce(sum(b.balance), 0) as outstanding_total
 from public.guardians g
 left join public.finance_invoice_balances b on b.bill_to_guardian_id = g.id
 where (b.status is null or b.status <> 'void')
   and public.can_see_family_money(g.id)
 group by g.id, g.full_name, g.email, g.phone;

revoke all on public.finance_invoice_totals, public.finance_invoice_balances, public.finance_guardian_balances from anon;
revoke insert, update, delete, truncate on public.finance_invoice_totals, public.finance_invoice_balances, public.finance_guardian_balances from authenticated;
grant select on public.finance_invoice_totals, public.finance_invoice_balances, public.finance_guardian_balances to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Invoices: staff read, admins write
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['finance_invoices', 'finance_invoice_items', 'finance_invoice_adjustments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (coalesce(public.is_staff(), false))', t || '_staff_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false))', t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Tuition fee types
-- ---------------------------------------------------------------------------------------------------------------

alter table public.revenue_categories add column if not exists is_tuition boolean not null default false;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.fee_payment_plans (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  instalments smallint not null check (instalments between 2 and 5),
  -- The invoice total when the plan was agreed; the payments are percentages of this (snapshot, on purpose).
  plan_total numeric(12,2) not null check (plan_total > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  agreed_via text not null check (agreed_via in ('portal', 'paper')),
  -- Portal: the name the parent typed. Paper: the name of the parent who signed.
  agreed_name text not null check (length(btrim(agreed_name)) >= 3),
  agreed_at timestamptz not null default now(),
  agreed_by uuid references auth.users(id) on delete set null,
  policy_version text not null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_by_name text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_name text,
  cancel_reason text check (cancel_reason in ('paid_in_full', 'wrong_plan', 'parent_request', 'invoice_changed', 'other')),
  cancel_note text,
  created_at timestamptz not null default now(),
  check ((status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null))
);
create unique index if not exists fee_payment_plans_one_active on public.fee_payment_plans (invoice_id) where status = 'active';
create index if not exists fee_payment_plans_invoice_idx on public.fee_payment_plans (invoice_id);

create table if not exists public.fee_payment_plan_instalments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.fee_payment_plans(id) on delete restrict,
  seq smallint not null check (seq between 1 and 5),
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  due_label text not null,
  unique (plan_id, seq)
);
create index if not exists fee_payment_plan_instalments_due_idx on public.fee_payment_plan_instalments (due_date);

create table if not exists public.fee_plan_default_charges (
  id uuid primary key default gen_random_uuid(),
  instalment_id uuid not null unique references public.fee_payment_plan_instalments(id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  status text not null check (status in ('charged', 'waived', 'removed')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  adjustment_id uuid references public.finance_invoice_adjustments(id) on delete restrict,
  reason text check (reason in ('paid_not_recorded', 'agreed_extension', 'hardship', 'charged_by_mistake', 'other')),
  note text,
  decided_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  removed_at timestamptz,
  removed_by_name text
);
create index if not exists fee_plan_default_charges_invoice_idx on public.fee_plan_default_charges (invoice_id);

create table if not exists public.fee_early_discounts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  option text not null check (option in ('two_sessions', 'one_session', 'one_term', 'two_weeks')),
  percent numeric(5,2) not null,
  tuition_total numeric(12,2) not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'applied' check (status in ('applied', 'removed')),
  adjustment_id uuid references public.finance_invoice_adjustments(id) on delete restrict,
  note text,
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users(id) on delete set null,
  applied_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  remove_reason text
);
create unique index if not exists fee_early_discounts_one_applied on public.fee_early_discounts (invoice_id) where status = 'applied';

create table if not exists public.fee_plan_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.finance_invoices(id) on delete restrict,
  plan_id uuid references public.fee_payment_plans(id) on delete restrict,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists fee_plan_events_invoice_idx on public.fee_plan_events (invoice_id, created_at desc);

alter table public.fee_payment_plans enable row level security;
alter table public.fee_payment_plan_instalments enable row level security;
alter table public.fee_plan_default_charges enable row level security;
alter table public.fee_early_discounts enable row level security;
alter table public.fee_plan_events enable row level security;

-- Reads: admins see everything; a parent sees their own family's plans, instalments, fees and discounts.
-- Teachers, front desk and the nurse see none of it. Nobody writes directly: only the functions below.
create or replace function public.fee_parent_owns_invoice(p_invoice uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.finance_invoices i
    join public.guardian_user_links gul on gul.guardian_id = i.bill_to_guardian_id
    where i.id = p_invoice and gul.user_id = auth.uid()
  );
$$;
revoke all on function public.fee_parent_owns_invoice(uuid) from public, anon;
grant execute on function public.fee_parent_owns_invoice(uuid) to authenticated;

drop policy if exists fee_payment_plans_read on public.fee_payment_plans;
create policy fee_payment_plans_read on public.fee_payment_plans for select to authenticated
  using (coalesce(public.is_admin(), false) or public.fee_parent_owns_invoice(invoice_id));

drop policy if exists fee_payment_plan_instalments_read on public.fee_payment_plan_instalments;
create policy fee_payment_plan_instalments_read on public.fee_payment_plan_instalments for select to authenticated
  using (
    coalesce(public.is_admin(), false)
    or exists (select 1 from public.fee_payment_plans p where p.id = plan_id and public.fee_parent_owns_invoice(p.invoice_id))
  );

drop policy if exists fee_plan_default_charges_read on public.fee_plan_default_charges;
create policy fee_plan_default_charges_read on public.fee_plan_default_charges for select to authenticated
  using (coalesce(public.is_admin(), false) or (status = 'charged' and public.fee_parent_owns_invoice(invoice_id)));

drop policy if exists fee_early_discounts_read on public.fee_early_discounts;
create policy fee_early_discounts_read on public.fee_early_discounts for select to authenticated
  using (coalesce(public.is_admin(), false) or (status = 'applied' and public.fee_parent_owns_invoice(invoice_id)));

drop policy if exists fee_plan_events_admin_read on public.fee_plan_events;
create policy fee_plan_events_admin_read on public.fee_plan_events for select to authenticated
  using (coalesce(public.is_admin(), false));

revoke insert, update, delete, truncate on public.fee_payment_plans, public.fee_payment_plan_instalments,
  public.fee_plan_default_charges, public.fee_early_discounts, public.fee_plan_events from anon, authenticated;
revoke select on public.fee_payment_plans, public.fee_payment_plan_instalments,
  public.fee_plan_default_charges, public.fee_early_discounts, public.fee_plan_events from anon;

-- An adjustment made by a default fee or a discount can only be removed through its function (with a reason).
create or replace function public.fee_adjustment_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.fee_plan_change', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.fee_plan_default_charges c where c.adjustment_id = old.id)
     or exists (select 1 from public.fee_early_discounts d where d.adjustment_id = old.id) then
    raise exception 'This came from a payment plan or an early payment discount. Remove it there, with a reason.';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists fee_adjustment_guard on public.finance_invoice_adjustments;
create trigger fee_adjustment_guard before update or delete on public.finance_invoice_adjustments
  for each row execute function public.fee_adjustment_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The policy's plans (the one place the percentages and weeks live)
-- ---------------------------------------------------------------------------------------------------------------

-- week 0 = the first day of term; -1 = the last day of term ("before collecting the report card");
-- n = Friday of week n, where week 1 is the week the term starts in.
create or replace function public.fee_plan_template(p_instalments int)
returns table (seq int, percent numeric, week int, label text)
language sql
immutable
as $$
  select v.seq, v.percent, v.week, v.label from (values
    (2, 1, 55::numeric, 0, 'By the first day'), (2, 2, 45, 5, 'By week 5'),
    (3, 1, 40, 0, 'By the first day'), (3, 2, 30, 4, 'By week 4'), (3, 3, 30, 8, 'By week 8'),
    (4, 1, 30, 0, 'By the first day'), (4, 2, 30, 4, 'By week 4'), (4, 3, 20, 7, 'By week 7'), (4, 4, 20, 10, 'By week 10'),
    (5, 1, 25, 0, 'By the first day'), (5, 2, 20, 4, 'By week 4'), (5, 3, 20, 7, 'By week 7'), (5, 4, 20, 10, 'By week 10'),
    (5, 5, 15, -1, 'Before collecting the report card')
  ) v(n, seq, percent, week, label)
  where v.n = p_instalments
  order by v.seq;
$$;

create or replace function public.fee_plan_due_date(p_starts date, p_ends date, p_week int)
returns date
language sql
immutable
as $$
  select case
    when p_week = 0 then p_starts
    when p_week = -1 then p_ends
    else (p_starts - (extract(isodow from p_starts)::int - 1)) + 7 * (p_week - 1) + 4
  end;
$$;

create or replace function public.fee_lagos_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Africa/Lagos')::date; $$;

create or replace function public.fee_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select nullif(btrim(full_name), '') from public.profiles where id = auth.uid()), (select email from public.profiles where id = auth.uid()), 'Someone'); $$;

-- Tell the parents who pay this invoice (never the pupil): bell + the usual notification email.
create or replace function public.fee_notify_parents(p_invoice uuid, p_kind text, p_title text, p_body text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, student_id, kind, title, body, link, ref_id)
  select gul.user_id, i.student_id, p_kind, left(p_title, 200), left(p_body, 500),
         '/portal/billing' || case when i.student_id is not null then '?student_id=' || i.student_id::text else '' end,
         p_ref
  from public.finance_invoices i
  join public.guardian_user_links gul on gul.guardian_id = i.bill_to_guardian_id
  where i.id = p_invoice and gul.user_id is not null;
exception when others then
  raise warning 'fee_notify_parents failed: %', sqlerrm;
end;
$$;

create or replace function public.fee_log(p_invoice uuid, p_plan uuid, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.fee_plan_events (invoice_id, plan_id, action, detail, done_by, done_by_name)
  values (p_invoice, p_plan, p_action, coalesce(p_detail, '{}'::jsonb), auth.uid(), public.fee_actor_name());
$$;

revoke all on function public.fee_plan_template(int) from public, anon;
grant execute on function public.fee_plan_template(int) to authenticated;
revoke all on function public.fee_plan_due_date(date, date, int) from public, anon;
grant execute on function public.fee_plan_due_date(date, date, int) to authenticated;
revoke all on function public.fee_lagos_today() from public, anon;
grant execute on function public.fee_lagos_today() to authenticated;
revoke all on function public.fee_actor_name() from public, anon, authenticated;
revoke all on function public.fee_notify_parents(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fee_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Choosing a plan
-- ---------------------------------------------------------------------------------------------------------------

-- What each payment would be. Admins, or the parent who pays the invoice.
create or replace function public.preview_payment_plan(p_invoice uuid, p_instalments int)
returns table (seq int, percent numeric, amount numeric, due_date date, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total numeric; v_status text; v_starts date; v_ends date; v_sum numeric := 0; r record; v_count int;
begin
  if not (coalesce(public.is_admin(), false) or public.fee_parent_owns_invoice(p_invoice)) then
    raise exception 'You can only see plans for your own invoices.';
  end if;
  if p_instalments is null or p_instalments not between 2 and 5 then
    raise exception 'Choose 2, 3, 4 or 5 payments.';
  end if;
  select b.invoice_total, b.status::text, t.starts_on, t.ends_on
    into v_total, v_status, v_starts, v_ends
  from public.finance_invoice_balances b
  left join public.academic_terms t on t.id = b.academic_term_id
  where b.invoice_id = p_invoice;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_status = 'void' then raise exception 'This invoice has been cancelled.'; end if;
  if v_starts is null or v_ends is null then
    raise exception 'The term for this invoice has no start and end dates yet. Set them under Fee setup > Academic years.';
  end if;
  if coalesce(v_total, 0) <= 0 then raise exception 'There is nothing to pay on this invoice.'; end if;
  select count(*) into v_count from public.fee_plan_template(p_instalments);
  for r in select * from public.fee_plan_template(p_instalments) loop
    seq := r.seq; percent := r.percent; label := r.label;
    due_date := public.fee_plan_due_date(v_starts, v_ends, r.week);
    if r.seq = v_count then amount := v_total - v_sum;
    else amount := round(v_total * r.percent / 100, 2); v_sum := v_sum + amount; end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.preview_payment_plan(uuid, int) from public, anon;
grant execute on function public.preview_payment_plan(uuid, int) to authenticated;

create or replace function public.create_payment_plan(p_invoice uuid, p_instalments int, p_agreed_name text, p_policy_version text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := coalesce(public.is_admin(), false);
  v_parent boolean := public.fee_parent_owns_invoice(p_invoice);
  v_total numeric; v_balance numeric; v_starts date; v_ends date; v_status text;
  v_plan uuid; v_name text := btrim(coalesce(p_agreed_name, ''));
begin
  if not (v_admin or v_parent) then raise exception 'You can only set up a plan for your own invoice.'; end if;
  if length(v_name) < 3 then
    raise exception '%', case when v_admin then 'Type the name of the parent who signed the agreement.' else 'Type your full name to agree.' end;
  end if;
  if coalesce(btrim(p_policy_version), '') = '' then raise exception 'Policy version is missing.'; end if;

  -- Lock the invoice so two people can't make two plans at once.
  perform 1 from public.finance_invoices where id = p_invoice for update;
  select b.invoice_total, b.balance, b.status::text, t.starts_on, t.ends_on
    into v_total, v_balance, v_status, v_starts, v_ends
  from public.finance_invoice_balances b
  left join public.academic_terms t on t.id = b.academic_term_id
  where b.invoice_id = p_invoice;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_status = 'void' then raise exception 'This invoice has been cancelled.'; end if;
  if coalesce(v_balance, 0) <= 0 then raise exception 'This invoice is already paid.'; end if;
  if exists (select 1 from public.fee_payment_plans where invoice_id = p_invoice and status = 'active') then
    raise exception 'This invoice already has a payment plan.';
  end if;
  if not v_admin and (v_starts is null or public.fee_lagos_today() > v_starts) then
    raise exception 'Plans can be chosen on the portal up to the first day of term. Please contact the school office.';
  end if;

  insert into public.fee_payment_plans (invoice_id, instalments, plan_total, agreed_via, agreed_name, agreed_by,
                                        policy_version, recorded_by, recorded_by_name)
  values (p_invoice, p_instalments, v_total, case when v_admin then 'paper' else 'portal' end, v_name,
          case when v_admin then null else auth.uid() end, btrim(p_policy_version), auth.uid(), public.fee_actor_name())
  returning id into v_plan;

  insert into public.fee_payment_plan_instalments (plan_id, seq, percent, amount, due_date, due_label)
  select v_plan, p.seq, p.percent, p.amount, p.due_date, p.label from public.preview_payment_plan(p_invoice, p_instalments) p;

  perform public.fee_log(p_invoice, v_plan, 'plan_created',
    jsonb_build_object('instalments', p_instalments, 'plan_total', v_total, 'via', case when v_admin then 'paper' else 'portal' end, 'agreed_name', v_name, 'policy_version', btrim(p_policy_version)));
  if v_admin then
    perform public.fee_notify_parents(p_invoice, 'fee_plan', 'Payment plan set up',
      p_instalments || ' payments agreed for this term''s fees. Open Fees & billing to see the amounts and dates.', v_plan);
  end if;
  return v_plan;
end;
$$;
revoke all on function public.create_payment_plan(uuid, int, text, text) from public, anon;
grant execute on function public.create_payment_plan(uuid, int, text, text) to authenticated;

create or replace function public.cancel_payment_plan(p_plan uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_invoice uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can cancel a payment plan.'; end if;
  if p_reason is null or p_reason not in ('paid_in_full', 'wrong_plan', 'parent_request', 'invoice_changed', 'other') then
    raise exception 'Choose a reason from the list.';
  end if;
  if p_reason = 'other' and v_note is null then raise exception 'Type the reason.'; end if;
  update public.fee_payment_plans
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_by_name = public.fee_actor_name(),
         cancel_reason = p_reason, cancel_note = v_note
   where id = p_plan and status = 'active'
  returning invoice_id into v_invoice;
  if v_invoice is null then raise exception 'This plan is not active.'; end if;
  perform public.fee_log(v_invoice, p_plan, 'plan_cancelled', jsonb_build_object('reason', p_reason, 'note', v_note));
end;
$$;
revoke all on function public.cancel_payment_plan(uuid, text, text) from public, anon;
grant execute on function public.cancel_payment_plan(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Where each payment stands
-- ---------------------------------------------------------------------------------------------------------------

-- One row per payment of the invoice's active plan. "due_so_far" = this and earlier payments plus default fees
-- added for earlier missed payments; a payment is met when the money paid on the invoice reaches it.
create or replace function public.payment_plan_status(p_invoice uuid)
returns table (
  plan_id uuid, instalment_id uuid, seq int, percent numeric, amount numeric, due_date date, due_label text,
  due_so_far numeric, paid_towards numeric, state text, default_status text, default_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_paid numeric; v_today date := public.fee_lagos_today(); v_prev numeric := 0; v_fees numeric := 0; r record;
begin
  if not (coalesce(public.is_admin(), false) or public.fee_parent_owns_invoice(p_invoice)) then
    raise exception 'You can only see plans for your own invoices.';
  end if;
  select coalesce(b.allocated_total, 0) into v_paid from public.finance_invoice_balances b where b.invoice_id = p_invoice;
  for r in
    select i.*, p.id as pid, c.status as cstatus, c.amount as camount
    from public.fee_payment_plans p
    join public.fee_payment_plan_instalments i on i.plan_id = p.id
    left join public.fee_plan_default_charges c on c.instalment_id = i.id
    where p.invoice_id = p_invoice and p.status = 'active'
    order by i.seq
  loop
    plan_id := r.pid; instalment_id := r.id; seq := r.seq; percent := r.percent; amount := r.amount;
    due_date := r.due_date; due_label := r.due_label;
    due_so_far := v_prev + r.amount + v_fees;
    paid_towards := greatest(0, least(r.amount, coalesce(v_paid, 0) - v_prev - v_fees));
    state := case
      when coalesce(v_paid, 0) >= due_so_far then 'paid'
      when r.due_date < v_today then 'missed'
      when r.due_date <= v_today + 7 then 'due_soon'
      else 'upcoming' end;
    default_status := r.cstatus;
    default_amount := case when r.cstatus = 'charged' then r.camount end;
    return next;
    v_prev := v_prev + r.amount;
    if r.cstatus = 'charged' then v_fees := v_fees + r.camount; end if;
  end loop;
end;
$$;
revoke all on function public.payment_plan_status(uuid) from public, anon;
grant execute on function public.payment_plan_status(uuid) to authenticated;

-- Missed payments still waiting for an admin to add the default fee or waive it. Admins only.
create or replace function public.fee_plan_missed()
returns table (
  instalment_id uuid, plan_id uuid, invoice_id uuid, invoice_no text, student_id uuid, guardian_id uuid,
  seq int, instalments int, due_date date, due_so_far numeric, paid numeric, default_fee numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare p record; s record;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can see missed payments.'; end if;
  for p in
    select distinct fp.id, fp.invoice_id, fp.instalments, fp.plan_total, b.invoice_no, b.student_id, b.bill_to_guardian_id, b.allocated_total, b.status
    from public.fee_payment_plans fp
    join public.fee_payment_plan_instalments i on i.plan_id = fp.id
    join public.finance_invoice_balances b on b.invoice_id = fp.invoice_id
    where fp.status = 'active' and i.due_date < public.fee_lagos_today() and b.status::text <> 'void'
  loop
    for s in select * from public.payment_plan_status(p.invoice_id) loop
      if s.state = 'missed' and s.default_status is null then
        instalment_id := s.instalment_id; plan_id := p.id; invoice_id := p.invoice_id; invoice_no := p.invoice_no;
        student_id := p.student_id; guardian_id := p.bill_to_guardian_id; seq := s.seq; instalments := p.instalments;
        due_date := s.due_date; due_so_far := s.due_so_far; paid := p.allocated_total;
        default_fee := greatest(2500, round(p.plan_total * 0.03, 2));
        return next;
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.fee_plan_missed() from public, anon;
grant execute on function public.fee_plan_missed() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Default fees
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.charge_plan_default(p_instalment uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.fee_payment_plans; v_inst public.fee_payment_plan_instalments; v_state text;
  v_fee numeric; v_adj uuid; v_charge uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can add a default fee.'; end if;
  select * into v_inst from public.fee_payment_plan_instalments where id = p_instalment;
  if not found then raise exception 'Payment not found.'; end if;
  select * into v_plan from public.fee_payment_plans where id = v_inst.plan_id for update;
  if v_plan.status <> 'active' then raise exception 'This plan has been cancelled.'; end if;
  if exists (select 1 from public.fee_plan_default_charges where instalment_id = p_instalment) then
    raise exception 'A decision has already been made for this payment.';
  end if;
  select s.state into v_state from public.payment_plan_status(v_plan.invoice_id) s where s.instalment_id = p_instalment;
  if v_state is distinct from 'missed' then
    raise exception 'This payment is not missed (it is paid or not yet due). Refresh the page.';
  end if;
  v_fee := greatest(2500, round(v_plan.plan_total * 0.03, 2));
  perform set_config('app.fee_plan_change', 'on', true);
  insert into public.finance_invoice_adjustments (invoice_id, type, amount, notes)
  values (v_plan.invoice_id, 'penalty', v_fee,
          'Default fee: payment ' || v_inst.seq || ' of ' || v_plan.instalments || ' (due ' || to_char(v_inst.due_date, 'FMDD Mon YYYY') || ') was missed')
  returning id into v_adj;
  insert into public.fee_plan_default_charges (instalment_id, invoice_id, status, amount, adjustment_id, decided_by, decided_by_name)
  values (p_instalment, v_plan.invoice_id, 'charged', v_fee, v_adj, auth.uid(), public.fee_actor_name())
  returning id into v_charge;
  perform set_config('app.fee_plan_change', 'off', true);
  perform public.fee_log(v_plan.invoice_id, v_plan.id, 'default_charged',
    jsonb_build_object('seq', v_inst.seq, 'due_date', v_inst.due_date, 'amount', v_fee));
  perform public.fee_notify_parents(v_plan.invoice_id, 'fee_default', 'A fee payment was missed',
    'Payment ' || v_inst.seq || ' of your payment plan was due on ' || to_char(v_inst.due_date, 'FMDD Mon YYYY')
    || '. A default fee has been added, as set out in the school policy. Open Fees & billing for your letter and what to pay.', v_charge);
  return v_charge;
end;
$$;
revoke all on function public.charge_plan_default(uuid) from public, anon;
grant execute on function public.charge_plan_default(uuid) to authenticated;

create or replace function public.waive_plan_default(p_instalment uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_plan public.fee_payment_plans; v_inst public.fee_payment_plan_instalments; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can waive a default fee.'; end if;
  if p_reason is null or p_reason not in ('paid_not_recorded', 'agreed_extension', 'hardship', 'other') then
    raise exception 'Choose a reason from the list.';
  end if;
  if p_reason = 'other' and v_note is null then raise exception 'Type the reason.'; end if;
  select * into v_inst from public.fee_payment_plan_instalments where id = p_instalment;
  if not found then raise exception 'Payment not found.'; end if;
  select * into v_plan from public.fee_payment_plans where id = v_inst.plan_id for update;
  if exists (select 1 from public.fee_plan_default_charges where instalment_id = p_instalment) then
    raise exception 'A decision has already been made for this payment.';
  end if;
  insert into public.fee_plan_default_charges (instalment_id, invoice_id, status, amount, reason, note, decided_by, decided_by_name)
  values (p_instalment, v_plan.invoice_id, 'waived', 0, p_reason, v_note, auth.uid(), public.fee_actor_name());
  perform public.fee_log(v_plan.invoice_id, v_plan.id, 'default_waived', jsonb_build_object('seq', v_inst.seq, 'reason', p_reason, 'note', v_note));
end;
$$;
revoke all on function public.waive_plan_default(uuid, text, text) from public, anon;
grant execute on function public.waive_plan_default(uuid, text, text) to authenticated;

create or replace function public.remove_plan_default(p_charge uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_c public.fee_plan_default_charges; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_plan uuid;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can remove a default fee.'; end if;
  if p_reason is null or p_reason not in ('paid_not_recorded', 'agreed_extension', 'hardship', 'charged_by_mistake', 'other') then
    raise exception 'Choose a reason from the list.';
  end if;
  if p_reason = 'other' and v_note is null then raise exception 'Type the reason.'; end if;
  select * into v_c from public.fee_plan_default_charges where id = p_charge for update;
  if not found or v_c.status <> 'charged' then raise exception 'This default fee is not charged.'; end if;
  perform set_config('app.fee_plan_change', 'on', true);
  update public.fee_plan_default_charges
     set status = 'removed', adjustment_id = null, reason = p_reason, note = v_note, removed_at = now(), removed_by_name = public.fee_actor_name()
   where id = p_charge;
  delete from public.finance_invoice_adjustments where id = v_c.adjustment_id;
  perform set_config('app.fee_plan_change', 'off', true);
  select plan_id into v_plan from public.fee_payment_plan_instalments where id = v_c.instalment_id;
  perform public.fee_log(v_c.invoice_id, v_plan, 'default_removed', jsonb_build_object('amount', v_c.amount, 'reason', p_reason, 'note', v_note));
end;
$$;
revoke all on function public.remove_plan_default(uuid, text, text) from public, anon;
grant execute on function public.remove_plan_default(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Early payment discounts (tuition only)
-- ---------------------------------------------------------------------------------------------------------------

-- For each option: the percentage, the discount on this invoice's tuition, the date the money had to arrive by,
-- how much had arrived by then, and whether the condition is met.
create or replace function public.early_discount_options(p_invoice uuid)
returns table (option text, percent numeric, tuition_total numeric, amount numeric, deadline date, paid_by_deadline numeric, met boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_total numeric; v_starts date; v_tuition numeric; r record;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can give discounts.'; end if;
  select b.invoice_total, t.starts_on into v_total, v_starts
  from public.finance_invoice_balances b left join public.academic_terms t on t.id = b.academic_term_id
  where b.invoice_id = p_invoice;
  select coalesce(sum(ii.quantity * ii.unit_amount), 0) into v_tuition
  from public.finance_invoice_items ii join public.revenue_categories rc on rc.id = ii.revenue_category_id
  where ii.invoice_id = p_invoice and rc.is_tuition;
  for r in select * from (values ('two_sessions', 15::numeric, 0), ('one_session', 10, 0), ('one_term', 7, 0), ('two_weeks', 5, 14)) v(o, pct, days) loop
    option := r.o; percent := r.pct; tuition_total := v_tuition;
    amount := round(v_tuition * r.pct / 100, 2);
    deadline := case when v_starts is null then null else v_starts - r.days end;
    select coalesce(sum(pa.amount), 0) into paid_by_deadline
    from public.finance_payment_allocations pa join public.finance_payment_transactions pt on pt.id = pa.payment_transaction_id
    where pa.invoice_id = p_invoice and pt.status = 'posted'
      and deadline is not null and (pt.paid_at at time zone 'Africa/Lagos')::date < case when r.days = 0 then deadline else deadline + 1 end;
    met := amount > 0 and deadline is not null and paid_by_deadline >= v_total - amount;
    return next;
  end loop;
end;
$$;
revoke all on function public.early_discount_options(uuid) from public, anon;
grant execute on function public.early_discount_options(uuid) to authenticated;

create or replace function public.apply_early_discount(p_invoice uuid, p_option text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare o record; v_adj uuid; v_id uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text := case p_option when 'two_sessions' then 'two sessions in advance' when 'one_session' then 'one session in advance'
                                when 'one_term' then 'one term in advance' when 'two_weeks' then 'two weeks before the term' end;
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can give discounts.'; end if;
  if v_label is null then raise exception 'Choose an option from the list.'; end if;
  perform 1 from public.finance_invoices where id = p_invoice for update;
  if exists (select 1 from public.finance_invoices where id = p_invoice and status::text = 'void') then raise exception 'This invoice has been cancelled.'; end if;
  if exists (select 1 from public.fee_early_discounts where invoice_id = p_invoice and status = 'applied') then
    raise exception 'This invoice already has an early payment discount.';
  end if;
  if exists (select 1 from public.fee_payment_plans where invoice_id = p_invoice and status = 'active') then
    raise exception 'Early payment discounts are for paying in full, and this invoice is on a payment plan.';
  end if;
  select * into o from public.early_discount_options(p_invoice) x where x.option = p_option;
  if coalesce(o.tuition_total, 0) <= 0 then
    raise exception 'No tuition on this invoice. Mark which fee types are tuition under Fee setup > Revenue categories.';
  end if;
  if not o.met then
    raise exception 'Not paid in full in time: NGN % had to arrive by %, and NGN % had.',
      to_char((select b.invoice_total from public.finance_invoice_balances b where b.invoice_id = p_invoice) - o.amount, 'FM999,999,990.00'),
      to_char(o.deadline, 'FMDD Mon YYYY'), to_char(o.paid_by_deadline, 'FM999,999,990.00');
  end if;
  if p_option <> 'two_weeks' and v_note is null then
    raise exception 'Say which payment this was (for example "paid the whole 2026/27 session on 1 Aug").';
  end if;
  perform set_config('app.fee_plan_change', 'on', true);
  insert into public.finance_invoice_adjustments (invoice_id, type, amount, notes)
  values (p_invoice, 'discount', o.amount, 'Early payment discount: ' || o.percent || '% of tuition, paid ' || v_label)
  returning id into v_adj;
  insert into public.fee_early_discounts (invoice_id, option, percent, tuition_total, amount, adjustment_id, note, applied_by, applied_by_name)
  values (p_invoice, p_option, o.percent, o.tuition_total, o.amount, v_adj, v_note, auth.uid(), public.fee_actor_name())
  returning id into v_id;
  perform set_config('app.fee_plan_change', 'off', true);
  perform public.fee_log(p_invoice, null, 'discount_applied', jsonb_build_object('option', p_option, 'percent', o.percent, 'amount', o.amount, 'note', v_note));
  return v_id;
end;
$$;
revoke all on function public.apply_early_discount(uuid, text, text) from public, anon;
grant execute on function public.apply_early_discount(uuid, text, text) to authenticated;

create or replace function public.remove_early_discount(p_discount uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare d public.fee_early_discounts; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only admins can remove a discount.'; end if;
  if v_reason is null then raise exception 'Say why the discount is being removed.'; end if;
  select * into d from public.fee_early_discounts where id = p_discount for update;
  if not found or d.status <> 'applied' then raise exception 'This discount is not applied.'; end if;
  perform set_config('app.fee_plan_change', 'on', true);
  update public.fee_early_discounts
     set status = 'removed', adjustment_id = null, removed_at = now(), removed_by_name = public.fee_actor_name(), remove_reason = v_reason
   where id = p_discount;
  delete from public.finance_invoice_adjustments where id = d.adjustment_id;
  perform set_config('app.fee_plan_change', 'off', true);
  perform public.fee_log(d.invoice_id, null, 'discount_removed', jsonb_build_object('amount', d.amount, 'reason', v_reason));
end;
$$;
revoke all on function public.remove_early_discount(uuid, text) from public, anon;
grant execute on function public.remove_early_discount(uuid, text) to authenticated;
