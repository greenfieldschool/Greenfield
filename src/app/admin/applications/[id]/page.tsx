import { MessageCircle, UserCheck } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { safeFilterTerm } from "@/lib/postgrest";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import {
  APPLICATION_STATUSES,
  ApplicationStatusBadge,
  DetailList,
  SelectField,
  SubHeading,
  TextAreaField,
  TextField,
  formatDateTime,
  humanize
} from "../_ui";

// Keys stored in admissions_applications.data that the edit forms can change.
const APPLICATION_DATA_KEYS = [
  "note",
  "first_name",
  "middle_name",
  "last_name",
  "sex",
  "religion",
  "dob",
  "passport_photo_url",
  "seeking_class",
  "favorite_sports",
  "hobbies",
  "future_aspiration",
  "child_with",
  "parent1_name",
  "parent1_phone",
  "parent1_email",
  "parent1_occupation",
  "parent1_business_address",
  "home_address",
  "parent2_name",
  "parent2_phone",
  "parent2_email",
  "parent2_occupation",
  "parent2_business_address",
  "preferred_contact_methods",
  "has_been_in_school",
  "previous_school_name",
  "reason_for_leaving",
  "qualification_testimonial",
  "date_of_entry",
  "date_of_exit",
  "class_of_exit",
  "discovery_source",
  "referred",
  "referrer_name",
  "referrer_ref",
  "other_child_in_school",
  "other_child_names",
  "pickup_details",
  "student_signature_name",
  "student_signature_date",
  "parent_signature_name",
  "parent_signature_date"
] as const;

function asString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

const BACK = { href: "/admin/students/applications", label: "Back to applications" };

function detailUrl(id: string, toast: string, type: "success" | "error" = "error") {
  return `/admin/students/applications/${id}?toast=${encodeURIComponent(toast)}&toast_type=${type}`;
}

function approveErrorUrl(id: string, message: string) {
  return `/admin/students/applications/${id}?approve_error=${encodeURIComponent(message)}`;
}

