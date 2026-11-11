-- Management pack history: keeps a saved copy of each finished week's and month's management pack, exactly as the
-- figures were when it was saved, so leadership can look back later (including figures that only exist "as of
-- today", such as pupils on roll and fees owed).
--
-- One saved copy per week or month, saved automatically by the website each night after a week or month ends. The
-- pack is read only: nobody can save, change or delete a copy from the website. Its figures come only from what staff
-- record day to day (registers, payments, incidents, assignments, star videos …).
-- Admins can read saved packs; no other staff, parents or pupils can see them.
--
-- Safe to run twice. The SQL editor may warn about "destructive operations": that is only the
-- "drop policy if exists" lines (they replace the reading rule, and remove any old saving rules).

-- ----------------------------------------------------------------------------------------------------------------
create table if not exists public.mi_pack_snapshots (
  id uuid primary key default gen_random_uuid(),
  view text not null check (view in ('week', 'month')),
  -- The Monday ("2026-11-09") for a week, "2026-11" for a month.
  period_key text not null,
  period_start date not null,
  period_end date not null,
  -- The whole pack (figures, comparisons, notes) as it was shown when saved.
  data jsonb not null,
  source text not null default 'automatic' check (source in ('automatic', 'manual')),
  saved_by uuid references auth.users(id) on delete set null,
  saved_by_name text,
  saved_at timestamptz not null default now(),
  unique (view, period_key)
);

create index if not exists mi_pack_snapshots_view_start_idx on public.mi_pack_snapshots(view, period_start desc);

alter table public.mi_pack_snapshots enable row level security;

drop policy if exists mi_pack_snapshots_admin_select on public.mi_pack_snapshots;
create policy mi_pack_snapshots_admin_select on public.mi_pack_snapshots
  for select to authenticated
  using (coalesce(public.is_admin(), false));

-- Read only for everyone signed in. Only the website's nightly job (service key, which bypasses these rules) writes.
drop policy if exists mi_pack_snapshots_admin_insert on public.mi_pack_snapshots;
drop policy if exists mi_pack_snapshots_admin_update on public.mi_pack_snapshots;
revoke insert, update, delete on public.mi_pack_snapshots from anon, authenticated;
revoke all on public.mi_pack_snapshots from anon;
