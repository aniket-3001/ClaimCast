import type { BillLine, Hospital, Procedure, RoomClass } from "./types";
import type { Paise } from "./money";

export const ROOM_LABEL: Record<RoomClass, string> = {
  general: "General ward",
  semi_private: "Semi-private",
  private: "Private",
  deluxe: "Deluxe",
  suite: "Suite",
  icu: "Intensive care",
};

export const tariff = (h: Hospital, cls: RoomClass): Paise | null =>
  h.rooms.find((r) => r.cls === cls)?.perDay ?? null;

/**
 * Assemble the bill a hospital would actually print.
 *
 * The forecast has to classify before it can adjudicate, so the bill is built
 * line by line from the procedure's cost model rather than pulled out as a
 * total. Only the room line changes when the room class changes: the surgeon
 * charges the same fee either way. That the patient's share moves anyway is
 * the point being demonstrated.
 */
export function buildBill(args: {
  procedure: Procedure;
  hospital: Hospital;
  roomClass: RoomClass;
  days: number;
  icuDays?: number;
  /** Pre-hospitalisation spend the policy window will not reach. */
  includeOutsideWindow?: boolean;
}): BillLine[] {
  const { procedure: p, hospital: h, roomClass, days } = args;
  const c = p.costs;
  const icuDays = args.icuDays ?? 0;
  const wardDays = Math.max(0, days - icuDays);
  const lines: BillLine[] = [];

  const perDay = tariff(h, roomClass) ?? 0;
  if (wardDays > 0) {
    lines.push({
      id: "room",
      label: `Room rent \u2014 ${ROOM_LABEL[roomClass].toLowerCase()}, ${wardDays} ${wardDays === 1 ? "day" : "days"}`,
      kind: "room",
      amount: perDay * wardDays,
      days: wardDays,
      perDay,
    });
  }

  if (icuDays > 0) {
    const icuRate = tariff(h, "icu") ?? c.icuPerDay ?? 0;
    lines.push({
      id: "icu",
      label: `Intensive care, ${icuDays} ${icuDays === 1 ? "day" : "days"}`,
      kind: "icu",
      amount: icuRate * icuDays,
      days: icuDays,
      perDay: icuRate,
    });
  }

  // Surgeon, theatre and anaesthesia are one negotiated block in practice. Split
  // for legibility, with the remainder landing on the last line so the three
  // still sum to the block exactly.
  if (c.surgical > 0) {
    const surgeon = Math.round(c.surgical * 0.65);
    const theatre = Math.round(c.surgical * 0.22);
    lines.push({ id: "surgeon", label: "Surgeon's fee", kind: "associated", amount: surgeon });
    lines.push({ id: "ot", label: "Operation theatre", kind: "associated", amount: theatre });
    lines.push({
      id: "anaes",
      label: "Anaesthetist",
      kind: "associated",
      amount: c.surgical - surgeon - theatre,
    });
  }

  if (c.nursingPerDay > 0 && days > 0) {
    lines.push({
      id: "nursing",
      label: "In-patient nursing",
      kind: "associated",
      amount: c.nursingPerDay * days,
      days,
      perDay: c.nursingPerDay,
    });
  }

  if (c.diagnostics > 0) {
    lines.push({
      id: "diag",
      label: "Investigations and imaging",
      kind: "independent",
      amount: c.diagnostics,
    });
  }

  if (c.pharmacyPerDay > 0 && days > 0) {
    lines.push({
      id: "pharm",
      label: "Pharmacy and consumables",
      kind: "independent",
      amount: c.pharmacyPerDay * days,
      days,
      perDay: c.pharmacyPerDay,
    });
  }

  if (c.implant) {
    lines.push({ id: "implant", label: "Implant", kind: "implant", amount: c.implant });
  }

  if (c.otherIndependent > 0) {
    lines.push({
      id: "other",
      label: "Physiotherapy and other services",
      kind: "independent",
      amount: c.otherIndependent,
    });
  }

  if (args.includeOutsideWindow && c.outsideWindow > 0) {
    lines.push({
      id: "prehosp",
      label: "Pre-hospitalisation tests",
      kind: "outside_window",
      amount: c.outsideWindow,
      note: "Done 42 days before admission. The policy window is 30 days.",
    });
  }

  const nonPayable = c.nonPayableFixed + c.nonPayablePerDay * days;
  if (nonPayable > 0) {
    lines.push({
      id: "listi",
      label: "Non-medical items (IRDAI List I)",
      kind: "non_payable",
      amount: nonPayable,
      note: "Registration, documentation, toiletries, attendant meals, television.",
    });
  }

  return lines;
}
