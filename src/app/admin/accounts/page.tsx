import Link from "next/link";
import { AlertTriangle, Hash, KeyRound, Link2, ShieldCheck, UserX, Users } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form-section";
import { ButtonLink } from "@/components/ui/button";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { isAdmissionLoginEmail } from "@/lib/admission-login";
import { AccountsTable, type AccountRow } from "./accounts-table";
import { assignNumbersAction, cancelFormatRequestAction, linkAccountAction, requestFormatChangeAction } from "./actions";

// Admin → Accounts: one place for admission numbers and portal sign-ins (pupils and parents), linked both ways to
// the pupil and parent records. Admins only (route-access adminOnlyPrefixes + the admin_* database functions).
// Passwords are never stored or shown again after they are set; see the admission-and-accounts skill.

type PupilAccount = {
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  class_id: string | null;
  class_name: string | null;
  level: string;
  status: string;
  user_id: string | null;
  login_email: string | null;
  last_sign_in_at: string | null;
  account_created_at: string | null;
  account_count: number;
  login_matches_number: boolean | null;
};

type ParentAccount = {
  guardian_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  children: string | null;
  child_ids: string[] | null;
  user_id: string | null;
  login_email: string | null;
  last_sign_in_at: string | null;
  account_created_at: string | null;
  account_count: number;
};

type Unlinked = { user_id: string; email: string | null; role: string | null; full_name: string | null; created_at: string; last_sign_in_at: string | null };
type Clash = { admission_key: string; students: Array<{ id: string; name: string; admission_number: string; status: string }> };
type Settings = {
  template: string;
  prefix: string;
  section_prefixes: Record<string, string>;
  digits: number;
  year_basis: string;
  session_start_month: number;
  auto_assign: boolean;
  updated_at: string;
};
type FormatRequest = {
  id: string;
  template: string;
  prefix: string;
  digits: number;
  year_basis: string;
  reason: string;
  current_summary: string | null;
  status: string;
  requested_by_name: string | null;
  requested_at: string;
  decided_by_name: string | null;
  decision_note: string | null;
  decided_at: string | null;
};
type LogRow = {
  id: string;
  action: string;
  student_id: string | null;
  guardian_id: string | null;
  subject_name: string | null;
  admission_number: string | null;
  detail: string | null;
  done_by_name: string | null;
  created_at: string;
};

