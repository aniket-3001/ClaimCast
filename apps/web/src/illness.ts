/**
 * When did the illness begin, against when the policy began?
 *
 * A policy is recorded with how many months it has been in force, not a start
 * date, so the start is counted back from today. An illness that began before
 * that start is pre-existing: the policy waits `pedWaitingMonths` from its start
 * before covering it. An illness that began after the start is covered like any
 * other.
 */

import type { Policy } from "@claimcast/engine";

export type IllnessCheck =
  | { kind: "none" }
  | { kind: "future" }
  | { kind: "after-start"; start: Date }
  | { kind: "pre-existing"; start: Date; coveredFrom: Date; waitOver: boolean; monthsLeft: number };

const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

export function policyStart(p: Policy, today = new Date()): Date {
  return addMonths(startOfDay(today), -p.monthsInForce);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** `iso` is the date input's value, YYYY-MM-DD, or "". */
export function checkIllness(iso: string, p: Policy, today = new Date()): IllnessCheck {
  if (!iso) return { kind: "none" };
  const began = new Date(iso + "T00:00:00");
  if (Number.isNaN(began.getTime())) return { kind: "none" };
  const now = startOfDay(today);
  if (began > now) return { kind: "future" };
  const start = policyStart(p, today);
  if (began >= start) return { kind: "after-start", start };
  const coveredFrom = addMonths(start, p.pedWaitingMonths);
  const waitOver = coveredFrom <= now;
  const monthsLeft = waitOver ? 0 : Math.max(1, p.pedWaitingMonths - p.monthsInForce);
  return { kind: "pre-existing", start, coveredFrom, waitOver, monthsLeft };
}

export const isPreExisting = (iso: string, p: Policy) => checkIllness(iso, p).kind === "pre-existing";

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const showDate = (d: Date, lang: "en" | "hi") =>
  d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
