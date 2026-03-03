import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

 function asString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function field(label: string, value: unknown) {
  const text = typeof value === "string" && value.trim() ? value.trim() : value ? String(value) : "—";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900 break-words">{text}</div>
    </div>
  );
}

export default async function AdminApplicationDetailPage({
  params
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Application</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const { data: row, error } = await supabase
    .from("admissions_applications")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !row) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Application not found</div>
        <div className="mt-4">
          <Link
            href="/admin/students/applications"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  async function updateStatus(formData: FormData) {
    "use server";

    const nextStatus = String(formData.get("status") ?? "").trim();
    if (!nextStatus) return;

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    await supabaseAction
      .from("admissions_applications")
      .update({ status: nextStatus })
      .eq("id", params.id);

    redirect(`/admin/students/applications/${params.id}`);
  }

  const data = (row.data as Record<string, unknown>) ?? {};

  async function updateApplication(formData: FormData) {
    "use server";

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    const {
      data: { user }
    } = await supabaseAction.auth.getUser();
    if (!user) {
      redirect(`/admin/login?redirectTo=${encodeURIComponent(`/admin/students/applications/${params.id}`)}`);
    }

    const { data: profile } = await supabaseAction.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile?.role ?? null) as string | null;
    const isStaff =
      role === "super_admin" ||
      role === "admin" ||
      role === "teacher" ||
      role === "front_desk" ||
      role === "nurse";
    if (!isStaff) {
      redirect("/admin");
    }

    const parent_name = asString(formData.get("parent_name")) || null;
    const phone = asString(formData.get("phone")) || null;
    const email = asString(formData.get("email")) || null;
    const desired_start = asString(formData.get("desired_start")) || null;
    const preferred_contact = asString(formData.get("preferred_contact")) || null;
    const sectionRaw = asString(formData.get("section"));
    const section = sectionRaw.length ? sectionRaw : null;

    const note = asString(formData.get("note"));

    const nextData = {
      ...data,
      note: note.length ? note : undefined,

      first_name: asString(formData.get("first_name")) || undefined,
      middle_name: asString(formData.get("middle_name")) || undefined,
      last_name: asString(formData.get("last_name")) || undefined,
      sex: asString(formData.get("sex")) || undefined,
      religion: asString(formData.get("religion")) || undefined,
      dob: asString(formData.get("dob")) || undefined,
      passport_photo_url: asString(formData.get("passport_photo_url")) || undefined,
      seeking_class: asString(formData.get("seeking_class")) || undefined,
      favorite_sports: asString(formData.get("favorite_sports")) || undefined,
      hobbies: asString(formData.get("hobbies")) || undefined,
      future_aspiration: asString(formData.get("future_aspiration")) || undefined,
      child_with: asString(formData.get("child_with")) || undefined,

      parent1_name: asString(formData.get("parent1_name")) || undefined,
      parent1_phone: asString(formData.get("parent1_phone")) || undefined,
      parent1_email: asString(formData.get("parent1_email")) || undefined,
      parent1_occupation: asString(formData.get("parent1_occupation")) || undefined,
      parent1_business_address: asString(formData.get("parent1_business_address")) || undefined,
      home_address: asString(formData.get("home_address")) || undefined,
      parent2_name: asString(formData.get("parent2_name")) || undefined,
      parent2_phone: asString(formData.get("parent2_phone")) || undefined,
      parent2_email: asString(formData.get("parent2_email")) || undefined,
      parent2_occupation: asString(formData.get("parent2_occupation")) || undefined,
      parent2_business_address: asString(formData.get("parent2_business_address")) || undefined,
      preferred_contact_methods: asString(formData.get("preferred_contact_methods")) || undefined,

      has_been_in_school: asString(formData.get("has_been_in_school")) || undefined,
      previous_school_name: asString(formData.get("previous_school_name")) || undefined,
      reason_for_leaving: asString(formData.get("reason_for_leaving")) || undefined,
      qualification_testimonial: asString(formData.get("qualification_testimonial")) || undefined,
      date_of_entry: asString(formData.get("date_of_entry")) || undefined,
      date_of_exit: asString(formData.get("date_of_exit")) || undefined,
      class_of_exit: asString(formData.get("class_of_exit")) || undefined,
      discovery_source: asString(formData.get("discovery_source")) || undefined,
      referred: asString(formData.get("referred")) || undefined,
      referrer_name: asString(formData.get("referrer_name")) || undefined,
      referrer_ref: asString(formData.get("referrer_ref")) || undefined,
      other_child_in_school: asString(formData.get("other_child_in_school")) || undefined,
      other_child_names: asString(formData.get("other_child_names")) || undefined,
      pickup_details: asString(formData.get("pickup_details")) || undefined,
      student_signature_name: asString(formData.get("student_signature_name")) || undefined,
      student_signature_date: asString(formData.get("student_signature_date")) || undefined,
      parent_signature_name: asString(formData.get("parent_signature_name")) || undefined,
      parent_signature_date: asString(formData.get("parent_signature_date")) || undefined
    };

    await supabaseAction
      .from("admissions_applications")
      .update({ parent_name, phone, email, desired_start, preferred_contact, section, data: nextData })
      .eq("id", params.id);

    redirect(`/admin/students/applications/${params.id}`);
  }

  const { data: existingStudent } = await supabase
    .from("students")
    .select("id")
    .eq("admissions_application_id", params.id)
    .maybeSingle();
  const existingStudentId = (existingStudent as { id?: string } | null)?.id ?? null;

  async function approveApplication() {
    "use server";

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    const {
      data: { user }
    } = await supabaseAction.auth.getUser();
    if (!user) {
      redirect(`/admin/login?redirectTo=${encodeURIComponent(`/admin/students/applications/${params.id}`)}`);
    }

    const { data: profile } = await supabaseAction.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile?.role ?? null) as string | null;
    const isStaff =
      role === "super_admin" ||
      role === "admin" ||
      role === "teacher" ||
      role === "front_desk" ||
      role === "nurse";
    if (!isStaff) {
      redirect("/admin");
    }

    const { data: existingStudent } = await supabaseAction
      .from("students")
      .select("id")
      .eq("admissions_application_id", params.id)
      .maybeSingle();
    const existingStudentId = (existingStudent as { id?: string } | null)?.id ?? null;
    if (existingStudentId) {
      redirect(`/admin/students/${existingStudentId}`);
    }

    const { data: appRow } = await supabaseAction
      .from("admissions_applications")
      .select("id, status, section, data")
      .eq("id", params.id)
      .maybeSingle();

    if (!appRow) {
      redirect(`/admin/students/applications/${params.id}`);
    }

    const appStatus = (appRow.status as string | null) ?? null;
    const canApprove =
      appStatus === "lead" ||
      appStatus === "submitted" ||
      appStatus === "contacted" ||
      appStatus === "visit_booked" ||
      appStatus === "applied";
    if (!canApprove) {
      redirect(`/admin/students/applications/${params.id}`);
    }

    const payload = (appRow.data as Record<string, unknown>) ?? {};
    const section = (appRow.section as string | null) ?? null;
    const level = section === "creche" || section === "primary" || section === "secondary" ? section : null;

    const seekingClass = typeof payload.seeking_class === "string" ? payload.seeking_class.trim() : "";
    let classId: string | null = null;
    if (seekingClass.length) {
      const { data: classExact } = await supabaseAction
        .from("classes")
        .select("id")
        .ilike("name", seekingClass)
        .limit(1)
        .maybeSingle();

      classId = (classExact?.id as string | undefined) ?? null;

      if (!classId) {
        const { data: classLoose } = await supabaseAction
          .from("classes")
          .select("id")
          .ilike("name", `%${seekingClass}%`)
          .limit(1)
          .maybeSingle();

        classId = (classLoose?.id as string | undefined) ?? null;
      }
    }

    const hobbiesRaw = typeof payload.hobbies === "string" ? payload.hobbies : "";
    const hobbies = hobbiesRaw
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length);

    const { data: createdStudent, error: createError } = await supabaseAction
      .from("students")
      .insert({
        first_name: typeof payload.first_name === "string" ? payload.first_name : "",
        middle_name: typeof payload.middle_name === "string" ? payload.middle_name : null,
        last_name: typeof payload.last_name === "string" ? payload.last_name : "",
        class_id: classId,
        level: level ?? "primary",
        status: "enrolled",
        date_of_birth: typeof payload.dob === "string" && payload.dob.length ? payload.dob : null,
        passport_photo_url: typeof payload.passport_photo_url === "string" && payload.passport_photo_url.length ? payload.passport_photo_url : null,
        favorite_sports: typeof payload.favorite_sports === "string" && payload.favorite_sports.length ? payload.favorite_sports : null,
        future_aspiration:
          typeof payload.future_aspiration === "string" && payload.future_aspiration.length ? payload.future_aspiration : null,
        child_with: typeof payload.child_with === "string" && payload.child_with.length ? payload.child_with : null,
        sex: typeof payload.sex === "string" && payload.sex.length ? payload.sex : null,
        religion: typeof payload.religion === "string" && payload.religion.length ? payload.religion : null,
        hobbies,
        admissions_application_id: params.id
      })
      .select("id")
      .maybeSingle();

    if (createError || !createdStudent?.id) {
      redirect(`/admin/students/applications/${params.id}`);
    }

    await supabaseAction
      .from("admissions_applications")
      .update({ status: "enrolled" })
      .eq("id", params.id);

    redirect(`/admin/students/${createdStudent.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admissions application</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{row.parent_name ?? "Application"}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Created {new Date(row.created_at as string).toLocaleString()} • Last updated{" "}
              {new Date(row.updated_at as string).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/students/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to list
            </Link>
            {existingStudentId ? (
              <Link
                href={`/admin/students/${existingStudentId}`}
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                View student
              </Link>
            ) : (
              <form action={approveApplication}>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                >
                  Approve
                </button>
              </form>
            )}
            {row.phone ? (
              <a
                href={`https://wa.me/${String(row.phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                WhatsApp parent
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {field("Status", row.status)}
          {field("Section", row.section)}
          {field("Preferred contact", row.preferred_contact)}
          {field("Parent name", row.parent_name)}
          {field("Phone", row.phone)}
          {field("Email", row.email)}
          {field("Desired start", row.desired_start)}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="text-sm font-semibold text-slate-900">Edit application</div>
          <p className="mt-1 text-sm text-slate-600">Update the admin-managed fields for this application.</p>

          <form action={updateApplication} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Section</label>
              <select
                name="section"
                defaultValue={String(row.section ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              >
                <option value="">(none)</option>
                <option value="creche">creche</option>
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Preferred contact</label>
              <input
                name="preferred_contact"
                defaultValue={String(row.preferred_contact ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Parent name</label>
              <input
                name="parent_name"
                defaultValue={String(row.parent_name ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Phone</label>
              <input
                name="phone"
                defaultValue={String(row.phone ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={String(row.email ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Desired start</label>
              <input
                name="desired_start"
                defaultValue={String(row.desired_start ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Note</label>
              <textarea
                name="note"
                defaultValue={typeof data.note === "string" ? data.note : ""}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                rows={4}
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                Save application
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="text-sm font-semibold text-slate-900">Edit application details</div>
          <p className="mt-1 text-sm text-slate-600">Update the fields captured from /apply.</p>

          <form action={updateApplication} className="mt-4 space-y-8">
            <div>
              <div className="text-sm font-semibold text-slate-900">Student</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-900">First name</label>
                  <input
                    name="first_name"
                    defaultValue={typeof data.first_name === "string" ? data.first_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Middle name</label>
                  <input
                    name="middle_name"
                    defaultValue={typeof data.middle_name === "string" ? data.middle_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Last name</label>
                  <input
                    name="last_name"
                    defaultValue={typeof data.last_name === "string" ? data.last_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Date of birth</label>
                  <input
                    type="date"
                    name="dob"
                    defaultValue={typeof data.dob === "string" ? data.dob : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Sex</label>
                  <select
                    name="sex"
                    defaultValue={typeof data.sex === "string" ? data.sex : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  >
                    <option value="">—</option>
                    <option value="male">male</option>
                    <option value="female">female</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Religion</label>
                  <input
                    name="religion"
                    defaultValue={typeof data.religion === "string" ? data.religion : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Passport photo URL</label>
                  <input
                    name="passport_photo_url"
                    defaultValue={typeof data.passport_photo_url === "string" ? data.passport_photo_url : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Seeking admission into</label>
                  <input
                    name="seeking_class"
                    defaultValue={typeof data.seeking_class === "string" ? data.seeking_class : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Favorite sports</label>
                  <input
                    name="favorite_sports"
                    defaultValue={typeof data.favorite_sports === "string" ? data.favorite_sports : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Hobbies (comma-separated)</label>
                  <input
                    name="hobbies"
                    defaultValue={typeof data.hobbies === "string" ? data.hobbies : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Future aspiration</label>
                  <input
                    name="future_aspiration"
                    defaultValue={typeof data.future_aspiration === "string" ? data.future_aspiration : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Child is with</label>
                  <input
                    name="child_with"
                    defaultValue={typeof data.child_with === "string" ? data.child_with : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">Parents</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 1 name</label>
                  <input
                    name="parent1_name"
                    defaultValue={typeof data.parent1_name === "string" ? data.parent1_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 1 phone</label>
                  <input
                    name="parent1_phone"
                    defaultValue={typeof data.parent1_phone === "string" ? data.parent1_phone : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 1 email</label>
                  <input
                    type="email"
                    name="parent1_email"
                    defaultValue={typeof data.parent1_email === "string" ? data.parent1_email : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 1 occupation</label>
                  <input
                    name="parent1_occupation"
                    defaultValue={typeof data.parent1_occupation === "string" ? data.parent1_occupation : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Parent 1 business address</label>
                  <input
                    name="parent1_business_address"
                    defaultValue={typeof data.parent1_business_address === "string" ? data.parent1_business_address : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Home address</label>
                  <input
                    name="home_address"
                    defaultValue={typeof data.home_address === "string" ? data.home_address : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 2 name</label>
                  <input
                    name="parent2_name"
                    defaultValue={typeof data.parent2_name === "string" ? data.parent2_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 2 phone</label>
                  <input
                    name="parent2_phone"
                    defaultValue={typeof data.parent2_phone === "string" ? data.parent2_phone : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 2 email</label>
                  <input
                    type="email"
                    name="parent2_email"
                    defaultValue={typeof data.parent2_email === "string" ? data.parent2_email : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent 2 occupation</label>
                  <input
                    name="parent2_occupation"
                    defaultValue={typeof data.parent2_occupation === "string" ? data.parent2_occupation : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Parent 2 business address</label>
                  <input
                    name="parent2_business_address"
                    defaultValue={typeof data.parent2_business_address === "string" ? data.parent2_business_address : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Preferred contact methods</label>
                  <input
                    name="preferred_contact_methods"
                    defaultValue={typeof data.preferred_contact_methods === "string" ? data.preferred_contact_methods : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">School history</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-900">Has been in school</label>
                  <select
                    name="has_been_in_school"
                    defaultValue={typeof data.has_been_in_school === "string" ? data.has_been_in_school : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  >
                    <option value="">—</option>
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Previous school</label>
                  <input
                    name="previous_school_name"
                    defaultValue={typeof data.previous_school_name === "string" ? data.previous_school_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Reason for leaving</label>
                  <input
                    name="reason_for_leaving"
                    defaultValue={typeof data.reason_for_leaving === "string" ? data.reason_for_leaving : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Qualification/Testimonial</label>
                  <input
                    name="qualification_testimonial"
                    defaultValue={typeof data.qualification_testimonial === "string" ? data.qualification_testimonial : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Date of entry</label>
                  <input
                    type="date"
                    name="date_of_entry"
                    defaultValue={typeof data.date_of_entry === "string" ? data.date_of_entry : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Date of exit</label>
                  <input
                    type="date"
                    name="date_of_exit"
                    defaultValue={typeof data.date_of_exit === "string" ? data.date_of_exit : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Class of exit</label>
                  <input
                    name="class_of_exit"
                    defaultValue={typeof data.class_of_exit === "string" ? data.class_of_exit : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">Discovery & pickup</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-900">Discovery source</label>
                  <input
                    name="discovery_source"
                    defaultValue={typeof data.discovery_source === "string" ? data.discovery_source : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Referred</label>
                  <input
                    name="referred"
                    defaultValue={typeof data.referred === "string" ? data.referred : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Referrer name</label>
                  <input
                    name="referrer_name"
                    defaultValue={typeof data.referrer_name === "string" ? data.referrer_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Referrer number</label>
                  <input
                    name="referrer_ref"
                    defaultValue={typeof data.referrer_ref === "string" ? data.referrer_ref : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Other child in school</label>
                  <input
                    name="other_child_in_school"
                    defaultValue={typeof data.other_child_in_school === "string" ? data.other_child_in_school : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Other child name(s)</label>
                  <input
                    name="other_child_names"
                    defaultValue={typeof data.other_child_names === "string" ? data.other_child_names : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">Pickup details</label>
                  <textarea
                    name="pickup_details"
                    defaultValue={typeof data.pickup_details === "string" ? data.pickup_details : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    rows={4}
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-900">Signatures</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-900">Student signature</label>
                  <input
                    name="student_signature_name"
                    defaultValue={typeof data.student_signature_name === "string" ? data.student_signature_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Student signature date</label>
                  <input
                    type="date"
                    name="student_signature_date"
                    defaultValue={typeof data.student_signature_date === "string" ? data.student_signature_date : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent signature</label>
                  <input
                    name="parent_signature_name"
                    defaultValue={typeof data.parent_signature_name === "string" ? data.parent_signature_name : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Parent signature date</label>
                  <input
                    type="date"
                    name="parent_signature_date"
                    defaultValue={typeof data.parent_signature_date === "string" ? data.parent_signature_date : ""}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                Save application details
              </button>
            </div>
          </form>
        </div>

        <form action={updateStatus} className="mt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-900">Update status</label>
            <select
              name="status"
              defaultValue={String(row.status ?? "lead")}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            >
              <option value="lead">lead</option>
              <option value="submitted">submitted</option>
              <option value="contacted">contacted</option>
              <option value="visit_booked">visit_booked</option>
              <option value="applied">applied</option>
              <option value="enrolled">enrolled</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
          >
            Save
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Application details</div>
        <p className="mt-2 text-sm text-slate-600">These fields are saved from the /apply wizard.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {field("First name", data.first_name ?? data.other_names)}
          {field("Middle name", data.middle_name)}
          {field("Last name", data.last_name ?? data.surname)}
          {field("Date of birth", data.dob)}
          {field("Sex", data.sex)}
          {field("Religion", data.religion)}
          {field("Passport photo URL", data.passport_photo_url)}
          {field("Seeking admission into", data.seeking_class)}
          {field("Favorite sports", data.favorite_sports)}
          {field("Hobbies", data.hobbies)}
          {field("Future aspiration", data.future_aspiration)}
          {field("Child is with", data.child_with)}
          {field("Note", data.note)}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {field("Parent 1 name", data.parent1_name)}
          {field("Parent 1 phone", data.parent1_phone)}
          {field("Parent 1 email", data.parent1_email)}
          {field("Parent 1 occupation", data.parent1_occupation)}
          {field("Parent 1 business address", data.parent1_business_address)}
          {field("Home address", data.home_address)}
          {field("Parent 2 name", data.parent2_name)}
          {field("Parent 2 phone", data.parent2_phone)}
          {field("Parent 2 email", data.parent2_email)}
          {field("Parent 2 occupation", data.parent2_occupation)}
          {field("Parent 2 business address", data.parent2_business_address)}
          {field("Preferred contact methods", data.preferred_contact_methods)}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {field("Has been in school", data.has_been_in_school)}
          {field("Previous school", data.previous_school_name)}
          {field("Reason for leaving", data.reason_for_leaving)}
          {field("Qualification/Testimonial", data.qualification_testimonial)}
          {field("Date of entry", data.date_of_entry)}
          {field("Date of exit", data.date_of_exit)}
          {field("Class of exit", data.class_of_exit)}
          {field("Discovery source", data.discovery_source)}
          {field("Referred", data.referred)}
          {field("Referrer name", data.referrer_name)}
          {field("Referrer number", data.referrer_ref)}
          {field("Other child in school", data.other_child_in_school)}
          {field("Other child name(s)", data.other_child_names)}
          {field("Pickup details", data.pickup_details)}
          {field("Student signature", data.student_signature_name)}
          {field("Student signature date", data.student_signature_date)}
          {field("Parent signature", data.parent_signature_name)}
          {field("Parent signature date", data.parent_signature_date)}
        </div>
      </div>
    </div>
  );
}
