"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { disciplineError, ordinal } from "@/lib/discipline";

// Discipline ladder actions. Every rule is checked again in the database (20261123_discipline_ladder.sql).

const PATH = "/admin/welfare/discipline";

function backTo(fd: FormData) {
  const b = String(fd.get("back") ?? "");
  return b.startsWith(PATH) ? b : PATH;
}

function go(url: string, message: string, type: "success" | "error" = "success"): never {
  const [path, hash] = url.split("#");
  redirect(`${path}${path.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}&toast_type=${type}${hash ? `#${hash}` : ""}`);
}

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/admin/welfare/scores");
  revalidatePath("/portal/discipline");
}

export async function recordCaseAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const { data, error } = await supabase!.rpc("record_discipline_case", {
    p_student: String(fd.get("student_id") ?? "") || null,
    p_rule: String(fd.get("rule_id") ?? "") || null,
    p_occurred_on: String(fd.get("occurred_on") ?? "") || null,
    p_description: String(fd.get("description") ?? ""),
    p_severity: Number(fd.get("severity") ?? 1),
    p_correction: String(fd.get("correction") ?? "") || null,
    p_statement: String(fd.get("statement") ?? "") || null
  });
  if (error) go(back, disciplineError(error.message), "error");
  refresh();
  const row = (Array.isArray(data) ? data[0] : data) as { occurrence: number; step: number } | null;
  go(
    back,
    row
      ? row.step === 4
        ? `Saved: the ${ordinal(row.occurrence)} time. It now waits for the disciplinary committee. Parents have been told.`
        : `Saved: the ${ordinal(row.occurrence)} time for this rule. Parents have been told.`
      : "Saved."
  );
}

export async function saveStatementAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const { error } = await supabase!.rpc("save_discipline_statement", {
    p_record: String(fd.get("record_id") ?? ""),
    p_statement: String(fd.get("statement") ?? "")
  });
  if (error) go(back, disciplineError(error.message), "error");
  refresh();
  go(back, "Written statement saved.");
}

export async function committeeDecisionAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const days = String(fd.get("days") ?? "").trim();
  const { error } = await supabase!.rpc("record_committee_decision", {
    p_record: String(fd.get("record_id") ?? ""),
    p_outcome: String(fd.get("outcome") ?? "") || null,
    p_days: days ? Number(days) : null,
    p_parent_meeting_on: String(fd.get("parent_meeting_on") ?? "") || null,
    p_note: String(fd.get("note") ?? "") || null,
    p_pupil_explanation: String(fd.get("pupil_explanation") ?? "")
  });
  if (error) go(back, disciplineError(error.message), "error");
  refresh();
  go(back, "Committee decision saved. The parents have been asked to come in.");
}

export async function withdrawRecordAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const { error } = await supabase!.rpc("withdraw_discipline_record", {
    p_record: String(fd.get("record_id") ?? ""),
    p_reason: String(fd.get("reason") ?? "") || null,
    p_note: String(fd.get("note") ?? "") || null
  });
  if (error) go(back, disciplineError(error.message), "error");
  refresh();
  go(back, "Record withdrawn. It no longer counts, and a copy is kept for admins.");
}

// Rules (admins; RLS allows only admins to add or change them).
export async function saveRuleAction(fd: FormData) {
  const back = "/admin/welfare/discipline/rules";
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const id = String(fd.get("id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const ladder = String(fd.get("ladder") ?? "steps");
  const position = Number(fd.get("position") ?? 100);
  if (name.length < 3) go(back, "Give the rule a name (3 characters or more).", "error");
  if (!["steps", "useful_work_first", "committee"].includes(ladder)) go(back, "Choose how the ladder applies.", "error");
  const values = { name, description, ladder, position: Number.isFinite(position) ? position : 100 };
  const { error, data } = id
    ? await supabase!.from("discipline_rules").update(values).eq("id", id).select("id")
    : await supabase!.from("discipline_rules").insert(values).select("id");
  if (error) go(back, /duplicate|unique/i.test(error.message) ? "There is already a rule with that name." : disciplineError(error.message), "error");
  if (!data?.length) go(back, "Only admins can change the rules.", "error");
  revalidatePath(back);
  revalidatePath(PATH);
  go(back, id ? "Rule saved." : "Rule added.");
}

export async function setRuleActiveAction(fd: FormData) {
  const back = "/admin/welfare/discipline/rules";
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const active = String(fd.get("active") ?? "") === "yes";
  const { error, data } = await supabase!.from("discipline_rules").update({ active }).eq("id", String(fd.get("id") ?? "")).select("id");
  if (error) go(back, disciplineError(error.message), "error");
  if (!data?.length) go(back, "Only admins can change the rules.", "error");
  revalidatePath(back);
  revalidatePath(PATH);
  go(back, active ? "Rule back in use." : "Rule retired. Its past cases still count.");
}
