import { redirect } from "next/navigation";

// Redirect back to `path` with an error toast (read by <UrlToast />). Module-level so inline
// server actions can call it.
export function failWithToast(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}toast=${encodeURIComponent(message)}&toast_type=error`);
}

export function successPath(path: string, message: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}toast=${encodeURIComponent(message)}&toast_type=success`;
}

export const NO_DB_MESSAGE = "Database is not configured.";
