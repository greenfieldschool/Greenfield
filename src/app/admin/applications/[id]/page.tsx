import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
            href="/admin/applications"
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

    redirect(`/admin/applications/${params.id}`);
  }

  const data = (row.data as Record<string, unknown>) ?? {};

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
              href="/admin/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to list
            </Link>
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
