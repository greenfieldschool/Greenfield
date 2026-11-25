// "Works until …" dates for school-given temporary passwords. A plain module (not "use client"), so server pages
// and client components can both call it. Calling a function exported from a "use client" file on the server
// crashes the page at runtime ("Application error"), which happened on the learner and parent pages (25 Nov 2026).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last day a temporary password works, in Lagos time, e.g. "18 Dec 2026". */
export function untilLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "numeric", year: "numeric" })
    .formatToParts(new Date(new Date(iso).getTime() - 1000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return `${get("day")} ${MONTHS[get("month") - 1]} ${get("year")}`;
}