const TABS = ["pupils", "parents", "unlinked", "format", "history"] as const;
type Tab = (typeof TABS)[number];
const ON_ROLL = ["applied", "enrolled", "active"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ACTION_LABELS: Record<string, { label: string; tone: "green" | "gold" | "blue" | "slate" | "violet" | "red" }> = {
  number_assigned: { label: "Number given", tone: "green" },
  number_changed: { label: "Number changed", tone: "gold" },
  number_removed: { label: "Number removed", tone: "red" },
  account_created: { label: "Account created", tone: "green" },
  password_reset: { label: "Password reset", tone: "blue" },
  account_linked: { label: "Account linked", tone: "violet" },
  account_unlinked: { label: "Account unlinked", tone: "slate" },
  slips_printed: { label: "Slips printed", tone: "slate" },
  settings_changed: { label: "Number format changed", tone: "gold" },
  format_change_requested: { label: "Format change asked for", tone: "blue" },
  format_change_cancelled: { label: "Format request withdrawn", tone: "slate" },
  format_change_rejected: { label: "Format change not approved", tone: "red" },
  password_viewed: { label: "Temporary password looked up", tone: "violet" },
  temporary_password_cleared: { label: "Chose their own password", tone: "green" },
  duplicate_override: { label: "Added despite a likely duplicate", tone: "gold" }
};

function signInLabel(iso: string | null) {
  if (!iso) return "Never signed in";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatLagosDate(iso);
}

function href(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/accounts?${s}` : "/admin/accounts";
}

export default async function AccountsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
}) {
  const sp = ((await searchParams) ?? {}) as Record<string, string | undefined>;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "pupils";
  const q = (sp.q ?? "").trim().toLowerCase();
  const classFilter = (sp.class_id ?? "").trim();
  const show = (sp.show ?? "").trim();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle() : { data: null };
  const printedBy = String((me as { full_name?: string; email?: string } | null)?.full_name || (me as { email?: string } | null)?.email || "an admin");

  let missing = false;
  const rpcAll = async <T,>(name: string, order: string) =>
    fetchAllRows<T>(() => ({
      range: async (from: number, to: number) => {
        const res = await supabase.rpc(name).order(order).range(from, to);
        if (res.error) missing = true;
        return res as unknown as { data: T[] | null; error: unknown };
      }
    }));

  const [pupils, parents, unlinkedRes, clashesRes, settingsRes, previewRes, logRes, classesRes, requestsRes, tempRes] = await Promise.all([
    rpcAll<PupilAccount>("admin_pupil_accounts", "last_name"),
    rpcAll<ParentAccount>("admin_parent_accounts", "full_name"),
    supabase.rpc("admin_unlinked_accounts"),
    supabase.rpc("admission_number_clashes"),
    supabase.from("admission_number_settings").select("*").maybeSingle(),
    supabase.rpc("preview_admission_number", { p_level: null }),
    tab === "history"
      ? supabase.from("account_log").select("*").order("created_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as LogRow[] }),
    supabase.from("classes").select("id, name, level").eq("active", true).order("level").order("name"),
    tab === "format"
      ? supabase.from("admission_format_requests").select("*").order("requested_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as FormatRequest[] }),
    supabase.rpc("admin_temporary_passwords")
  ]);
  // School-given temporary passwords still in force, by sign-in (dates only; the passwords stay locked).
  const tempUntilByUser = new Map(
    ((tempRes.data ?? []) as Array<{ user_id: string; expires_at: string }>).map((t) => [t.user_id, t.expires_at] as const)
  );
  const formatRequests = ((requestsRes as { data: unknown }).data ?? []) as FormatRequest[];
  const pendingRequest = formatRequests.find((r) => r.status === "pending") ?? null;
  const lastDecision = formatRequests.find((r) => r.status !== "pending") ?? null;
  if (unlinkedRes.error || settingsRes.error) missing = true;

  const unlinked = (unlinkedRes.data ?? []) as Unlinked[];
  const clashes = (clashesRes.data ?? []) as Clash[];
  const settings = (settingsRes.data ?? null) as Settings | null;
  const nextNumber = (previewRes.data ?? null) as string | null;
  const log = ((logRes as { data: unknown }).data ?? []) as LogRow[];
  const classes = (classesRes.data ?? []) as Array<{ id: string; name: string; level: string }>;

  const onRoll = pupils.filter((p) => ON_ROLL.includes(p.status));
  const pupilsWithAccount = onRoll.filter((p) => p.user_id).length;
  const pupilsNoNumber = onRoll.filter((p) => !p.admission_number).length;
  const pupilsNeverSignedIn = onRoll.filter((p) => p.user_id && !p.last_sign_in_at).length;
  const parentsWithAccount = parents.filter((p) => p.user_id).length;
  const loginMismatch = onRoll.filter((p) => p.user_id && p.login_matches_number === false);

  // ---- Pupils tab rows
  const pupilRows: AccountRow[] = onRoll
    .filter((p) => !classFilter || p.class_id === classFilter)
    .filter((p) => {
      if (show === "no_account") return !p.user_id;
      if (show === "never") return p.user_id && !p.last_sign_in_at;
      if (show === "no_number") return !p.admission_number;
      if (show === "has_account") return Boolean(p.user_id);
      if (show === "school_password") return Boolean(p.user_id && tempUntilByUser.has(p.user_id));
      return true;
    })
    .filter((p) => !q || `${p.first_name} ${p.last_name} ${p.admission_number ?? ""}`.toLowerCase().includes(q))
    .map((p) => ({
      id: p.student_id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      username: p.admission_number,
      href: `/admin/students/${p.student_id}`,
      sub: p.class_name ?? "No class",
      className: p.class_name,
      hasAccount: Boolean(p.user_id),
      tempUntil: p.user_id ? tempUntilByUser.get(p.user_id) ?? null : null,
      lastSignIn: p.last_sign_in_at,
      lastSignInLabel: signInLabel(p.last_sign_in_at),
      createdLabel: p.account_created_at ? formatLagosDate(p.account_created_at) : null,
      warning:
        p.account_count > 1
          ? `${p.account_count} sign-ins are linked to this learner.`
          : p.user_id && p.login_matches_number === false
            ? "This account signs in with an old number. Reset the password to see it, or ask the developer."
            : null,
      canCreate: Boolean(p.admission_number),
      cannotCreateReason: p.admission_number ? null : "Needs a number first"
    }));

  // ---- Parents tab rows
  const parentRows: AccountRow[] = parents
    .filter((g) => {
      if (show === "no_account") return !g.user_id;
      if (show === "never") return g.user_id && !g.last_sign_in_at;
      if (show === "no_email") return !g.email;
      if (show === "has_account") return Boolean(g.user_id);
      if (show === "school_password") return Boolean(g.user_id && tempUntilByUser.has(g.user_id));
      return true;
    })
    .filter((g) => !q || `${g.full_name} ${g.email ?? ""} ${g.phone ?? ""} ${g.children ?? ""}`.toLowerCase().includes(q))
    .map((g) => ({
      id: g.guardian_id,
      name: g.full_name,
      username: g.user_id ? g.login_email : g.email,
      href: `/admin/guardians/${g.guardian_id}`,
      sub: g.children || "No children linked",
      className: null,
      hasAccount: Boolean(g.user_id),
      tempUntil: g.user_id ? tempUntilByUser.get(g.user_id) ?? null : null,
      lastSignIn: g.last_sign_in_at,
      lastSignInLabel: signInLabel(g.last_sign_in_at),
      createdLabel: g.account_created_at ? formatLagosDate(g.account_created_at) : null,
      warning:
        g.user_id && g.email && g.login_email && g.email.toLowerCase() !== g.login_email.toLowerCase()
          ? `Signs in as ${g.login_email}, but the record's email is ${g.email}.`
          : g.account_count > 1
            ? `${g.account_count} sign-ins are linked to this parent.`
            : null,
      canCreate: Boolean(g.email),
      cannotCreateReason: g.email ? null : "Needs an email first"
    }));

  const base = { q: sp.q, class_id: classFilter || undefined, show: show || undefined };
  const tabs = [
    { key: "pupils", label: "Learners", href: href({ tab: "pupils" }), count: onRoll.length },
    { key: "parents", label: "Parents", href: href({ tab: "parents" }), count: parents.length },
    { key: "unlinked", label: "No owner", href: href({ tab: "unlinked" }), count: unlinked.length },
    { key: "format", label: "Number format", href: href({ tab: "format" }) },
    { key: "history", label: "History", href: href({ tab: "history" }) }
  ];

  const pupilFilters = [
    { key: "", label: "All", count: onRoll.length },
    { key: "no_account", label: "No account", count: onRoll.length - pupilsWithAccount },
    { key: "never", label: "Never signed in", count: pupilsNeverSignedIn },
    { key: "no_number", label: "No number", count: pupilsNoNumber },
    { key: "school_password", label: "Still on school password", count: onRoll.filter((p) => p.user_id && tempUntilByUser.has(p.user_id)).length }
  ];
  const parentFilters = [
    { key: "", label: "All", count: parents.length },
    { key: "no_account", label: "No account", count: parents.length - parentsWithAccount },
    { key: "never", label: "Never signed in", count: parents.filter((g) => g.user_id && !g.last_sign_in_at).length },
    { key: "no_email", label: "No email", count: parents.filter((g) => !g.email).length },
    { key: "school_password", label: "Still on school password", count: parents.filter((g) => g.user_id && tempUntilByUser.has(g.user_id)).length }
  ];
  const filters = tab === "parents" ? parentFilters : pupilFilters;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.accounts}
        eyebrow="Admin"
        title="Accounts and admission numbers"
        description="Every learner's admission number and portal sign-in, and every parent's, in one place. Create missing accounts, give new temporary passwords and print login slips."
        className="print:hidden"
        actions={
          <ButtonLink href="/admin/students/new" variant="secondary">
            Add a learner
          </ButtonLink>
        }
      />

      {missing ? (
        <Alert tone="warning" title="Database update needed" className="print:hidden">
          Run <code>docs/migrations/20261117_admission_numbers_and_accounts.sql</code> in Supabase to switch this page on.
        </Alert>
      ) : null}

      <Alert tone="info" title="About passwords" className="print:hidden">
        A temporary password the school gives works until the end of term. Until then an admin can look it up again
        here (tick the person, then Show passwords), for example to reprint a lost slip; every look-up is recorded
        in History. Once the person chooses their own password, the school&apos;s copy is deleted and nobody can see
        it, not even admins. At the end of term anyone still on a school password must choose their own when they
        next sign in.
      </Alert>

      {clashes.length ? (
        <Alert tone="danger" title={`${clashes.length} admission number${clashes.length === 1 ? " is" : "s are"} shared by more than one learner`} className="print:hidden">
          <ul className="mt-1 space-y-1">
            {clashes.map((c) => (
              <li key={c.admission_key}>
                {c.students.map((s, i) => (
                  <span key={s.id}>
                    {i ? " and " : ""}
                    <Link className="gf-link" href={`/admin/students/${s.id}`}>
                      {s.name} ({s.admission_number})
                    </Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Give one of each pair a new number on their page (or deactivate it if it is a duplicate). Then run the
            database update again to switch on the strict rule.
          </p>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <StatCard
          label="Learners with an account"
          value={`${pupilsWithAccount} of ${onRoll.length}`}
          hint={`${pupilsNeverSignedIn} never signed in`}
          icon={Users}
          href={href({ tab: "pupils", show: "no_account" })}
        />
        <StatCard
          label="Parents with an account"
          value={`${parentsWithAccount} of ${parents.length}`}
          hint={`${parents.filter((g) => !g.email).length} have no email`}
          icon={ShieldCheck}
          tone="blue"
          href={href({ tab: "parents", show: "no_account" })}
        />
        <StatCard
          label="Learners without a number"
          value={pupilsNoNumber}
          hint={nextNumber ? `Next number: ${nextNumber}` : "Set the format first"}
          icon={Hash}
          tone={pupilsNoNumber ? "gold" : "slate"}
          href={href({ tab: "pupils", show: "no_number" })}
        />
        <StatCard
          label="Accounts with no owner"
          value={unlinked.length}
          hint="Not linked to a learner or parent"
          icon={UserX}
          tone={unlinked.length ? "rose" : "slate"}
          href={href({ tab: "unlinked" })}
        />
      </div>

      <LinkTabs tabs={tabs} active={tab} className="print:hidden" />

      {tab === "pupils" || tab === "parents" ? (
        <Card>
          <CardBody className="space-y-4">
            <form method="get" action="/admin/accounts" className="flex flex-wrap items-end gap-3 print:hidden" role="search">
              <input type="hidden" name="tab" value={tab} />
              {show ? <input type="hidden" name="show" value={show} /> : null}
              <Field label="Search" htmlFor="acc-q" className="min-w-[14rem] flex-1">
                <input
                  id="acc-q"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  className="gf-input"
                  placeholder={tab === "pupils" ? "Name or admission number" : "Name, email, phone or child"}
                />
              </Field>
              {tab === "pupils" ? (
                <Field label="Class" htmlFor="acc-class">
                  <select id="acc-class" name="class_id" defaultValue={classFilter} className="gf-select">
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <SubmitButton variant="secondary">Show</SubmitButton>
            </form>

            <nav className="flex gap-2 overflow-x-auto pb-1 print:hidden" aria-label="Filter">
              {filters.map((f) => {
                const active = f.key === show;
                return (
                  <Link
                    key={f.key || "all"}
                    href={href({ ...base, tab, show: f.key || undefined })}
                    aria-current={active ? "true" : undefined}
                    className={
                      active
                        ? "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-brand-green px-3 text-sm font-semibold text-white"
                        : "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    }
                  >
                    {f.label}
                    <span className={active ? "text-white/80" : "text-slate-500"}>{f.count}</span>
                  </Link>
                );
              })}
            </nav>

            {tab === "pupils" && pupilsNoNumber > 0 ? (
              <form action={assignNumbersAction} className="flex flex-col gap-3 rounded-xl bg-brand-gold-50 px-4 py-3 text-sm ring-1 ring-brand-gold-200 sm:flex-row sm:items-center print:hidden">
                <Hash className="hidden h-4 w-4 shrink-0 text-brand-gold-700 sm:block" aria-hidden="true" />
                <span className="flex-1 text-slate-800">
                  {pupilsNoNumber} learner{pupilsNoNumber === 1 ? " has" : "s have"} no admission number, so they can&apos;t
                  have a portal account yet.{nextNumber ? ` Numbers start from ${nextNumber}, oldest record first.` : ""}
                </span>
                <SubmitButton size="sm" pendingText="Giving numbers…">
                  Give them numbers
                </SubmitButton>
              </form>
            ) : null}

            {tab === "pupils" && loginMismatch.length ? (
              <Alert tone="warning" className="print:hidden">
                {loginMismatch.length} learner account{loginMismatch.length === 1 ? " still signs" : "s still sign"} in with an
                older number (made before numbers moved with the sign-in). They&apos;re marked below.
              </Alert>
            ) : null}

            {(tab === "pupils" ? pupilRows : parentRows).length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody matches"
                description={q || show || classFilter ? "Try another search or filter." : tab === "pupils" ? "No learners on roll yet." : "No parent records yet."}
                action={
                  q || show || classFilter ? (
                    <ButtonLink href={href({ tab })} variant="secondary" size="sm">
                      Show everyone
                    </ButtonLink>
                  ) : undefined
                }
              />
            ) : (
              <AccountsTable
                key={`${tab}-${show}-${classFilter}-${q}`}
                kind={tab === "pupils" ? "pupil" : "parent"}
                rows={tab === "pupils" ? pupilRows : parentRows}
                schoolName="Greenfield School"
                printedBy={printedBy}
              />
            )}
            {tab === "pupils" ? (
              <p className="text-xs text-slate-500 print:hidden">
                Learners sign in with their admission number. If you change a learner&apos;s number on their page, their
                sign-in changes with it and their password stays the same.
              </p>
            ) : (
              <p className="text-xs text-slate-500 print:hidden">
                Parents sign in with their email address. One account covers all their children.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "unlinked" ? (
        <Card>
          <CardHeader
            title="Accounts with no owner"
            description="Parent and learner sign-ins not linked to any record. Link each one to the right person, or leave it: it can't see anything until it is linked."
          />
          <CardBody>
            {unlinked.length === 0 ? (
              <EmptyState icon={Link2} title="Every account belongs to someone" description="Nothing to do here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {unlinked.map((u) => (
                  <li key={u.user_id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{u.full_name || "No name"}</div>
                      <div className="break-all font-mono text-xs text-slate-600">{u.email}</div>
                      <div className="text-xs text-slate-500">
                        {isAdmissionLoginEmail(u.email) ? "Learner sign-in" : u.role === "student" ? "Learner" : "Parent"} · made{" "}
                        {formatLagosDate(u.created_at)} · {signInLabel(u.last_sign_in_at)}
                      </div>
                    </div>
                    <form action={linkAccountAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="user_id" value={u.user_id} />
                      <input type="hidden" name="role" value={u.role ?? ""} />
                      <label className="sr-only" htmlFor={`link-${u.user_id}`}>
                        Admission number or parent email to link {u.email} to
                      </label>
                      <input
                        id={`link-${u.user_id}`}
                        name="target"
                        className="gf-input w-56"
                        placeholder={isAdmissionLoginEmail(u.email) || u.role === "student" ? "Admission number" : "Parent's email"}
                        required
                      />
                      <SubmitButton size="sm" variant="secondary" pendingText="Linking…">
                        Link
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "format" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Admission number format"
              description="New learners get the next number in this format when they are enrolled. Only the developers can change it: admins can ask below."
            />
            <CardBody>
              {!settings ? (
                <Alert tone="warning">Run the database update first.</Alert>
              ) : (
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-slate-200">
                    <div className="text-slate-600">The next number will be</div>
                    <div className="mt-0.5 font-mono text-2xl font-bold tracking-wide text-slate-900">{nextNumber ?? "—"}</div>
                    <div className="mt-1 text-xs text-slate-500">Always after the highest number already used, so it never repeats an old one.</div>
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-slate-500">Pattern</dt>
                    <dd className="font-mono text-slate-900">{settings.template.replace("{PREFIX}", settings.prefix)}</dd>
                    <dt className="text-slate-500">Year</dt>
                    <dd className="text-slate-900">
                      {settings.year_basis === "session"
                        ? `The year the school session started (session starts in ${MONTHS[settings.session_start_month - 1]}): a learner joining in January for that session gets the earlier year`
                        : "The calendar year the learner is enrolled"}
                    </dd>
                    <dt className="text-slate-500">Running number</dt>
                    <dd className="text-slate-900">
                      {settings.digits} digits{settings.template.includes("{YY") ? ", starts again at 1 each year" : ", never restarts"}
                    </dd>
                    {Object.keys(settings.section_prefixes ?? {}).length ? (
                      <>
                        <dt className="text-slate-500">Sections</dt>
                        <dd className="font-mono text-slate-900">
                          {Object.entries(settings.section_prefixes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </dd>
                      </>
                    ) : null}
                    <dt className="text-slate-500">Given</dt>
                    <dd className="text-slate-900">{settings.auto_assign ? "Automatically when a learner is enrolled" : "Typed in by hand"}</dd>
                    <dt className="text-slate-500">Last changed</dt>
                    <dd className="text-slate-900">{formatLagosDate(settings.updated_at)}</dd>
                  </dl>
                </div>
              )}
            </CardBody>
          </Card>

          {pendingRequest ? (
            <Card>
              <CardHeader
                title="Waiting for the developers"
                description={`Asked by ${pendingRequest.requested_by_name ?? "an admin"} on ${formatLagosDateTime(pendingRequest.requested_at)}. Nothing changes until a developer approves it.`}
                action={<Badge tone="gold">Waiting</Badge>}
              />
              <CardBody className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Now</div>
                    <div className="mt-0.5 text-slate-800">{pendingRequest.current_summary}</div>
                  </div>
                  <div className="rounded-xl bg-brand-gold-50 px-3 py-2 ring-1 ring-brand-gold-200">
                    <div className="text-xs font-medium uppercase tracking-wide text-brand-gold-700">Asked for</div>
                    <div className="mt-0.5 font-mono text-slate-900">{pendingRequest.template.replace("{PREFIX}", pendingRequest.prefix)}</div>
                    <div className="text-slate-700">
                      {pendingRequest.digits} digits · {pendingRequest.year_basis === "session" ? "session start year" : "calendar year"}
                    </div>
                  </div>
                </div>
                <p className="text-slate-700">
                  <span className="font-medium">Reason:</span> {pendingRequest.reason}
                </p>
                <form action={cancelFormatRequestAction}>
                  <input type="hidden" name="request_id" value={pendingRequest.id} />
                  <SubmitButton variant="ghost" size="sm" pendingText="Withdrawing…">
                    Withdraw this request
                  </SubmitButton>
                </form>
              </CardBody>
            </Card>
          ) : null}

          {lastDecision && !pendingRequest ? (
            <Alert tone={lastDecision.status === "approved" ? "success" : "info"} title={lastDecision.status === "approved" ? "Last request approved" : lastDecision.status === "rejected" ? "Last request not approved" : "Last request withdrawn"}>
              {lastDecision.decided_by_name ?? ""}
              {lastDecision.decided_at ? `, ${formatLagosDate(lastDecision.decided_at)}` : ""}
              {lastDecision.decision_note ? `: ${lastDecision.decision_note}` : ""}
            </Alert>
          ) : null}

          {settings ? (
            <Card>
              <CardHeader
                title="Ask the developers for a change"
                description="Changing the format affects every new learner from then on, so a developer checks it first. Existing numbers never change."
              />
              <CardBody>
                <details className="group" open={sp.ask === "1" || undefined}>
                  <summary className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-brand-green-700 ring-1 ring-brand-green-200 hover:bg-brand-green-50">
                    {pendingRequest ? "Ask for something different instead" : "Ask for a change"}
                  </summary>
                  <form action={requestFormatChangeAction} className="mt-5 grid max-w-2xl gap-5">
                    <Field
                      label="Pattern"
                      htmlFor="fmt-template"
                      hint={
                        <>
                          <code>{"{PREFIX}"}</code> school prefix · <code>{"{YYYY}"}</code> year (2026) · <code>{"{YY}"}</code> short year (26) ·{" "}
                          <code>{"{N}"}</code> running number (required). With a year, the running number starts again at 1 each year.
                        </>
                      }
                    >
                      <input id="fmt-template" name="template" defaultValue={settings.template} className="gf-input font-mono" required />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="School prefix" htmlFor="fmt-prefix">
                        <input id="fmt-prefix" name="prefix" defaultValue={settings.prefix} className="gf-input font-mono uppercase" autoCapitalize="characters" />
                      </Field>
                      <Field label="Digits in the running number" htmlFor="fmt-digits" hint="3 gives 007; it grows past 999 by itself.">
                        <input id="fmt-digits" name="digits" type="number" min={1} max={8} defaultValue={settings.digits} className="gf-input" inputMode="numeric" />
                      </Field>
                    </div>
                    <fieldset className="grid gap-2">
                      <legend className="gf-label">Different prefix for a section (optional)</legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {(["creche", "primary", "secondary"] as const).map((lvl) => (
                          <Field key={lvl} label={lvl[0].toUpperCase() + lvl.slice(1)} htmlFor={`fmt-${lvl}`}>
                            <input
                              id={`fmt-${lvl}`}
                              name={`prefix_${lvl}`}
                              defaultValue={settings.section_prefixes?.[lvl] ?? ""}
                              className="gf-input font-mono uppercase"
                              placeholder={settings.prefix}
                              autoCapitalize="characters"
                            />
                          </Field>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Which year goes in the number" htmlFor="fmt-year">
                        <select id="fmt-year" name="year_basis" defaultValue={settings.year_basis} className="gf-select">
                          <option value="session">The year the school session started</option>
                          <option value="calendar">The calendar year of enrolment</option>
                        </select>
                      </Field>
                      <Field label="Session starts in" htmlFor="fmt-month">
                        <select id="fmt-month" name="session_start_month" defaultValue={String(settings.session_start_month)} className="gf-select">
                          {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <label className="flex items-start gap-3 text-sm text-slate-700">
                      <input type="checkbox" name="auto_assign" defaultChecked={settings.auto_assign} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green" />
                      <span>
                        <strong>Give numbers automatically</strong> when a learner is enrolled.
                      </span>
                    </label>
                    <Field label="Why should it change?" htmlFor="fmt-reason" hint="The developers read this before deciding. Your name is recorded with the request.">
                      <textarea id="fmt-reason" name="reason" rows={3} required minLength={5} className="gf-input" />
                    </Field>
                    <div>
                      <SubmitButton pendingText="Sending…">Send to the developers</SubmitButton>
                    </div>
                  </form>
                </details>
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "history" ? (
        <Card>
          <CardHeader title="History" description="Every number given or changed, account created, password reset and link made, with who did it. Newest first." />
          <CardBody className="p-0">
            {log.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={KeyRound} title="Nothing yet" description="Changes to numbers and accounts appear here." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {log.map((l) => {
                  const a = ACTION_LABELS[l.action] ?? { label: l.action, tone: "slate" as const };
                  const target = l.student_id ? `/admin/students/${l.student_id}` : l.guardian_id ? `/admin/guardians/${l.guardian_id}` : null;
                  return (
                    <li key={l.id} className="flex flex-col gap-1 px-5 py-3 text-sm md:flex-row md:items-center md:gap-4">
                      <span className="w-40 shrink-0 text-xs text-slate-500">{formatLagosDateTime(l.created_at)}</span>
                      <span className="w-48 shrink-0">
                        <Badge tone={a.tone}>{a.label}</Badge>
                      </span>
                      <span className="min-w-0 flex-1">
                        {l.subject_name ? (
                          target ? (
                            <Link className="gf-link" href={target}>
                              {l.subject_name}
                            </Link>
                          ) : (
                            l.subject_name
                          )
                        ) : null}
                        {l.admission_number ? <span className="ml-1 font-mono text-xs text-slate-600">{l.admission_number}</span> : null}
                        {l.detail ? <span className={l.subject_name ? "ml-1 text-slate-500" : "text-slate-600"}>{l.subject_name ? "· " : ""}{l.detail}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-slate-600">by {l.done_by_name ?? "System"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <p className="text-xs text-slate-500 print:hidden">
        <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        Only admins can see this page. Everything done here is recorded in History with your name.
      </p>
    </div>
  );
}
