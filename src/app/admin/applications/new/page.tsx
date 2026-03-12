import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";

type AdmissionsSection = "creche" | "primary" | "secondary";

function asString(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function AdminNewApplicationPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">New application</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login?redirectTo=/admin/students/applications/new");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
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

  async function createApplication(formData: FormData) {
    "use server";

    const status = asString(formData.get("status")) || "lead";
    const section = asString(formData.get("section")) as AdmissionsSection | "";

    const parent_name = asString(formData.get("parent_name")) || null;
    const phone = asString(formData.get("phone")) || null;
    const email = asString(formData.get("email")) || null;
    const desired_start = asString(formData.get("desired_start")) || null;
    const preferred_contact = asString(formData.get("preferred_contact")) || null;

    const data = {
      note: asString(formData.get("note")) || undefined,

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

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    const { data: created, error } = await supabaseAction
      .from("admissions_applications")
      .insert({
        status,
        section: section || null,
        parent_name,
        phone,
        email,
        desired_start,
        preferred_contact,
        data
      })
      .select("id")
      .maybeSingle();

    if (error || !created?.id) {
      redirect("/admin/students/applications?create_error=1");
    }

    revalidatePath("/admin/students/applications");
    redirect(`/admin/students/applications/${created.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admissions</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">New application</h1>
            <p className="mt-2 text-sm text-slate-600">Create an application in the same format as /apply.</p>
          </div>
          <Link
            href="/admin/students/applications"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back to applications
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={createApplication} className="space-y-10">
          <div>
            <div className="text-sm font-semibold text-slate-900">Quick details</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Status</label>
                <select
                  name="status"
                  defaultValue="lead"
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
              <div>
                <label className="text-sm font-semibold text-slate-900">Section</label>
                <select
                  name="section"
                  defaultValue=""
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                >
                  <option value="">—</option>
                  <option value="creche">creche</option>
                  <option value="primary">primary</option>
                  <option value="secondary">secondary</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent name</label>
                <input
                  name="parent_name"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Phone</label>
                <input
                  name="phone"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Email</label>
                <input
                  type="email"
                  name="email"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Desired start</label>
                <input
                  name="desired_start"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Preferred contact</label>
                <select
                  name="preferred_contact"
                  defaultValue="whatsapp"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                >
                  <option value="whatsapp">whatsapp</option>
                  <option value="call">call</option>
                  <option value="email">email</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Note</label>
                <input
                  name="note"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">Student details</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Last name</label>
                <input name="last_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">First name</label>
                <input name="first_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Middle name</label>
                <input name="middle_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Date of birth</label>
                <input type="date" name="dob" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Sex</label>
                <select name="sex" defaultValue="" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green">
                  <option value="">—</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Religion</label>
                <input name="religion" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Passport photo URL</label>
                <input name="passport_photo_url" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Seeking admission into</label>
                <input name="seeking_class" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Favorite sports</label>
                <input name="favorite_sports" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Hobbies</label>
                <input name="hobbies" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Future aspiration</label>
                <input name="future_aspiration" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Child is with</label>
                <input name="child_with" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">Parent details</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 1 name</label>
                <input name="parent1_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 1 phone</label>
                <input name="parent1_phone" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 1 email</label>
                <input type="email" name="parent1_email" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 1 occupation</label>
                <input name="parent1_occupation" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Parent 1 business address</label>
                <input name="parent1_business_address" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Home address</label>
                <input name="home_address" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 2 name</label>
                <input name="parent2_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 2 phone</label>
                <input name="parent2_phone" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 2 email</label>
                <input type="email" name="parent2_email" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent 2 occupation</label>
                <input name="parent2_occupation" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Parent 2 business address</label>
                <input name="parent2_business_address" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Preferred contact methods</label>
                <input name="preferred_contact_methods" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-900">Previous school & other details</div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Has been in school</label>
                <input name="has_been_in_school" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Previous school name</label>
                <input name="previous_school_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Reason for leaving</label>
                <input name="reason_for_leaving" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Qualification/Testimonial</label>
                <input name="qualification_testimonial" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Date of entry</label>
                <input type="date" name="date_of_entry" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Date of exit</label>
                <input type="date" name="date_of_exit" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Class of exit</label>
                <input name="class_of_exit" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Discovery source</label>
                <input name="discovery_source" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Referred</label>
                <input name="referred" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Referrer name</label>
                <input name="referrer_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Referrer number</label>
                <input name="referrer_ref" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Other child in school</label>
                <input name="other_child_in_school" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Other child names</label>
                <input name="other_child_names" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Pickup details</label>
                <input name="pickup_details" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Student signature</label>
                <input name="student_signature_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Student signature date</label>
                <input type="date" name="student_signature_date" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent signature</label>
                <input name="parent_signature_name" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Parent signature date</label>
                <input type="date" name="parent_signature_date" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <SubmitButton
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Creating…"
            >
              Create application
            </SubmitButton>
            <Link
              href="/admin/students/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
