import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { APPLICATION_STATUSES, SelectField, SubHeading, TextField, humanize } from "../_ui";

type AdmissionsSection = "creche" | "primary" | "secondary";

function asString(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

export default async function AdminNewApplicationPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader
          back={{ href: "/admin/students/applications", label: "Back to applications" }}
          eyebrow="Admissions"
          title="New application"
        />
        <Alert tone="warning" title="Supabase is not configured.">
          Applications can&apos;t be created until the database connection is set up.
        </Alert>
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
    if (!supabaseAction) redirect("/admin/students/applications?create_error=1");

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

  const statusOptions = APPLICATION_STATUSES.map((v) => ({ value: v, label: humanize(v) }));
  const sectionOptions = [
    { value: "", label: "—" },
    { value: "creche", label: "Creche" },
    { value: "primary", label: "Primary" },
    { value: "secondary", label: "Secondary" }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/students/applications", label: "Back to applications" }}
        eyebrow="Admissions"
        title="New application"
        description="Create an application in the same format as /apply. Only fill in what you know — everything can be edited later."
      />

      <form action={createApplication} className="space-y-6">
        <FormSection title="Application" description="Pipeline stage and the main contact for this enquiry.">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Status" name="status" defaultValue="lead" options={statusOptions} />
            <SelectField label="Section" name="section" defaultValue="" options={sectionOptions} />
            <TextField label="Parent name" name="parent_name" />
            <TextField label="Phone" name="phone" type="tel" />
            <TextField label="Email" name="email" type="email" />
            <TextField label="Desired start" name="desired_start" placeholder="e.g. September 2026" />
            <SelectField
              label="Preferred contact"
              name="preferred_contact"
              defaultValue="whatsapp"
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "call", label: "Call" },
                { value: "email", label: "Email" }
              ]}
            />
            <TextField label="Note" name="note" />
          </div>
        </FormSection>

        <FormSection title="Student details" description="The child seeking admission.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Last name" name="last_name" />
            <TextField label="First name" name="first_name" />
            <TextField label="Middle name" name="middle_name" className="sm:col-span-2" />
            <TextField label="Date of birth" name="dob" type="date" />
            <SelectField
              label="Sex"
              name="sex"
              defaultValue=""
              options={[
                { value: "", label: "—" },
                { value: "male", label: "Male" },
                { value: "female", label: "Female" }
              ]}
            />
            <TextField label="Religion" name="religion" />
            <TextField label="Passport photo URL" name="passport_photo_url" placeholder="https://…" />
            <TextField label="Seeking admission into" name="seeking_class" placeholder="e.g. JSS 1" />
            <TextField label="Favorite sports" name="favorite_sports" />
            <TextField label="Hobbies" name="hobbies" hint="Separate with commas." className="sm:col-span-2" />
            <TextField label="Future aspiration" name="future_aspiration" className="sm:col-span-2" />
            <TextField label="Child is with" name="child_with" className="sm:col-span-2" />
          </div>
        </FormSection>

        <FormSection title="Parent details" description="Contact and work details for each parent or guardian.">
          <div className="space-y-8">
            <div>
              <SubHeading>Parent 1</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Parent 1 name" name="parent1_name" />
                <TextField label="Parent 1 phone" name="parent1_phone" type="tel" />
                <TextField label="Parent 1 email" name="parent1_email" type="email" />
                <TextField label="Parent 1 occupation" name="parent1_occupation" />
                <TextField label="Parent 1 business address" name="parent1_business_address" className="sm:col-span-2" />
                <TextField label="Home address" name="home_address" className="sm:col-span-2" />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-6">
              <SubHeading>Parent 2</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Parent 2 name" name="parent2_name" />
                <TextField label="Parent 2 phone" name="parent2_phone" type="tel" />
                <TextField label="Parent 2 email" name="parent2_email" type="email" />
                <TextField label="Parent 2 occupation" name="parent2_occupation" />
                <TextField label="Parent 2 business address" name="parent2_business_address" className="sm:col-span-2" />
                <TextField label="Preferred contact methods" name="preferred_contact_methods" className="sm:col-span-2" />
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Previous school">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Has been in school"
              name="has_been_in_school"
              defaultValue=""
              options={[
                { value: "", label: "—" },
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" }
              ]}
            />
            <TextField label="Previous school name" name="previous_school_name" />
            <TextField label="Reason for leaving" name="reason_for_leaving" className="sm:col-span-2" />
            <TextField label="Qualification/Testimonial" name="qualification_testimonial" className="sm:col-span-2" />
            <TextField label="Date of entry" name="date_of_entry" type="date" />
            <TextField label="Date of exit" name="date_of_exit" type="date" />
            <TextField label="Class of exit" name="class_of_exit" />
          </div>
        </FormSection>

        <FormSection title="Referral & other details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Discovery source" name="discovery_source" />
            <TextField label="Referred" name="referred" />
            <TextField label="Referrer name" name="referrer_name" />
            <TextField label="Referrer number" name="referrer_ref" />
            <TextField label="Other child in school" name="other_child_in_school" />
            <TextField label="Other child names" name="other_child_names" />
            <TextField label="Pickup details" name="pickup_details" className="sm:col-span-2" />
          </div>
        </FormSection>

        <FormSection
          title="Signatures"
          footer={
            <>
              <ButtonLink href="/admin/students/applications" variant="secondary">
                Cancel
              </ButtonLink>
              <SubmitButton variant="primary" pendingText="Creating…">
                Create application
              </SubmitButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Student signature" name="student_signature_name" />
            <TextField label="Student signature date" name="student_signature_date" type="date" />
            <TextField label="Parent signature" name="parent_signature_name" />
            <TextField label="Parent signature date" name="parent_signature_date" type="date" />
          </div>
        </FormSection>
      </form>
    </div>
  );
}
