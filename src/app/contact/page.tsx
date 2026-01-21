import { InquiryForm } from "@/components/inquiry-form";
import { school } from "@/lib/school";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Contact</h1>
          <p className="mt-4 text-slate-600">
            Request information, book a visit, or ask a question. We’ll respond as soon as possible.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <div>
              <span className="font-semibold text-slate-900">Email:</span> {school.email}
            </div>
            <div className="mt-2">
              <span className="font-semibold text-slate-900">Phone:</span> {school.phone}
            </div>
            <div className="mt-2">
              <span className="font-semibold text-slate-900">Address:</span> {school.address}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8">
          <div className="text-sm font-semibold text-slate-900">Send an inquiry</div>
          <div className="mt-4">
            <InquiryForm />
          </div>
        </div>
      </div>
    </div>
  );
}
