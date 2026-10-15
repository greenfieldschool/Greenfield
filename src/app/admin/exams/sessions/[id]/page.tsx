import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { lagosEndOfDayIso, lagosStartOfDayIso, sessionVisibility, toLagosDateInput } from "@/lib/lagos-dates";
import UrlToast from "@/components/url-toast";

type SessionRow = {
  id: string;
  test_id: string;
  class_id: string | null;
  academic_year_id: string | null;
  academic_term_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  secret_code: string | null;
  active: boolean;
};

type TestRow = { id: string; name: string };

type ClassRow = { id: string; level: string; name: string };

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string };

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DatabaseTimeout")), ms))
  ]);
}


export default async function AdminExamSessionEditPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  let loadErrorMsg: string | null = null;
  let sessionData: unknown = null;
  let tests: unknown = null;
  let classes: unknown = null;
  let years: unknown = null;
  let terms: unknown = null;

  try {
    const result = await withTimeout(
      Promise.all([
        supabase
          .from("exam_test_sessions")
          .select(
            "id, test_id, class_id, academic_year_id, academic_term_id, starts_at, ends_at, status, requires_secret_code, secret_code, active"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("exam_tests").select("id, name").eq("active", true).order("created_at", { ascending: false }),
        supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
        supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
        supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
      ]),
      6000
    );

    sessionData = (result[0] as { data?: unknown })?.data ?? null;
    tests = (result[1] as { data?: unknown })?.data ?? null;
    classes = (result[2] as { data?: unknown })?.data ?? null;
    years = (result[3] as { data?: unknown })?.data ?? null;
    terms = (result[4] as { data?: unknown })?.data ?? null;
  } catch (e) {
    loadErrorMsg = e instanceof Error ? e.message : String(e);
  }

  if (loadErrorMsg) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <div className="text-sm font-semibold">Session editor temporarily unavailable</div>
          <div className="mt-2 text-sm">{loadErrorMsg}</div>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams/sessions">
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const session = (sessionData ?? null) as unknown as SessionRow | null;
  if (!session) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Exams</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Session not found</h1>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams/sessions">
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const testRows = (tests ?? []) as TestRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  async function updateSession(formData: FormData) {
    "use server";

    const testId = asString(formData.get("test_id")).trim();
    const classIdRaw = asString(formData.get("class_id")).trim();
    const yearIdRaw = asString(formData.get("academic_year_id")).trim();
    const termIdRaw = asString(formData.get("academic_term_id")).trim();
    const startDate = asString(formData.get("start_date")).trim();
    const endDate = asString(formData.get("end_date")).trim();
    const status = asString(formData.get("status")).trim() || "draft";
    const isActive = asString(formData.get("active")).trim() === "on";
    const requiresSecretCode = asString(formData.get("requires_secret_code")).trim() === "on";
    const secretCode = asString(formData.get("secret_code")).trim();

    if (!testId) return;
    if (startDate && endDate && endDate < startDate) {
      redirect(`/admin/exams/sessions/${id}?toast=${encodeURIComponent("End date cannot be before the start date")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("exam_test_sessions")
      .update({
        test_id: testId,
        class_id: classIdRaw.length ? classIdRaw : null,
        academic_year_id: yearIdRaw.length ? yearIdRaw : null,
        academic_term_id: termIdRaw.length ? termIdRaw : null,
        starts_at: startDate.length ? lagosStartOfDayIso(startDate) : null,
        ends_at: endDate.length ? lagosEndOfDayIso(endDate) : null,
        status,
        active: isActive,
        requires_secret_code: requiresSecretCode,
        secret_code: requiresSecretCode && secretCode.length ? secretCode : null
      })
      .eq("id", id);

    revalidatePath("/admin/exams/sessions");
    revalidatePath(`/admin/exams/sessions/${id}`);
    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath(`/admin/exams/sessions/${id}/conductors`);
    revalidatePath("/portal/exams");
    redirect(`/admin/exams/sessions/${id}?toast=${encodeURIComponent("Session saved")}&toast_type=success`);
  }

  const visibility = sessionVisibility(session);

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit session</h1>
        <p className="mt-2 text-sm text-slate-600">Update the class, dates, and access settings for this session.</p>
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            visibility.visible
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <span className="font-semibold">Student access: </span>
          {visibility.reason}
          {visibility.visible ? " (only students in the selected class, or every class if none is selected)." : "."}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href="/admin/exams/sessions"
          >
            Back to sessions
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href={`/admin/exams/sessions/${id}/attempts`}
          >
            Attempts &amp; results release
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50" 
            href={`/admin/exams/sessions/${id}/conductors`}
          >
            Conductors
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={updateSession} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Test</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="test_id"
              defaultValue={session.test_id}
              required
            >
              {testRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Class (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue={session.class_id ?? ""}
            >
              <option value="">—</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue={session.academic_year_id ?? ""}
            >
              <option value="">—</option>
              {yearRows.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic term (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_term_id"
              defaultValue={session.academic_term_id ?? ""}
            >
              <option value="">—</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Start date (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="start_date"
              type="date"
              defaultValue={toLagosDateInput(session.starts_at)}
            />
            <p className="mt-1 text-xs text-slate-500">Students can see the exam from the start of this day.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">End date (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="end_date"
              type="date"
              defaultValue={toLagosDateInput(session.ends_at)}
            />
            <p className="mt-1 text-xs text-slate-500">Open until the end of this day. The time allowed comes from the test&apos;s duration.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="status"
              defaultValue={session.status}
            >
              <option value="active">active (students can take it within the dates)</option>
              <option value="draft">draft (hidden from students)</option>
              <option value="closed">closed</option>
            </select>

            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked={session.active} />
              Active
            </label>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Secret code (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="secret_code"
              placeholder="Only if required"
              defaultValue={session.secret_code ?? ""}
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                className="h-4 w-4"
                name="requires_secret_code"
                type="checkbox"
                defaultChecked={session.requires_secret_code}
              />
              Require secret code to start
            </label>
          </div>

          <div className="flex items-end sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Saving…"
            >
              Save changes
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
