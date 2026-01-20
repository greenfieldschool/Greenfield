# Greenfield School Website — Tech Stack

## Overview
This project will use:
- Next.js for the website application (frontend + backend routes)
- Supabase for database, authentication (if needed), storage, and serverless APIs
- Vercel for hosting, preview deployments, and CI/CD

## Next.js
### Why Next.js
- Strong performance (SSR/SSG/ISR options)
- Great SEO defaults and metadata support
- Excellent developer experience with TypeScript
- Works cleanly with Vercel deployments

### How we’ll use it
- App Router structure (pages + layouts)
- Server Components by default, Client Components only where needed (animations, complex UI)
- Route Handlers for:
  - Contact/inquiry form submissions
  - Visit booking submissions
  - Webhooks (optional)

### UI + Styling
- Tailwind CSS for styling
- Component system (e.g., shadcn/ui) for consistent, accessible UI
- Framer Motion for subtle animations (kept performance-friendly)

## Supabase
### What Supabase provides
- Postgres database (structured content and submissions)
- Storage (images, gallery assets) if needed
- Auth (optional) for an admin portal or protected pages
- Row Level Security (RLS) for safe access control

### Recommended data domains
- Forms:
  - Inquiries
  - Visit requests
- Content (if not using a separate CMS):
  - News posts
  - Events
  - Gallery items

### Security model
- Use environment variables for Supabase keys.
- Public read for public content (if applicable) with RLS rules.
- Write operations (forms) routed through Next.js server routes to validate and reduce abuse.

## Vercel
### Why Vercel
- First-class hosting for Next.js
- Automatic preview deployments per branch/PR
- Global CDN and edge optimization

### How we’ll deploy
- Preview deployments for every change
- Production deployment from `main`
- Environment variables set in Vercel dashboard

## Environment Variables (High Level)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Optional server-only secrets:
  - `SUPABASE_SERVICE_ROLE_KEY` (only if absolutely necessary; never exposed to the client)

## Observability & Quality
- Performance: Core Web Vitals monitoring in Vercel
- Error tracking: optional (Sentry) if needed
- Analytics: Plausible or GA4 (based on preference)

## Notes / Options
- If you want non-technical staff to edit website content frequently, consider adding a dedicated CMS. Supabase can work as a content store, but editorial tooling may be better with a headless CMS.
