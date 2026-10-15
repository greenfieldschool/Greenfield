import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageHero } from "@/components/ui/public-page";
import { school } from "@/lib/school";
import { LegalArticle } from "../_lib/legal-article";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The terms that apply when you use the Greenfield School website, online admissions, the parent & student portal and online exams."
};

const LAST_UPDATED = "15 October 2026";

const sections = [
  { id: "about", title: "1. About these terms" },
  { id: "website", title: "2. Using our website" },
  { id: "admissions", title: "3. Enquiries and admissions applications" },
  { id: "accounts", title: "4. Portal and staff accounts" },
  { id: "exams", title: "5. Online exams (CBT)" },
  { id: "records", title: "6. Results and school records" },
  { id: "fees", title: "7. Fees and payments" },
  { id: "communications", title: "8. How we communicate with you" },
  { id: "content", title: "9. Our content and your content" },
  { id: "third-parties", title: "10. Third-party services and links" },
  { id: "availability", title: "11. Availability of the service" },
  { id: "liability", title: "12. Our responsibility to you" },
  { id: "suspension", title: "13. Suspending or closing accounts" },
  { id: "law", title: "14. Governing law and disputes" },
  { id: "changes", title: "15. Changes and contact" }
];

export default function TermsPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Legal"
        title="Terms of use"
        description="The rules that apply when you use the Greenfield School website, apply for admission, or sign in to the parent & student portal."
      />
      <LegalArticle>
        <p className="text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>

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

        <h2 id="about">1. About these terms</h2>
        <p>
          These terms apply to everyone who uses the Greenfield School website and its online services — the enquiry
          form, online admissions application, job applications, the parent &amp; student portal, computer-based tests
          (CBT) and online fee payments (together, the &ldquo;services&rdquo;). The services are provided by Greenfield
          School, {school.address} (&ldquo;Greenfield&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>
          By using the services you agree to these terms. If a child uses the portal, the parent or guardian who enrolled
          them accepts these terms on the child&rsquo;s behalf and should help them understand the rules. These terms sit
          alongside our <Link href="/privacy">Privacy policy</Link>, which explains how we handle personal data, and the
          school rules and fee arrangements communicated to families at admission and each term. If anything in these
          terms conflicts with your child&rsquo;s admission documents or the school&rsquo;s written policies, those
          documents take priority.
        </p>

        <h2 id="website">2. Using our website</h2>
        <p>You may use our website for lawful, personal and non-commercial purposes. You must not:</p>
        <ul>
          <li>try to gain unauthorised access to the services, other people&rsquo;s accounts, or our systems or data;</li>
          <li>
            interfere with the services, introduce viruses or harmful code, or overload them (for example with automated
            requests or scraping);
          </li>
          <li>submit false, misleading or someone else&rsquo;s information, or impersonate another person;</li>
          <li>use the services to harass, threaten or harm anyone, or to send unsolicited messages; or</li>
          <li>copy, alter or reuse photos of our pupils, staff or premises.</li>
        </ul>
        <p>
          Misuse of computer systems may also be an offence under the Cybercrimes (Prohibition, Prevention, etc.) Act and
          other Nigerian laws, and we may report it to the relevant authorities.
        </p>

        <h2 id="admissions">3. Enquiries and admissions applications</h2>
        <ul>
          <li>
            Please make sure the information you give us is true, complete and up to date. If we later find that
            information was materially false, we may withdraw an offer or review a child&rsquo;s place.
          </li>
          <li>
            Submitting an enquiry or application does <strong>not</strong> guarantee a place. Admission depends on the
            school&rsquo;s admissions process, which may include an assessment or interview, availability in the class
            applied for, and the school&rsquo;s decision.
          </li>
          <li>
            An application can be saved and finished later using a private resume link. Anyone with the link can open the
            application, so keep it private.
          </li>
          <li>
            Applicants for jobs must only upload their own CV and accurate information. We will contact shortlisted
            candidates.
          </li>
        </ul>

        <h2 id="accounts">4. Portal and staff accounts</h2>
        <ul>
          <li>
            Portal accounts are created by the school for enrolled pupils and their parents or guardians, and staff
            accounts for our employees. Each account is personal to its holder.
          </li>
          <li>
            Keep your password and any sign-in links confidential, and do not let anyone else use your account. Pupils
            must not share passwords with classmates. You are responsible for activity on your account unless it results
            from our failure to keep the services secure.
          </li>
          <li>
            Tell the school office straight away if you think someone else has accessed your account, so we can secure
            it.
          </li>
          <li>
            Only access information you are entitled to see. Parents can see information about the children linked to
            their account; staff may only access records needed for their role.
          </li>
        </ul>

        <h2 id="exams">5. Online exams (CBT)</h2>
        <p>Pupils taking computer-based tests must follow these rules, which keep exams fair for everyone:</p>
        <ul>
          <li>Sit the exam yourself, without help from other people, notes or other websites unless your teacher allows it.</li>
          <li>
            Stay on the exam page until you submit. Leaving the page, switching apps or tabs, or minimising the window
            locks the attempt, and an exam conductor must review and unlock it.
          </li>
          <li>Enter any exam code only when told to by the exam conductor, and do not share it.</li>
          <li>
            Each exam has a time limit set by the school. Exams are only available on the dates set for your class.
          </li>
          <li>Once you submit, your answers are final.</li>
          <li>
            If something goes wrong (for example a power or internet failure), tell the exam conductor or your teacher
            immediately.
          </li>
        </ul>
        <p>
          Breaking these rules or any other exam malpractice is dealt with under the school&rsquo;s disciplinary
          policies and may lead to the attempt being cancelled.
        </p>

        <h2 id="records">6. Results and school records</h2>
        <p>
          Results and records on the portal are made available for your information once the school releases them. The
          official record is the one held and issued by the school, such as signed report cards. If you think something
          is wrong, please tell your child&rsquo;s class teacher or the school office so it can be checked and corrected.
        </p>

        <h2 id="fees">7. Fees and payments</h2>
        <ul>
          <li>
            School fees and other charges are set out in the invoices and fee schedules we issue to parents and
            guardians, and are payable by the due date shown.
          </li>
          <li>
            Fees can be paid by the methods we make available, such as bank transfer, POS, payment at the school office or
            online through our payment provider. Always use the reference we give you and keep your receipt or proof of
            payment.
          </li>
          <li>
            Online payments are processed by our payment provider under its own terms. A payment is reflected on your
            account once it has been received and confirmed.
          </li>
          <li>
            Any refunds, discounts or arrangements for withdrawal are governed by the school&rsquo;s fees policy
            communicated at admission or in writing by the school.
          </li>
          <li>
            If you believe a payment has been recorded incorrectly, contact the school office with your proof of payment
            as soon as possible and we will investigate.
          </li>
        </ul>

        <h2 id="communications">8. How we communicate with you</h2>
        <p>
          We will contact parents and guardians about their children and school matters by phone, SMS, WhatsApp, email,
          the portal and the communication book. Please keep your contact details up to date with the school office. We
          will only send you marketing messages with your consent, and you can opt out at any time.
        </p>

        <h2 id="content">9. Our content and your content</h2>
        <p>
          The website, portal and their content — including text, logos, photographs, graphics, exam questions and
          software — belong to Greenfield School or our licensors. You may view and print pages for personal use, but you
          may not copy, publish or distribute them, and exam questions may not be copied or shared in any form.
        </p>
        <p>
          When you send us information (such as an application, CV or message), you allow us to use it for the purpose
          you sent it for, as explained in our <Link href="/privacy">Privacy policy</Link>.
        </p>

        <h2 id="third-parties">10. Third-party services and links</h2>
        <p>
          Our services may link to or rely on services run by others, such as WhatsApp or our payment provider. We are not
          responsible for their content or how they operate, and their own terms and privacy policies apply.
        </p>

        <h2 id="availability">11. Availability of the service</h2>
        <p>
          We work hard to keep the services available and accurate, but we cannot promise they will always be
          uninterrupted or error-free — for example during maintenance or if an internet or power provider fails. We may
          change, improve or withdraw features from time to time. Where an outage affects an exam, the school will decide
          on a fair way forward, such as rescheduling.
        </p>

        <h2 id="liability">12. Our responsibility to you</h2>
        <p>
          Nothing in these terms limits any rights you have under Nigerian law that cannot be limited, including under
          the Federal Competition and Consumer Protection Act 2018 and the Nigeria Data Protection Act 2023, or our
          liability for death or personal injury caused by our negligence, or for fraud.
        </p>
        <p>
          Subject to that, we are not responsible for loss that was not reasonably foreseeable, for loss caused by events
          outside our reasonable control, or for loss caused by your failure to follow these terms (for example sharing
          your password). Our responsibilities for your child&rsquo;s education and care are those set out in the
          admission documents and school policies.
        </p>

        <h2 id="suspension">13. Suspending or closing accounts</h2>
        <p>
          We may suspend or close an account, or restrict access to the services, if these terms are broken, to protect
          the security of the services or other users, or when a pupil leaves the school or a parent no longer has a
          child at Greenfield. Where reasonable we will tell you first and explain why.
        </p>

        <h2 id="law">14. Governing law and disputes</h2>
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria and, where applicable, the laws of Lagos
          State. If you have a concern, please contact us first so we can try to resolve it. If we cannot resolve a
          dispute between us, either of us may refer it to mediation (for example at the Lagos Multi-Door Courthouse)
          before going to court, and the courts of Lagos State will have jurisdiction. This does not affect your right to
          complain to a regulator such as the Nigeria Data Protection Commission.
        </p>

        <h2 id="changes">15. Changes and contact</h2>
        <p>
          We may update these terms from time to time; the &ldquo;last updated&rdquo; date above shows when they last
          changed, and we will tell parents about important changes through the portal or our usual channels.
          Continuing to use the services after a change means you accept the updated terms.
        </p>
        <p>
          Questions about these terms? Contact us at <a href={`mailto:${school.email}`}>{school.email}</a>, call{" "}
          <a href={`tel:${school.phone}`}>{school.phone}</a>, or visit the school office at {school.address}.
        </p>
      </LegalArticle>
    </div>
  );
}
