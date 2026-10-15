import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageHero } from "@/components/ui/public-page";
import { school } from "@/lib/school";
import { LegalArticle } from "../_lib/legal-article";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Greenfield School collects, uses, shares and protects personal data under the Nigeria Data Protection Act 2023."
};

const LAST_UPDATED = "15 October 2026";

const sections = [
  { id: "who-we-are", title: "1. Who we are" },
  { id: "scope", title: "2. What this policy covers" },
  { id: "what-we-collect", title: "3. Information we collect" },
  { id: "children", title: "4. Children and sensitive information" },
  { id: "why", title: "5. Why we use it and our lawful bases" },
  { id: "exams", title: "6. Online exams (CBT)" },
  { id: "photos", title: "7. Photos and school publicity" },
  { id: "sharing", title: "8. Who we share it with" },
  { id: "transfers", title: "9. Transfers outside Nigeria" },
  { id: "retention", title: "10. How long we keep it" },
  { id: "security", title: "11. How we protect it" },
  { id: "rights", title: "12. Your rights" },
  { id: "cookies", title: "13. Cookies and similar technologies" },
  { id: "complaints", title: "14. Questions and complaints" },
  { id: "changes", title: "15. Changes to this policy" }
];

export default function PrivacyPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Legal"
        title="Privacy policy"
        description="How Greenfield School collects, uses and protects personal information about pupils, parents and guardians, applicants and visitors — in line with the Nigeria Data Protection Act 2023."
      />
      <LegalArticle>
        <p className="text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

        <p>
          Greenfield School (&ldquo;Greenfield&rdquo;, &ldquo;the school&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) takes the
          privacy of our pupils and their families seriously. This policy explains what personal data we collect, why we
          collect it, who we share it with, how long we keep it and the rights you have. It is written to meet the
          requirements of the <strong>Nigeria Data Protection Act 2023</strong> (&ldquo;NDP Act&rdquo;) and the Nigeria Data
          Protection Commission&rsquo;s General Application and Implementation Directive 2025 (&ldquo;GAID&rdquo;).
        </p>

        <nav aria-label="On this page" className="rounded-2xl border border-slate-200 bg-canvas p-6 text-base">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">On this page</div>
          <ol className="mt-3 !list-none !space-y-1.5 !pl-0">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <h2 id="who-we-are">1. Who we are</h2>
        <p>
          Greenfield School is the <strong>data controller</strong> for the personal data described in this policy. This
          means we decide how and why it is used and we are responsible for protecting it.
        </p>
        <ul>
          <li>
            <strong>Address:</strong> {school.address}
          </li>
          <li>
            <strong>Email:</strong> <a href={`mailto:${school.email}`}>{school.email}</a>
          </li>
          <li>
            <strong>Phone:</strong> <a href={`tel:${school.phone}`}>{school.phone}</a>
          </li>
        </ul>
        <p>
          Questions about privacy, or requests to exercise your rights, should be sent to our{" "}
          <strong>Data Protection Officer</strong> at <a href={`mailto:${school.email}`}>{school.email}</a> with the
          subject line &ldquo;Data protection&rdquo;, or delivered in writing to the school office marked &ldquo;For the
          attention of the Data Protection Officer&rdquo;.
        </p>

        <h2 id="scope">2. What this policy covers</h2>
        <p>This policy applies to personal data we process through:</p>
        <ul>
          <li>our website, including the enquiry form, the online admissions application and job applications;</li>
          <li>
            the parent &amp; student portal (report cards, exam results, attendance, activities, health and incident
            records, and fees and billing);
          </li>
          <li>computer-based tests (CBT) taken by pupils through the portal;</li>
          <li>the staff dashboard our teachers and administrators use to run the school; and</li>
          <li>our day-to-day communication with families by phone, SMS, WhatsApp, email and the portal.</li>
        </ul>
        <p>
          Staff employment records are covered by a separate notice given to staff. Where our websites link to other
          services (for example WhatsApp or a payment page), those services are run by other organisations under their
          own privacy policies.
        </p>

        <h2 id="what-we-collect">3. Information we collect</h2>
        <h3>When you contact us</h3>
        <p>Your name, email address and the message you send us through the enquiry form, phone, email or WhatsApp.</p>

        <h3>When you apply for admission</h3>
        <ul>
          <li>
            <strong>About the child:</strong> full name, date of birth, sex, religion, passport photograph, the class you
            are applying for, hobbies, favourite sports and future aspirations, who the child lives with, and previous
            schooling (school name, dates and class of entry and exit, reason for leaving, testimonial or qualification).
          </li>
          <li>
            <strong>About parents and guardians:</strong> names, phone numbers, email addresses, occupations, business
            and home addresses, preferred ways of contact, details of anyone authorised to pick the child up, whether
            other children attend Greenfield, how you heard about us and any referrer.
          </li>
          <li>
            <strong>Signatures and dates</strong> confirming the information is correct.
          </li>
        </ul>
        <p>
          An application can be saved and finished later using a private resume link. Anyone with that link can open the
          application, so please keep it private.
        </p>

        <h3>While a child is at Greenfield</h3>
        <ul>
          <li>admission number, class, level and enrolment status;</li>
          <li>
            attendance and punctuality, continuous assessment (1st and 2nd CA), examination scores, CBT answers and
            results, report cards and grades;
          </li>
          <li>clubs, activities, awards and welfare records, including discipline and uniform checks;</li>
          <li>health incidents and first aid given at school, and related notes;</li>
          <li>photographs used for identification on school records.</li>
        </ul>

        <h3>Parents and guardians</h3>
        <ul>
          <li>contact details and your relationship to each child;</li>
          <li>
            fees information: invoices, amounts paid, payment method and reference, and outstanding balances. Card
            details for online payments are entered on our payment provider&rsquo;s page — we do not receive or store
            full card numbers.
          </li>
        </ul>

        <h3>Portal accounts</h3>
        <p>
          Your sign-in email or admission number, a securely hashed password (we never see your password itself) and
          basic records of sign-ins needed to keep accounts secure.
        </p>

        <h3>Job applicants</h3>
        <p>Your name, contact details, the role you applied for, your CV and any message you send with it.</p>

        <h3>Technical information</h3>
        <p>
          Like most websites, our hosting providers automatically record limited technical data such as IP address,
          browser type and the pages requested, to keep the service secure and working.
        </p>

        <h2 id="children">4. Children and sensitive information</h2>
        <p>
          Most of the people whose data we hold are children. Under the NDP Act a child is anyone under 18, and the
          personal data of a child is processed with the <strong>consent of a parent or guardian</strong>, which is
          given when you complete the admissions application and enrol your child. Parents and guardians can exercise
          their child&rsquo;s privacy rights on the child&rsquo;s behalf. As children grow older we also explain to them,
          in age-appropriate language, how their information is used.
        </p>
        <p>
          Some information we hold is <strong>sensitive personal data</strong> under the NDP Act — in particular religion,
          health information (such as incidents and first aid at school) and records relating to a child&rsquo;s
          welfare. We only collect what we need to care for and educate your child, we rely on your explicit consent or
          another condition permitted by the NDP Act, and access is limited to staff who need it.
        </p>

        <h2 id="why">5. Why we use it and our lawful bases</h2>
        <p>The NDP Act requires us to have a lawful basis for every use of personal data. We rely on:</p>
        <ul>
          <li>
            <strong>Contract</strong> — to consider your application, provide your child&rsquo;s education, give you
            portal access, issue invoices and record payments.
          </li>
          <li>
            <strong>Consent</strong> — for children&rsquo;s data and sensitive data as described above, for photos used in
            school publicity, and for any marketing messages. You can withdraw consent at any time (see section 12);
            this does not affect anything done before you withdrew it.
          </li>
          <li>
            <strong>Legal obligation</strong> — to keep records and make returns required by education authorities, tax
            and financial record-keeping laws, and to respond to lawful requests from regulators and law enforcement.
          </li>
          <li>
            <strong>Vital interests</strong> — to protect a child or another person in an emergency, for example sharing
            health information with medical responders.
          </li>
          <li>
            <strong>Legitimate interests</strong> — to keep pupils and premises safe, protect the fairness of exams,
            prevent fraud, run and improve the school and our systems, and keep in touch with families about school life.
            We only rely on this where our interests are not overridden by your rights and the best interests of the child.
          </li>
        </ul>
        <p>
          In practice we use personal data to: process admissions; teach, assess and report on pupils&rsquo; progress;
          take attendance; look after pupils&rsquo; welfare, health and safety; run computer-based tests and publish
          results; manage fees, invoices and payments; communicate with parents and guardians; recruit staff; meet our
          legal obligations; and keep our systems secure. We do not sell personal data, and we do not use it for any
          purpose that is incompatible with the purpose it was collected for without first asking you.
        </p>

        <h2 id="exams">6. Online exams (CBT)</h2>
        <p>
          When a pupil takes a computer-based test we record their answers, the time they started and submitted, and
          integrity events — for example if the pupil leaves the exam page, which locks the attempt until an exam
          conductor reviews it. We do this to keep exams fair for every pupil.
        </p>
        <p>
          Objective questions are marked automatically, but results only count after they are reviewed and released by
          the school, and teachers mark theory answers. No decision with legal or similarly significant effect on a pupil
          is made solely by automated means.
        </p>

        <h2 id="photos">7. Photos and school publicity</h2>
        <p>
          We use a photograph of each pupil on internal school records. We would also like to celebrate school life on
          our website, notice boards, newsletters and social media; we only use identifiable photos or names of pupils
          for these purposes with a parent or guardian&rsquo;s consent, and you can withdraw that consent at any time by
          contacting us. Where a photo has already been printed or published we will remove it from our own channels as
          soon as reasonably possible.
        </p>

        <h2 id="sharing">8. Who we share it with</h2>
        <p>We share personal data only where necessary and lawful, with:</p>
        <ul>
          <li>
            <strong>Greenfield staff</strong> who need it for their role — for example class teachers, exam conductors,
            the bursary and welfare staff;
          </li>
          <li>
            <strong>parents and guardians</strong> linked to a child, through the portal and our usual communication
            channels;
          </li>
          <li>
            <strong>service providers who process data for us</strong> under our instructions, such as our database and
            sign-in provider, website hosting provider, payment provider (for online fee payments), and our email, SMS and
            messaging services (including WhatsApp);
          </li>
          <li>
            <strong>education authorities and examination bodies</strong> where required — for example for statutory
            returns or registering pupils for external examinations;
          </li>
          <li>
            <strong>another school</strong> your child moves to, when you ask us to provide records or a reference;
          </li>
          <li>
            <strong>medical or emergency services</strong> when needed to protect a child;
          </li>
          <li>
            <strong>regulators, courts and law enforcement</strong> where the law requires us to, and our professional
            advisers (such as auditors and lawyers) under a duty of confidentiality.
          </li>
        </ul>
        <p>
          Our service providers may only use personal data to provide their service to us, must keep it secure and
          confidential, and are bound by written terms consistent with the NDP Act.
        </p>

        <h2 id="transfers">9. Transfers outside Nigeria</h2>
        <p>
          Some of our technology providers (for example cloud hosting and database services) store or process data on
          servers outside Nigeria. When personal data leaves Nigeria we follow Part VIII of the NDP Act: we only transfer
          it where the recipient country or organisation offers an adequate level of protection, under binding safeguards
          such as contractual clauses, or — where neither applies — with your consent after explaining the risks. You can
          contact us for more information about these safeguards.
        </p>

        <h2 id="retention">10. How long we keep it</h2>
        <p>We keep personal data only for as long as we need it for the purposes above or as the law requires:</p>
        <ul>
          <li>
            <strong>Enquiries:</strong> up to 2 years after our last contact.
          </li>
          <li>
            <strong>Admissions applications that do not lead to enrolment:</strong> up to 2 years after the decision.
          </li>
          <li>
            <strong>Pupil records</strong> (admission register, results, report cards and transcripts): kept as part of
            the school&rsquo;s permanent academic record so we can confirm a former pupil&rsquo;s attendance and
            achievements.
          </li>
          <li>
            <strong>Welfare, health and discipline records:</strong> until 6 years after the pupil leaves, unless a
            longer period is needed for safeguarding or legal reasons.
          </li>
          <li>
            <strong>CBT answers and exam integrity logs:</strong> up to 2 years after results are released.
          </li>
          <li>
            <strong>Fees, invoices and payment records:</strong> 6 years after the end of the financial year they relate
            to, as required for tax and accounting.
          </li>
          <li>
            <strong>Unsuccessful job applications and CVs:</strong> up to 12 months after the role is filled.
          </li>
          <li>
            <strong>Portal accounts:</strong> closed when a pupil leaves or a parent no longer has a child at the school;
            security logs are kept for up to 12 months.
          </li>
        </ul>
        <p>When data is no longer needed it is securely deleted or anonymised.</p>

        <h2 id="security">11. How we protect it</h2>
        <p>
          We use technical and organisational measures appropriate to the risk, including encrypted connections (HTTPS),
          role-based access so staff only see what their job requires, hashed passwords, database access rules,
          confidentiality obligations for staff and providers, and regular staff training on data protection.
        </p>
        <p>
          No system is completely secure. If a personal data breach is likely to put people&rsquo;s rights at risk, we
          will notify the Nigeria Data Protection Commission <strong>within 72 hours</strong> of becoming aware of it, and
          where there is a high risk to you or your child we will tell you directly and without delay, in plain language,
          with advice on steps you can take.
        </p>
        <p>
          You can help by keeping portal passwords private, signing out on shared devices, and keeping application resume
          links to yourself.
        </p>

        <h2 id="rights">12. Your rights</h2>
        <p>Under the NDP Act you have the right to:</p>
        <ul>
          <li>
            <strong>be informed</strong> about how your personal data is used (this policy);
          </li>
          <li>
            <strong>access</strong> the personal data we hold about you or your child and receive a copy;
          </li>
          <li>
            <strong>correct</strong> information that is inaccurate or incomplete — parents can also ask the school office
            to update contact details at any time;
          </li>
          <li>
            <strong>erasure</strong> of personal data we no longer have a lawful reason to keep;
          </li>
          <li>
            <strong>restrict</strong> how we use your data while a concern is being looked into;
          </li>
          <li>
            <strong>object</strong> to processing based on our legitimate interests, and to direct marketing at any time;
          </li>
          <li>
            <strong>data portability</strong> — receive data you provided to us in a commonly used, machine-readable
            format, or have it sent to another organisation where technically feasible;
          </li>
          <li>
            <strong>withdraw consent</strong> at any time where we rely on consent;
          </li>
          <li>
            <strong>not be subject to a decision based solely on automated processing</strong> that has legal or
            similarly significant effects on you.
          </li>
        </ul>
        <p>
          To use any of these rights, contact our Data Protection Officer (section 1). We may need to confirm your
          identity, and for a child&rsquo;s data, your parental responsibility. We will respond without undue delay and
          in any case within one month. Some rights are limited by law — for example we must keep certain academic and
          financial records — and if we cannot fully meet a request we will explain why. There is normally no fee.
        </p>

        <h2 id="cookies">13. Cookies and similar technologies</h2>
        <p>
          Our website only uses <strong>strictly necessary</strong> cookies and browser storage: sign-in cookies that keep
          you securely logged in to the portal or staff dashboard, and small settings such as remembering whether the
          staff sidebar is collapsed. These are needed for the services you ask for, so they do not require a consent
          banner.
        </p>
        <p>
          We do not use advertising or analytics cookies. If we ever introduce cookies that are not strictly necessary,
          we will ask for your consent first with a clear choice to accept or reject them, and update this policy.
        </p>

        <h2 id="complaints">14. Questions and complaints</h2>
        <p>
          If you have a concern about how we handle personal data, please contact our Data Protection Officer first —
          we will try to resolve it quickly.
        </p>
        <p>
          You also have the right to lodge a complaint with the <strong>Nigeria Data Protection Commission (NDPC)</strong>,
          the regulator responsible for data protection in Nigeria, at{" "}
          <a href="https://ndpc.gov.ng" target="_blank" rel="noreferrer">
            ndpc.gov.ng
          </a>
          , and to seek redress in court.
        </p>

        <h2 id="changes">15. Changes to this policy</h2>
        <p>
          We review this policy regularly and will update it when our practices or the law change. The &ldquo;last
          updated&rdquo; date at the top shows when it was last changed, and we will tell parents about significant
          changes through the portal or our usual channels. Please also read our{" "}
          <Link href="/terms">Terms of use</Link>.
        </p>
      </LegalArticle>
    </div>
  );
}
