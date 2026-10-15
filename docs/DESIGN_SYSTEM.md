# Greenfield design system

Refined Greenfield brand: deep green + gold, warm off-white canvas, Plus Jakarta Sans for UI text,
Fraunces (serif, `font-display`) for public-site headlines and portal greetings.

## Tokens (tailwind.config.ts)

- `brand-green` (DEFAULT `#0B3D2E`) with a 50–950 scale, e.g. `bg-brand-green-50`, `text-brand-green-700`.
- `brand-gold` (DEFAULT `#D4A017`) with a 50–900 scale.
- `bg-canvas` (`#F6F7F4`) is the page background in admin and portal.
- `shadow-card` for resting cards, `shadow-lift` for hover/emphasis.
- Neutrals: Tailwind `slate`. Body text `text-slate-700`, secondary `text-slate-500`, headings `text-slate-900`.
- Radius: cards `rounded-2xl`, buttons/inputs `rounded-xl`, pills `rounded-full`.
- Icons: `lucide-react` only (`h-4 w-4` inline, `h-5 w-5` in buttons/tiles), always `aria-hidden="true"`.
  Do not hand-write `<svg>` paths for icons.

## Components (`src/components/ui/*`)

| Import | Use for |
| --- | --- |
| `PageHeader` (`page-header`) | Top of every admin/portal page: `eyebrow`, `title`, `description`, `actions`, optional `back={{ href, label }}`. Replaces the old "rounded-3xl card with grey label + h1" header. |
| `Card`, `CardHeader`, `CardBody` (`card`) | Any boxed content. Lists/tables sit directly in a `Card` (no inner padding) under a `CardHeader`. |
| `FormSection`, `Field` (`form-section`) | Forms: one `FormSection` per logical group with an optional `footer` holding the submit button. `Field` = label + control + hint. |
| `StatCard` (`stat-card`) | Metric tiles (label, value, hint, lucide icon, tone, optional href). |
| `Badge` (`badge`) | Status pills. Tones: green (good/active/paid), gold (pending/draft/warning), red (failed/overdue/withdrawn), blue (info), slate (neutral/inactive), violet. |
| `Alert` (`alert`) | Inline messages: info / success / warning / danger, optional title + action. |
| `EmptyState` (`empty-state`) | "Nothing here yet" inside cards and tables, with icon, title, description, optional action. |
| `LinkTabs` (`tabs`) | URL-driven tabs/filters. |
| `Avatar` (`avatar`) | Initials or photo. |
| `Button`, `ButtonLink`, `buttonClasses()` (`button`) | Variants: `primary` (green), `secondary` (white/border), `ghost`, `gold` (public CTAs), `danger`, `inverse` (on dark). Sizes `sm`/`md`/`lg`. |
| `SubmitButton` (`@/components/submit-button`) | Form submit with pending state. Prefer `<SubmitButton variant="primary" pendingText="Saving…">`; `className` still works. |
| `ConfirmSubmitButton` | Destructive submits needing a confirm dialog — style with `buttonClasses({ variant: "danger" \| "secondary", size: "sm" })`. |
| `PublicPageHero`, `SectionHeading`, `PublicSection` (`public-page`) | Public inner pages. |
| `Logo`, `LogoMark` (`logo`) | Brand lockup. |

## CSS helpers (`globals.css`)

- Inputs: `gf-input` (text/number/date/textarea), `gf-select` (selects), `gf-checkbox`, `gf-label`, `gf-hint`.
- Tables: `<Card><div className="gf-table-wrap"><table className="gf-table">…` — header cells and rows are
  styled automatically. Prefer real `<table>` over 12-column div grids for tabular data; keep a
  `min-w-[…]` on the table when it has many columns so phones scroll horizontally instead of squashing.
- Links in text/tables: `gf-link`.

## Page patterns

- Admin/portal page = `<div className="space-y-6">` → `PageHeader` → (filters in a `Card` with `CardBody`)
  → stats row (`grid gap-4 sm:grid-cols-2 xl:grid-cols-4`) → content cards.
- Forms: two-column grid on `sm` (`grid gap-4 sm:grid-cols-2`), full-width textareas, primary action
  bottom-right in the `FormSection` footer, destructive actions in a separate "Danger zone" `FormSection`.
- Use `Badge` for any status text (`active`, `draft`, `paid`, `void`, `submitted`, …) instead of raw words.
- Money: `₦` + `toLocaleString("en-NG")`. Dates: `en-GB` style ("14 Oct 2026"), Lagos time for dates
  shown to users (`formatLagosDate` in `@/lib/lagos-dates`).
- Keep copy short and human: sentence case, no ALL-CAPS labels, explain empty states.
- Accessibility: every input has a label (`htmlFor` + `id`), icon-only buttons have `aria-label`,
  colour is never the only signal, focus rings stay visible.

## Engineering rules

- Redesigns are presentation-only: never change queries, server actions, form field `name`s,
  redirects, revalidation, or permissions.
- Inline server actions (`"use server"` inside a component) must only use module-level helpers and
  serialisable values — never call functions declared inside the component body.
- Supabase many-to-one embeds come back as objects: read them with `firstOrNull` from `@/lib/relations`.
