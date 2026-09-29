/**
 * Which CGHS code each ClaimCast procedure is priced against.
 *
 * The rates themselves are published and come out of `etl/out/cghs-rates.json`
 * untouched. This file is the other half, and it is not published: deciding
 * that "Laparoscopic cholecystectomy" is CGHS AG037 is a clinical-coding
 * judgement ClaimCast is making, and it is kept here, separately, so the two
 * kinds of claim never blur together. A wrong rate would be the government's
 * error. A wrong mapping is ours.
 *
 * Three procedures have no entry at all, and that is the finding rather than a
 * gap to fill. CGHS rates procedures; community-acquired pneumonia, septic
 * shock and an overnight observation for gastroenteritis are medical
 * management, which the scheme pays as ward and investigation charges instead.
 * Inventing a package code for them would put a number under a government
 * source that the government never wrote.
 */

export interface CghsMapping {
  /** The CGHS code from Annexure I. */
  code: string;
  /** Why this code, where the choice was not the obvious one. */
  note?: string;
}

export const CGHS_MAP: Record<string, CghsMapping> = {
  "p-spine-fusion": {
    code: "NS036",
    note: "Generic 'Spinal Fusion Procedure'. OR118 is priced for more than two levels; ours is single-level.",
  },
  "p-cabg": { code: "CV013" },
  "p-angioplasty": {
    code: "CP001",
    note: "Balloon coronary angioplasty / PTCA. The stent itself is priced separately, as the implant line.",
  },
  "p-tkr": {
    code: "OR089",
    note:
      "OR089 is Total Knee Joint Replacement, UNILATERAL, and the ClaimCast procedure is bilateral. " +
      "CGHS publishes no bilateral package, so this rate is a per-knee reference point and is lower " +
      "than what the modelled admission actually costs. It must not be read as the tariff for this stay.",
  },
  "p-ankle-orif": {
    code: "OR041",
    note:
      "Open reduction of a long-bone fracture of the lower limb, AO procedures: plate-and-screw " +
      "fixation of a malleolar fracture is an AO procedure on the distal tibia and fibula. CGHS " +
      "publishes no ankle-specific fixation package.",
  },
  "p-chole": { code: "AG037" },
  "p-appendix": { code: "AG045" },
  "p-csection": { code: "OG004" },
  "p-delivery": {
    code: "OG002",
    note: "Normal delivery with or without episiotomy. OG003 is the high-risk variant.",
  },
  "p-cataract": {
    code: "OP100",
    note: "Phacoemulsification with a foldable IOL, the routine modern technique.",
  },
  "p-chemo": {
    code: "CT002",
    note: "Multiple-drug chemotherapy, per cycle. CGHS prices single-drug (CT001) lower.",
  },
  "p-dialysis": {
    code: "NU122",
    note: "Haemodialysis, sero-negative, per session.",
  },
};
