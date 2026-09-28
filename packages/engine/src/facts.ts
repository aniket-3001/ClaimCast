import type { Policy } from "./types";
import { fmt, type Paise } from "./money";
import { ROOM_LABEL } from "./bill";
import { fixedRegardless, gate, journey, schemeOptions, type Evaluated } from "./case";
import { registry, setRegistry } from "./registry";

/**
 * One thing the engine knows about this admission, written as a sentence.
 *
 * This is what the chat is allowed to say about money. A model is handed these
 * and asked to phrase them; it is never asked to work a figure out. Every rupee
 * amount a fact states is also listed in `amounts`, so that an answer can be
 * checked afterwards: a figure in the reply that is in no fact and in no quote
 * from the policy is one the model made up, and it is flagged rather than shown
 * as though the engine had said it.
 */
export interface Fact {
  id: string;
  text: string;
  /** The clause the fact rests on, where one does. */
  clause: string | null;
  amounts: Paise[];
}

/**
 * Everything the screens show about an admission, as numbered facts.
 *
 * The order follows the page: the outcome first, then the gate, the bill's
 * deductions, the choices still open with what each would cost, the schemes,
 * and what no choice moves. Ids are stable within one evaluation and short, so
 * a model can cite them without copying sentences back.
 */
export function caseFacts(e: Evaluated): Fact[] {
  const { clauses } = registry();
  const cite = (id: string | null) => (id && clauses[id] ? clauses[id].cite : null);
  const r = e.result;
  const out: Fact[] = [];
  let n = 0;
  const add = (text: string, clause: string | null, amounts: Paise[]) =>
    out.push({ id: "F" + ++n, text, clause, amounts });

  add(
    `The admission: ${e.procedure.name} at ${e.hospital.name}, ${e.hospital.city}, ` +
      `${e.input.days} ${e.input.days === 1 ? "night" : "nights"}` +
      (e.input.icuDays ? ` (${e.input.icuDays} in intensive care)` : "") +
      `, in a ${ROOM_LABEL[e.input.roomClass].toLowerCase()} room, claimed ${e.input.route}.`,
    null,
    [],
  );
  add(
    `The policy: ${e.policy.product} from ${e.policy.insurer}, sum insured ${fmt(e.policy.sumInsured)}` +
      (r.roomCapPerDay !== null ? `, room rent limit ${fmt(r.roomCapPerDay)} a day` : ", no room rent limit") +
      (e.policy.copayPct ? `, co-payment ${Math.round(e.policy.copayPct * 100)}%` : ", no co-payment") +
      (e.policy.implantSubLimit !== null ? `, implant sub-limit ${fmt(e.policy.implantSubLimit)}` : "") +
      `, ${e.policy.monthsInForce} months in force against a ${e.policy.pedWaitingMonths}-month pre-existing disease waiting period.`,
    null,
    [e.policy.sumInsured, ...(r.roomCapPerDay !== null ? [r.roomCapPerDay] : []), ...(e.policy.implantSubLimit !== null ? [e.policy.implantSubLimit] : [])],
  );
  if (e.policy.exclusions) {
    add(`The policy's exclusions, as confirmed from the schedule: ${e.policy.exclusions}.`, null, []);
  }
  add(
    `As things stand the bill is ${fmt(r.billTotal)}; the insurer pays ${fmt(r.insurerPays)} and the family pays ${fmt(r.patientPays)}.`,
    null,
    [r.billTotal, r.insurerPays, r.patientPays],
  );

  const g = gate(e);
  add(`${g.question} ${g.passed ? "Yes" : "No"} -- ${g.test}. ${g.detail}`, g.clause, []);

  for (const d of r.deductions) {
    add(`${fmt(d.amount)} of "${d.line}" is refused: ${d.reason}`, d.clause, [d.amount]);
  }
  if (r.deductions.length) {
    add(`Deductions total ${fmt(r.deductionTotal)}, leaving ${fmt(r.admissible)} admissible.`, null, [r.deductionTotal, r.admissible]);
  }
  if (r.copay) add(`The co-payment takes ${fmt(r.copay)} of the admissible amount.`, "COPAY", [r.copay]);
  if (r.siShortfall) add(`${fmt(r.siShortfall)} is above what is left of the sum insured.`, "SUM_INSURED", [r.siShortfall]);
  for (const note of r.notes) add(note, null, []);

  if (g.passed) {
    for (const s of journey(e)) {
      const lead = `${s.phase}, "${s.question}" (${s.mechanic})`;
      if (s.settled) add(`${lead}: ${s.settled}`, s.clause, []);
      for (const b of s.branches) {
        const tail = b.blocked
          ? `not available: ${b.blocked}`
          : `the family pays ${fmt(b.patientPays)}` +
            (b.chosen ? " (the path currently taken)" : b.delta ? ` (${b.delta < 0 ? fmt(-b.delta) + " less" : fmt(b.delta) + " more"} than now)` : " (the same as now)") +
            (b.upfront !== undefined ? `, with ${fmt(b.upfront)} to find on the day` : "");
        add(`${lead}: ${b.label} -- ${b.note}; ${tail}.`, s.clause, [
          b.patientPays,
          ...(b.delta ? [Math.abs(b.delta)] : []),
          ...(b.upfront !== undefined ? [b.upfront] : []),
        ]);
      }
    }
    const fixed = fixedRegardless(e);
    for (const f of fixed) {
      add(`Refused whichever path is taken: ${f.label}, ${fmt(f.amount)}.`, f.clause, [f.amount]);
    }
  }

  for (const s of schemeOptions(e)) {
    if (s.id === "private") continue;
    add(
      `${s.label}: ${s.eligible ? "open to this family" : "not open -- " + (s.reason ?? "not eligible")}. ${s.detail}` +
        (s.patientPays !== null && s.eligible ? ` The family would pay ${fmt(s.patientPays)}.` : ""),
      s.clause,
      [...(s.packageRate !== null ? [s.packageRate] : []), ...(s.patientPays !== null ? [s.patientPays] : [])],
    );
  }

  return out.map((f) => ({ ...f, text: f.text + (cite(f.clause) ? ` [${cite(f.clause)}]` : "") }));
}

/**
 * Run `fn` with one extra policy installed, then put the registry back.
 *
 * For a policy that exists only in the request -- one a user uploaded and
 * confirmed, which lives in their browser rather than the database. Safe on a
 * server only because `fn` is synchronous: nothing else can run between the
 * install and the restore.
 */
export function withPolicy<T>(policy: Policy, fn: () => T): T {
  const prev = registry();
  setRegistry({ ...prev, policies: [...prev.policies.filter((p) => p.id !== policy.id), policy] });
  try {
    return fn();
  } finally {
    setRegistry(prev);
  }
}
