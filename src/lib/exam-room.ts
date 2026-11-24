// Words and time maths for running an exam room (docs/migrations/20261124_exam_lockouts_and_time.sql). The database
// decides when an exam locks and how much time is left; these only describe it.

export const UNLOCK_REASONS = {
  power_cut: "Power cut",
  network: "Internet or network problem",
  device: "Device problem (restarted, battery, frozen)",
  left_page: "Left the exam page",
  other: "Another reason (say why)"
} as const;
export type UnlockReason = keyof typeof UNLOCK_REASONS;

/** Why an exam locked, for staff. Older values come from before 24 Nov 2026. */
export function lockReasonLabel(reason: string | null | undefined) {
  switch (reason) {
    case "interrupted":
      return "Cut off (power, network or browser closed)";
    case "left_page":
      return "Away from the exam page 10+ seconds";
    case "blur":
    case "visibility_hidden":
    case "focus_loss":
      return "Left the exam page";
    default:
      return reason ? reason.replace(/_/g, " ") : "Locked";
  }
}

export const TIME_REASONS = {
  late_start: "Started late",
  interruption: "Interruption (power, network, device)",
  access_arrangement: "Agreed extra time for a learner's needs",
  other: "Another reason (say why)"
} as const;
export type TimeReason = keyof typeof TIME_REASONS;

export type AttemptClock = {
  used_seconds: number | null;
  clock_started_at: string | null;
  extra_seconds: number | null;
};

/** Seconds left, the same sum as exam_seconds_left() in the database. Null when there is no time limit. */
export function secondsLeft(a: AttemptClock, durationMinutes: number | null | undefined, now = Date.now()) {
  if (!durationMinutes || durationMinutes <= 0) return null;
  const running = a.clock_started_at ? Math.floor((now - new Date(a.clock_started_at).getTime()) / 1000) : 0;
  return durationMinutes * 60 + Number(a.extra_seconds ?? 0) - Number(a.used_seconds ?? 0) - Math.max(0, running);
}

export function clockText(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Plain message for a database error from the exam room functions. */
export function examRoomError(message: string) {
  if (/could not find the function|does not exist|schema cache/i.test(message)) {
    return "This needs the 24 November 2026 database update. Ask an admin to run it.";
  }
  return message.replace(/^.*?exception:\s*/i, "");
}
