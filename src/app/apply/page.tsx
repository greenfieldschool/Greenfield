import { ApplyWizard } from "./ui";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ApplyPage({ searchParams }: Props) {
  const t = typeof searchParams?.t === "string" ? searchParams.t : "";

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Apply to Greenfield School</h1>
        <p className="mt-4 text-slate-600">
          Start with a quick enquiry (under a minute). You can complete the full application now or resume
          later.
        </p>
      </div>

      <div className="mt-10">
        <ApplyWizard initialToken={t} />
      </div>
    </div>
  );
}
