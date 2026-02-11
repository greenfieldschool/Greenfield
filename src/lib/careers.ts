export type CareerJob = {
  slug: string;
  title: string;
  location: string;
  employmentType: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  reportsTo?: string;
  compensation?: string;
  applyEmail?: string;
  applyWhatsapp?: string;
  applyLink?: string;
  updatedAt: string;
};

export type CareerJobDbRow = {
  id: string;
  slug: string;
  title: string;
  location: string;
  employment_type: string;
  summary: string;
  responsibilities: string[] | null;
  requirements: string[] | null;
  reports_to: string | null;
  compensation: string | null;
  apply_email: string | null;
  apply_whatsapp: string | null;
  apply_link: string | null;
  published: boolean;
  updated_at: string;
};

export const careerJobs: CareerJob[] = [
  {
    slug: "early-years-teacher",
    title: "Early Years Teacher (Creche / Nursery)",
    location: "Aba, Abia State",
    employmentType: "Full-time",
    summary:
      "We’re looking for a warm, organised Early Years Teacher to help our youngest learners build strong foundations in literacy, numeracy, play, and character.",
    responsibilities: [
      "Plan and deliver developmentally appropriate lessons and play-based activities",
      "Create a safe, nurturing classroom environment",
      "Track learning progress and share updates with parents/guardians",
      "Collaborate with the school leadership and teaching team"
    ],
    requirements: [
      "Relevant teaching qualification (NCE/B.Ed/PGDE) or equivalent experience",
      "Experience working with Early Years (ages 2–5) is an advantage",
      "Strong communication and classroom management skills",
      "A growth mindset and commitment to safeguarding"
    ],
    reportsTo: "Head of School",
    applyEmail: "info@greenfieldschool.ng",
    applyWhatsapp: "https://wa.me/2349060010300",
    updatedAt: "2026-02-11"
  },
  {
    slug: "primary-class-teacher",
    title: "Primary Class Teacher",
    location: "Aba, Abia State",
    employmentType: "Full-time",
    summary:
      "We’re hiring a Primary Teacher who can deliver engaging, structured lessons and build confident learners with strong values.",
    responsibilities: [
      "Deliver lessons aligned to a blended Nigerian + British curriculum",
      "Assess learning and provide feedback to pupils and parents",
      "Maintain a positive, well-managed classroom",
      "Participate in school events and continuous professional development"
    ],
    requirements: [
      "NCE/B.Ed/PGDE (or equivalent)",
      "Strong English communication and lesson planning ability",
      "Comfortable using basic digital tools (Google Docs/Sheets, email)",
      "Evidence of integrity, discipline, and child safeguarding"
    ],
    reportsTo: "Head of Primary",
    applyEmail: "info@greenfieldschool.ng",
    applyWhatsapp: "https://wa.me/2349060010300",
    updatedAt: "2026-02-11"
  },
  {
    slug: "secondary-maths-teacher",
    title: "Secondary Mathematics Teacher",
    location: "Aba, Abia State",
    employmentType: "Full-time",
    summary:
      "We’re recruiting a Mathematics Teacher who can explain concepts clearly, drive strong results, and support students with different learning needs.",
    responsibilities: [
      "Teach Mathematics to Junior/Senior Secondary students",
      "Set assignments and prepare students for assessments and exams",
      "Use data to support students who need extra help",
      "Collaborate with other subject teachers and leadership"
    ],
    requirements: [
      "B.Sc/B.Ed in Mathematics or related discipline",
      "Demonstrated ability to teach and simplify difficult topics",
      "Excellent classroom management",
      "WAEC/NECO exam experience is an advantage"
    ],
    reportsTo: "Secondary School Coordinator",
    applyEmail: "info@greenfieldschool.ng",
    applyWhatsapp: "https://wa.me/2349060010300",
    updatedAt: "2026-02-11"
  },
  {
    slug: "front-desk-admin",
    title: "Front Desk / Admin Officer",
    location: "Aba, Abia State",
    employmentType: "Full-time",
    summary:
      "We’re looking for a professional, friendly Front Desk/Admin Officer to welcome families, coordinate enquiries, and support daily school operations.",
    responsibilities: [
      "Welcome visitors and handle calls/messages professionally",
      "Support admissions enquiries and follow-ups",
      "Maintain basic records and schedules",
      "Coordinate with teaching and operations teams"
    ],
    requirements: [
      "Strong communication and interpersonal skills",
      "Good organisation and attention to detail",
      "Basic computer literacy (email, documents, spreadsheets)",
      "Prior front-desk experience is an advantage"
    ],
    reportsTo: "School Administrator",
    applyEmail: "info@greenfieldschool.ng",
    applyWhatsapp: "https://wa.me/2349060010300",
    updatedAt: "2026-02-11"
  }
];

export function getCareerJobBySlug(slug: string) {
  return careerJobs.find((j) => j.slug === slug) ?? null;
}

export function getCareerJobSlugs() {
  return careerJobs.map((j) => j.slug);
}

export function formatApplyCTA(job: CareerJob) {
  if (job.applyLink) return job.applyLink;
  if (job.applyWhatsapp) return job.applyWhatsapp;
  if (job.applyEmail) return `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`;
  return null;
}

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getSupabasePublicClient() {
  if (!hasSupabaseEnv()) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export function mapDbJobToCareerJob(row: CareerJobDbRow): CareerJob {
  return {
    slug: row.slug,
    title: row.title,
    location: row.location,
    employmentType: row.employment_type,
    summary: row.summary,
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities : [],
    requirements: Array.isArray(row.requirements) ? row.requirements : [],
    reportsTo: row.reports_to ?? undefined,
    compensation: row.compensation ?? undefined,
    applyEmail: row.apply_email ?? undefined,
    applyWhatsapp: row.apply_whatsapp ?? undefined,
    applyLink: row.apply_link ?? undefined,
    updatedAt: row.updated_at
  };
}

export async function getPublishedCareerJobs(): Promise<CareerJob[]> {
  try {
    const supabase = await getSupabasePublicClient();
    if (!supabase) return careerJobs;

    const { data } = await supabase
      .from("career_jobs")
      .select(
        "slug,title,location,employment_type,summary,responsibilities,requirements,reports_to,compensation,apply_email,apply_whatsapp,apply_link,published,updated_at"
      )
      .eq("published", true)
      .order("updated_at", { ascending: false });

    if (!data || data.length === 0) return careerJobs;
    return (data as CareerJobDbRow[]).map(mapDbJobToCareerJob);
  } catch {
    return careerJobs;
  }
}

export async function getPublishedCareerJobBySlug(slug: string): Promise<CareerJob | null> {
  const jobs = await getPublishedCareerJobs();
  return jobs.find((j) => j.slug === slug) ?? null;
}

export async function getPublishedCareerJobSlugs(): Promise<string[]> {
  const jobs = await getPublishedCareerJobs();
  return jobs.map((j) => j.slug);
}
