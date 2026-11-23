import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatLagosDate } from "@/lib/lagos-dates";
import { PolicyPopup } from "./policy-popup";
import { findSection, isApproved, POLICIES, type PolicyBlock, type PolicyDoc, type PolicyKey, type PolicySection } from "@/lib/policies";

// Shows the school's policies (src/lib/policies). <PolicyDocument> is the whole policy with its contents list;
// <PolicyExcerpt> is one section, shown on the page where the rule applies, with a link to the whole policy.

function PolicyTable({ block }: { block: Extract<PolicyBlock, { kind: "table" }> }) {
  return (
    <div className="space-y-2">
      {/* Phones: one row per item, no sideways scrolling. */}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 sm:hidden print:hidden">
        {block.rows.map((row, i) => (
          <li key={i} className="px-3.5 py-3 text-sm">
            <div className="font-semibold text-slate-900">{row[0]}</div>
            {row.slice(1).map((cell, j) => (
              <div key={j} className="mt-1 text-slate-700">
                <span className="text-slate-500">{block.head[j + 1]}: </span>
                {cell}
              </div>
            ))}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 sm:block print:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {block.head.map((h) => (
                <th key={h} scope="col" className="px-3.5 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {block.rows.map((row, i) => (
              <tr key={i} className="break-inside-avoid align-top">
                {row.map((cell, j) => (
                  <td key={j} className={cn("px-3.5 py-2.5 text-slate-700", j === 0 && "font-medium text-slate-900")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note ? <p className="text-sm text-slate-500">{block.note}</p> : null}
    </div>
  );
}

function Blocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === "text") return <p key={i} className="text-sm leading-relaxed text-slate-700">{b.text}</p>;
        if (b.kind === "table") return <PolicyTable key={i} block={b} />;
        const ListTag = b.kind === "steps" ? "ol" : "ul";
        return (
          <ListTag
            key={i}
            className={cn("space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700", b.kind === "steps" ? "list-decimal" : "list-disc")}
          >
            {b.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

export function PolicyStatus({ doc }: { doc: PolicyDoc }) {
  return isApproved(doc) ? (
    <Badge tone="green">
      Approved by {doc.approvedBy}, {formatLagosDate(doc.approvedOn!)}
    </Badge>
  ) : (
    <Badge tone="gold">Draft, waiting for approval</Badge>
  );
}

export function PolicyDocument({ doc }: { doc: PolicyDoc }) {
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>Version {doc.version}</span>
          <span aria-hidden="true">·</span>
          <span>Review by {formatLagosDate(doc.reviewBy)}</span>
          <PolicyStatus doc={doc} />
        </div>
        <nav aria-label="Contents" className="mt-4 print:hidden">
          <h2 className="text-sm font-semibold text-slate-900">Contents</h2>
          <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {doc.parts.map((part, i) => (
              <li key={part.id}>
                <a href={`#${part.sections[0]?.id ?? part.id}`} className="gf-link">
                  {i + 1}. {part.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Card>

      {doc.parts.map((part, i) => (
        <section key={part.id} aria-labelledby={`part-${part.id}`} className="space-y-3">
          <h2 id={`part-${part.id}`} className="text-lg font-bold text-slate-900">
            {i + 1}. {part.title}
          </h2>
          <Card className="divide-y divide-slate-100">
            {part.sections.map((s, j) => (
              <div key={s.id} id={s.id} className="scroll-mt-24 px-5 py-5 target:bg-brand-gold-50 sm:px-6">
                <h3 className="mb-3 font-semibold text-slate-900">
                  {i + 1}.{j + 1} {s.title}
                </h3>
                <Blocks blocks={s.blocks} />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

/**
 * A "School policy: …" link on the page where a rule applies; it opens that section in a pop-up. In the portal
 * pass `portal`: nothing shows until the policy is approved, the link goes to /portal/policies, and only the
 * families policy can be shown there (never the staff policy).
 */
export function PolicyExcerpt({
  policy,
  section,
  portal = false,
  className
}: {
  policy: PolicyKey;
  section: string;
  portal?: boolean;
  className?: string;
}) {
  if (portal && policy !== "families") return null;
  const doc = POLICIES[policy];
  const s: PolicySection | null = findSection(policy, section);
  if (!s) return null;
  if (portal && !isApproved(doc)) return null;
  const href = portal ? `/portal/policies#${s.id}` : `/admin/policies?doc=${policy}#${s.id}`;
  return (
    <div className={className}>
      <PolicyPopup title={s.title} href={href} draft={!isApproved(doc)}>
        <Blocks blocks={s.blocks} />
      </PolicyPopup>
    </div>
  );
}