export default async function AdminApplicationDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const approveError = typeof searchParams?.approve_error === "string" ? searchParams.approve_error : "";
  // Re-mount UrlToast whenever a new toast arrives (redirects back to this same page keep client state).
  const toastKey = typeof searchParams?.toast === "string" ? searchParams.toast : "none";
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader back={BACK} eyebrow="Admissions application" title="Application" />
        <Alert tone="warning" title="Supabase is not configured.">
          This application can&apos;t be loaded until the database connection is set up.
        </Alert>
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
      <div className="space-y-6">
        <PageHeader back={BACK} eyebrow="Admissions application" title="Application not found" />
        <Alert tone="warning" title="We couldn't find this application.">
          It may have been removed, or the link is incorrect.
        </Alert>
      </div>
    );
  }

  async function updateStatus(formData: FormData) {
    "use server";

    const nextStatus = String(formData.get("status") ?? "").trim();
    if (!nextStatus) redirect(detailUrl(params.id, "Choose a status before saving"));

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) redirect(detailUrl(params.id, "Database is not configured — status was not saved"));

    const { error: statusError } = await supabaseAction
      .from("admissions_applications")
      .update({ status: nextStatus })
      .eq("id", params.id);

    if (statusError) redirect(detailUrl(params.id, `Could not update status: ${statusError.message}`));
    redirect(detailUrl(params.id, "Status updated", "success"));
  }

  const data = (row.data as Record<string, unknown>) ?? {};

  async function updateApplication(formData: FormData) {
    "use server";

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) redirect(detailUrl(params.id, "Database is not configured — changes were not saved"));

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

    // The page has two separate edit forms that share this action. Only fields actually present in
    // the submitted form are updated, so saving one form never wipes what the other one holds.
    const topLevel: Record<string, string | null> = {};
    for (const key of ["parent_name", "phone", "email", "desired_start", "preferred_contact", "section"]) {
      if (formData.has(key)) topLevel[key] = asString(formData.get(key)) || null;
    }

    const nextData: Record<string, unknown> = { ...data };
    for (const key of APPLICATION_DATA_KEYS) {
      if (!formData.has(key)) continue;
      const value = asString(formData.get(key));
      if (value.length) nextData[key] = value;
      else delete nextData[key];
    }

    const { error: saveError } = await supabaseAction
      .from("admissions_applications")
      .update({ ...topLevel, data: nextData })
      .eq("id", params.id);

    if (saveError) redirect(detailUrl(params.id, `Could not save application: ${saveError.message}`));
    redirect(detailUrl(params.id, "Application saved", "success"));
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
    if (!supabaseAction) redirect(approveErrorUrl(params.id, "Database is not configured."));

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
      redirect(approveErrorUrl(params.id, "This application could not be loaded. Refresh and try again."));
    }

    const appStatus = (appRow.status as string | null) ?? null;
    const canApprove =
      appStatus === "lead" ||
      appStatus === "submitted" ||
      appStatus === "contacted" ||
      appStatus === "visit_booked" ||
      appStatus === "applied";
    if (!canApprove) {
      redirect(
        approveErrorUrl(
          params.id,
          `Applications with status "${appStatus ?? "unknown"}" can't be approved. Change the status to lead, submitted, contacted, visit booked or applied first.`
        )
      );
    }

    const payload = (appRow.data as Record<string, unknown>) ?? {};
    const section = (appRow.section as string | null) ?? null;
    const level = section === "creche" || section === "primary" || section === "secondary" ? section : null;

    const seekingClass = typeof payload.seeking_class === "string" ? payload.seeking_class.trim() : "";
    let classId: string | null = null;
    let classLevel: string | null = null;
    if (seekingClass.length) {
      const { data: classExact } = await supabaseAction
        .from("classes")
        .select("id, level")
        .ilike("name", seekingClass)
        .limit(1)
        .maybeSingle();

      classId = (classExact?.id as string | undefined) ?? null;
      classLevel = (classExact?.level as string | undefined) ?? null;

      const looseTerm = safeFilterTerm(seekingClass);
      if (!classId && looseTerm.length) {
        const { data: classLoose } = await supabaseAction
          .from("classes")
          .select("id, level")
          .ilike("name", `%${looseTerm}%`)
          .limit(1)
          .maybeSingle();

        classId = (classLoose?.id as string | undefined) ?? null;
        classLevel = (classLoose?.level as string | undefined) ?? null;
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
        level: classLevel ?? level ?? "primary",
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
      redirect(
        approveErrorUrl(
          params.id,
          `The student record could not be created${createError?.message ? `: ${createError.message}` : "."} Check the student's first and last name and try again.`
        )
      );
    }

    const { error: enrollError } = await supabaseAction
      .from("admissions_applications")
      .update({ status: "enrolled" })
      .eq("id", params.id);

    if (enrollError) {
      redirect(
        `/admin/students/${createdStudent.id}?toast=${encodeURIComponent(
          `Student created, but the application status could not be set to enrolled: ${enrollError.message}`
        )}&toast_type=error`
      );
    }

    redirect(`/admin/students/${createdStudent.id}`);
  }

  const sectionOptions = [
    { value: "", label: "(none)" },
    { value: "creche", label: "Creche" },
    { value: "primary", label: "Primary" },
    { value: "secondary", label: "Secondary" }
  ];
  const yesNoOptions = [
    { value: "", label: "—" },
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" }
  ];

  return (
    <div className="space-y-6">
      <UrlToast key={toastKey} />
      <PageHeader
        back={BACK}
        eyebrow="Admissions application"
        title={row.parent_name ?? "Application"}
        description={`Created ${formatDateTime(row.created_at)} · Last updated ${formatDateTime(row.updated_at)}`}
        actions={
          <>
            {row.phone ? (
              <a
                href={`https://wa.me/${String(row.phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary" })}
              >
                <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
                WhatsApp parent
              </a>
            ) : null}
            {existingStudentId ? (
              <ButtonLink href={`/admin/students/${existingStudentId}`}>
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                View student
              </ButtonLink>
            ) : (
              <form action={approveApplication}>
                <SubmitButton variant="primary" pendingText="Approving…">
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Approve
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      {approveError ? (
        <Alert tone="danger" title="This application could not be approved.">
          {approveError}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Overview" description="Contact details and where this application stands." />
          <CardBody>
            <DetailList
              className="md:grid-cols-3"
              items={[
                { label: "Status", node: <ApplicationStatusBadge status={row.status as string | null} /> },
                { label: "Section", value: row.section ? humanize(String(row.section)) : null },
                { label: "Preferred contact", value: row.preferred_contact },
                { label: "Parent name", value: row.parent_name },
                { label: "Phone", value: row.phone },
                { label: "Email", value: row.email },
                { label: "Desired start", value: row.desired_start }
              ]}
            />
          </CardBody>
        </Card>

        <form action={updateStatus} className="contents">
          <FormSection
            title="Update status"
            description={
              existingStudentId
                ? "A student record has already been created from this application."
                : "Approving creates a student record and marks the application as enrolled."
            }
            footer={
              <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                Save status
              </SubmitButton>
            }
          >
            <SelectField
              label="Status"
              name="status"
              idPrefix="status"
              defaultValue={String(row.status ?? "lead")}
              options={APPLICATION_STATUSES.map((v) => ({ value: v, label: humanize(v) }))}
            />
          </FormSection>
        </form>
      </div>

      <Card>
        <CardHeader title="Application details" description="These fields are saved from the /apply wizard." />
        <CardBody className="space-y-8">
          <div>
            <SubHeading>Student</SubHeading>
            <DetailList
              items={[
                { label: "First name", value: data.first_name ?? data.other_names },
                { label: "Middle name", value: data.middle_name },
                { label: "Last name", value: data.last_name ?? data.surname },
                { label: "Date of birth", value: data.dob },
                { label: "Sex", value: data.sex },
                { label: "Religion", value: data.religion },
                { label: "Passport photo URL", value: data.passport_photo_url },
                { label: "Seeking admission into", value: data.seeking_class },
                { label: "Favorite sports", value: data.favorite_sports },
                { label: "Hobbies", value: data.hobbies },
                { label: "Future aspiration", value: data.future_aspiration },
                { label: "Child is with", value: data.child_with },
                { label: "Note", value: data.note, wide: true, multiline: true }
              ]}
            />
          </div>
          <div className="border-t border-slate-100 pt-6">
            <SubHeading>Parents</SubHeading>
            <DetailList
              items={[
                { label: "Parent 1 name", value: data.parent1_name },
                { label: "Parent 1 phone", value: data.parent1_phone },
                { label: "Parent 1 email", value: data.parent1_email },
                { label: "Parent 1 occupation", value: data.parent1_occupation },
                { label: "Parent 1 business address", value: data.parent1_business_address },
                { label: "Home address", value: data.home_address },
                { label: "Parent 2 name", value: data.parent2_name },
                { label: "Parent 2 phone", value: data.parent2_phone },
                { label: "Parent 2 email", value: data.parent2_email },
                { label: "Parent 2 occupation", value: data.parent2_occupation },
                { label: "Parent 2 business address", value: data.parent2_business_address },
                { label: "Preferred contact methods", value: data.preferred_contact_methods }
              ]}
            />
          </div>
          <div className="border-t border-slate-100 pt-6">
            <SubHeading>School history &amp; other details</SubHeading>
            <DetailList
              items={[
                { label: "Has been in school", value: data.has_been_in_school },
                { label: "Previous school", value: data.previous_school_name },
                { label: "Reason for leaving", value: data.reason_for_leaving },
                { label: "Qualification/Testimonial", value: data.qualification_testimonial },
                { label: "Date of entry", value: data.date_of_entry },
                { label: "Date of exit", value: data.date_of_exit },
                { label: "Class of exit", value: data.class_of_exit },
                { label: "Discovery source", value: data.discovery_source },
                { label: "Referred", value: data.referred },
                { label: "Referrer name", value: data.referrer_name },
                { label: "Referrer number", value: data.referrer_ref },
                { label: "Other child in school", value: data.other_child_in_school },
                { label: "Other child name(s)", value: data.other_child_names },
                { label: "Pickup details", value: data.pickup_details, multiline: true },
                { label: "Student signature", value: data.student_signature_name },
                { label: "Student signature date", value: data.student_signature_date },
                { label: "Parent signature", value: data.parent_signature_name },
                { label: "Parent signature date", value: data.parent_signature_date }
              ]}
            />
          </div>
        </CardBody>
      </Card>

      <form action={updateApplication}>
        <FormSection
          title="Edit application"
          description="Update the admin-managed fields for this application."
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              Save application
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Section" name="section" defaultValue={String(row.section ?? "")} options={sectionOptions} />
            <TextField label="Preferred contact" name="preferred_contact" defaultValue={String(row.preferred_contact ?? "")} />
            <TextField label="Parent name" name="parent_name" defaultValue={String(row.parent_name ?? "")} />
            <TextField label="Phone" name="phone" type="tel" defaultValue={String(row.phone ?? "")} />
            <TextField label="Email" name="email" type="email" defaultValue={String(row.email ?? "")} />
            <TextField label="Desired start" name="desired_start" defaultValue={String(row.desired_start ?? "")} />
            <TextAreaField label="Note" name="note" defaultValue={str(data.note)} className="sm:col-span-2" />
          </div>
        </FormSection>
      </form>

      <form action={updateApplication}>
        <FormSection
          title="Edit application details"
          description="Update the fields captured from /apply."
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              Save application details
            </SubmitButton>
          }
        >
          <div className="space-y-8">
            <div>
              <SubHeading>Student</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="First name" name="first_name" defaultValue={str(data.first_name)} />
                <TextField label="Middle name" name="middle_name" defaultValue={str(data.middle_name)} />
                <TextField label="Last name" name="last_name" defaultValue={str(data.last_name)} />
                <TextField label="Date of birth" name="dob" type="date" defaultValue={str(data.dob)} />
                <SelectField
                  label="Sex"
                  name="sex"
                  defaultValue={str(data.sex)}
                  options={[
                    { value: "", label: "—" },
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" }
                  ]}
                />
                <TextField label="Religion" name="religion" defaultValue={str(data.religion)} />
                <TextField
                  label="Passport photo URL"
                  name="passport_photo_url"
                  defaultValue={str(data.passport_photo_url)}
                  className="sm:col-span-2"
                />
                <TextField label="Seeking admission into" name="seeking_class" defaultValue={str(data.seeking_class)} />
                <TextField label="Favorite sports" name="favorite_sports" defaultValue={str(data.favorite_sports)} />
                <TextField label="Hobbies" name="hobbies" hint="Separate with commas." defaultValue={str(data.hobbies)} />
                <TextField label="Future aspiration" name="future_aspiration" defaultValue={str(data.future_aspiration)} />
                <TextField label="Child is with" name="child_with" defaultValue={str(data.child_with)} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SubHeading>Parents</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Parent 1 name" name="parent1_name" defaultValue={str(data.parent1_name)} />
                <TextField label="Parent 1 phone" name="parent1_phone" type="tel" defaultValue={str(data.parent1_phone)} />
                <TextField label="Parent 1 email" name="parent1_email" type="email" defaultValue={str(data.parent1_email)} />
                <TextField label="Parent 1 occupation" name="parent1_occupation" defaultValue={str(data.parent1_occupation)} />
                <TextField
                  label="Parent 1 business address"
                  name="parent1_business_address"
                  defaultValue={str(data.parent1_business_address)}
                  className="sm:col-span-2"
                />
                <TextField label="Home address" name="home_address" defaultValue={str(data.home_address)} className="sm:col-span-2" />
                <TextField label="Parent 2 name" name="parent2_name" defaultValue={str(data.parent2_name)} />
                <TextField label="Parent 2 phone" name="parent2_phone" type="tel" defaultValue={str(data.parent2_phone)} />
                <TextField label="Parent 2 email" name="parent2_email" type="email" defaultValue={str(data.parent2_email)} />
                <TextField label="Parent 2 occupation" name="parent2_occupation" defaultValue={str(data.parent2_occupation)} />
                <TextField
                  label="Parent 2 business address"
                  name="parent2_business_address"
                  defaultValue={str(data.parent2_business_address)}
                  className="sm:col-span-2"
                />
                <TextField
                  label="Preferred contact methods"
                  name="preferred_contact_methods"
                  defaultValue={str(data.preferred_contact_methods)}
                  className="sm:col-span-2"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SubHeading>School history</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Has been in school"
                  name="has_been_in_school"
                  defaultValue={str(data.has_been_in_school)}
                  options={yesNoOptions}
                />
                <TextField label="Previous school" name="previous_school_name" defaultValue={str(data.previous_school_name)} />
                <TextField
                  label="Reason for leaving"
                  name="reason_for_leaving"
                  defaultValue={str(data.reason_for_leaving)}
                  className="sm:col-span-2"
                />
                <TextField
                  label="Qualification/Testimonial"
                  name="qualification_testimonial"
                  defaultValue={str(data.qualification_testimonial)}
                  className="sm:col-span-2"
                />
                <TextField label="Date of entry" name="date_of_entry" type="date" defaultValue={str(data.date_of_entry)} />
                <TextField label="Date of exit" name="date_of_exit" type="date" defaultValue={str(data.date_of_exit)} />
                <TextField label="Class of exit" name="class_of_exit" defaultValue={str(data.class_of_exit)} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SubHeading>Discovery &amp; pickup</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Discovery source" name="discovery_source" defaultValue={str(data.discovery_source)} />
                <TextField label="Referred" name="referred" defaultValue={str(data.referred)} />
                <TextField label="Referrer name" name="referrer_name" defaultValue={str(data.referrer_name)} />
                <TextField label="Referrer number" name="referrer_ref" defaultValue={str(data.referrer_ref)} />
                <TextField label="Other child in school" name="other_child_in_school" defaultValue={str(data.other_child_in_school)} />
                <TextField label="Other child name(s)" name="other_child_names" defaultValue={str(data.other_child_names)} />
                <TextAreaField
                  label="Pickup details"
                  name="pickup_details"
                  defaultValue={str(data.pickup_details)}
                  className="sm:col-span-2"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <SubHeading>Signatures</SubHeading>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Student signature" name="student_signature_name" defaultValue={str(data.student_signature_name)} />
                <TextField
                  label="Student signature date"
                  name="student_signature_date"
                  type="date"
                  defaultValue={str(data.student_signature_date)}
                />
                <TextField label="Parent signature" name="parent_signature_name" defaultValue={str(data.parent_signature_name)} />
                <TextField
                  label="Parent signature date"
                  name="parent_signature_date"
                  type="date"
                  defaultValue={str(data.parent_signature_date)}
                />
              </div>
            </div>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
