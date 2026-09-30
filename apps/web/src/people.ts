/**
 * The family around an admission: the person using ClaimCast, the patient, and
 * anyone else they add. Each gets a UUID from the server the first time the
 * session is saved, and keeps it on every save after -- so two sons both
 * called Ravi are two different people, never one.
 */

import type { Person, PolicyOwner, SavedPerson } from "@claimcast/contracts";

export type Relation = "husband" | "wife" | "son" | "daughter" | "father" | "mother" | "other";
export const RELATIONS: Relation[] = ["husband", "wife", "son", "daughter", "father", "mother", "other"];
export const RELATION_LABEL: Record<Relation, string> = {
  husband: "Husband",
  wife: "Wife",
  son: "Son",
  daughter: "Daughter",
  father: "Father",
  mother: "Mother",
  other: "Other",
};

export interface Member {
  /** For React lists only; the uid is the identity. */
  key: string;
  uid?: string;
  relation: Relation;
  name: string;
  age: number | null;
}

export interface People {
  selfAge: number | null;
  selfUid?: string;
  patientName: string;
  /** Typed by the family. Null until then, even though the engine prices at a default age. */
  patientAge: number | null;
  patientUid?: string;
  /** Whose policy covers the patient, relative to the patient. */
  policyOwner: PolicyOwner | null;
  family: Member[];
}

export const EMPTY_PEOPLE: People = { selfAge: null, patientName: "", patientAge: null, policyOwner: null, family: [] };

/** Whose policy it is, as the dropdown says it, relative to the patient. */
export const POLICY_OWNER_LABEL: Record<PolicyOwner, string> = {
  self: "The patient’s own",
  father: "Father’s",
  mother: "Mother’s",
  husband: "Husband’s",
  wife: "Wife’s",
  son: "Son’s",
  daughter: "Daughter’s",
  employer: "Employer’s (group policy)",
  other: "Someone else’s",
  none: "Not insured",
};

/**
 * The patient's details are required before anything is saved or the wizard
 * moves on: a name, an age, whose policy it is, and the name on it -- unless
 * the patient is not insured, when there is no name on any policy to give.
 */
export function patientMissing(p: People, policyholder: string): ("name" | "age" | "owner" | "holder")[] {
  const out: ("name" | "age" | "owner" | "holder")[] = [];
  if (!p.patientName.trim()) out.push("name");
  if (p.patientAge === null) out.push("age");
  if (p.policyOwner === null) out.push("owner");
  if (p.policyOwner !== "none" && !policyholder.trim()) out.push("holder");
  return out;
}

let n = 0;
export const newMember = (): Member => ({ key: "m" + ++n + "-" + Date.now(), relation: "wife", name: "", age: null });

/** Everyone, in the order they are saved: you, the patient, then the family. */
export function toPersons(p: People, yourName: string, patientAge: number): Person[] {
  return [
    { role: "self", uid: p.selfUid, relation: null, name: yourName.trim(), age: p.selfAge },
    { role: "patient", uid: p.patientUid, relation: null, name: p.patientName.trim(), age: p.patientAge ?? patientAge },
    ...p.family.map((m) => ({ role: "family" as const, uid: m.uid, relation: m.relation, name: m.name.trim(), age: m.age })),
  ];
}

/** Put the server's UUIDs back on the people they belong to (same order as sent). */
export function withUids(p: People, saved: SavedPerson[]): People {
  const fam = saved.filter((s) => s.role === "family");
  return {
    ...p,
    selfUid: saved.find((s) => s.role === "self")?.uid ?? p.selfUid,
    patientUid: saved.find((s) => s.role === "patient")?.uid ?? p.patientUid,
    family: p.family.map((m, i) => ({ ...m, uid: fam[i]?.uid ?? m.uid })),
  };
}

/** A UUID shortened for the screen; the full one is in the title and the database. */
export const shortId = (uid?: string) => (uid ? uid.slice(0, 8) : "");
