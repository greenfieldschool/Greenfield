// Search text typed by users is interpolated into PostgREST filter strings such as
// `.or(\`name.ilike.%${q}%,email.ilike.%${q}%\`)`. Commas, parentheses, quotes, backslashes and the
// `*`/`%` wildcards would change the meaning of that filter, so strip them before interpolating.
export function safeFilterTerm(input: string, maxLength = 80): string {
  return input
    .replace(/[,()"'\\*%:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
