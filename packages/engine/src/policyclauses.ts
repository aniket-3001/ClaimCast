import type { Paise } from "./money";
import type { ProcedureCap } from "./types";
import { procedureFor } from "./procedurewords";

/**
 * The two clauses in a policy's wording that cut a claim without being one of the
 * limits in its schedule, and the small amount of reading they need.
 *
 * **A limit on the whole admission for a named procedure.** Usually an annexure: "total
 * knee replacement, per knee, Rs 1,50,000". It caps room, fees, implant and medicines
 * *together*, so it is not the implant sub-limit and not the room limit, and a bill can
 * clear both of those and still be cut by this.
 *
 * **A reduced settlement outside the insurer's network.** The claim is paid at a stated
 * share of the admissible amount when the hospital is not on the cashless network.
 *
 * Both are applied by `adjudicate()` as deductions of their own, so each shows up in the
 * working with its amount, its reason and its clause, like every other rupee refused.
 */

/**
 * How many sides a procedure is priced for. "Per knee" on a bilateral replacement is two
 * limits, and reading it as one would refuse money the policy does pay. Only the procedures
 * whose own name says both sides are listed; everything else is one.
 */
export const SIDES: Record<string, number> = { "p-tkr": 2 };

/** What the policy will pay for the whole admission, in paise. */
export function procedureLimit(cap: ProcedureCap): Paise {
  return cap.per === "side" ? cap.amount * (SIDES[cap.procedureId] ?? 1) : cap.amount;
}

/**
 * Lines as a schedule is read back from a PDF, into limits the engine can apply.
 *
 *     Total knee replacement: 150000 per knee; Cataract surgery: 30000 per eye
 *
 * Rupees, because this text is shown to a person to confirm or correct, and nobody checks a
 * limit written in paise. A line that names no operation we price is dropped rather than
 * guessed at: a hernia limit on a policy has no effect on a bill for a procedure we do not
 * price, and inventing a home for it would be worse than leaving it out.
 */
export function parseProcedureCaps(text: string | null | undefined, procedures: { id: string }[]): ProcedureCap[] | null {
  if (!text) return null;
  const out: ProcedureCap[] = [];
  for (const part of text.split(/[;\n]+/)) {
    const num = part.match(/(?:\u20b9|rs\.?|inr)?\s*([\d][\d,]*(?:\.\d+)?)/i);
    if (!num) continue;
    const name = part.slice(0, num.index ?? 0);
    const id = procedureFor(name, procedures);
    const rupees = Number(num[1].replace(/,/g, ""));
    if (!id || !Number.isFinite(rupees) || rupees <= 0) continue;
    const per = /\bper\s+(knee|eye|side|limb|joint|leg|hip|ear)\b/i.test(part) ? "side" : "admission";
    if (out.some((c) => c.procedureId === id)) continue;
    out.push({ procedureId: id, amount: Math.round(rupees * 100), per });
  }
  return out.length ? out : null;
}
