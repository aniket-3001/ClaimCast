/**
 * Which PM-JAY package code each ClaimCast procedure is priced against.
 *
 * The same split as `cghs-map.ts`, for the same reason. The rates come out of
 * `etl/out/nha-hbp-2022.json` exactly as the National Health Authority printed
 * them; deciding that "Angioplasty with drug-eluting stent" is MC011A is a
 * coding judgement ClaimCast is making, and it lives here so the two never blur.
 * A wrong rate would be the NHA's error. A wrong mapping is ours.
 *
 * Two things about this file are worth reading before trusting a number off it.
 *
 * **PM-JAY prices a medical admission by the day.** Pneumonia, septic shock and
 * the gastroenteritis observation have no package price — they are bed-category
 * grids, and the three procedures CGHS could not price at all are the three the
 * scheme prices best. Those entries are marked `perDay` and seed PER_DAY rows.
 *
 * **One procedure has no mapping, and that is the finding.** The app's
 * "Chemotherapy, one cycle" is generic. HBP 2022 has no generic chemotherapy
 * package: it prices 287 Medical Oncology codes by cancer and by regimen, from
 * ₹4,000 to ₹1,60,000, and choosing one to stand for "a cycle" would be picking
 * a number and attributing it to the NHA.
 */

export interface HbpMapping {
  /** The package code as HBP 2022 prints it. */
  code: string;
  /**
   * `package` seeds one rate per city tier plus the National Reference Price.
   * `perDay` seeds a per-day rate for each bed category the package lists.
   * It must match the pricing shape the parser found, and the seed throws if
   * it does not.
   */
  basis: "package" | "perDay";
  /** Why this code, where the choice was not the obvious one. */
  note?: string;
}

export const HBP_MAP: Record<string, HbpMapping> = {
  "p-spine-fusion": {
    code: "SN034B",
    basis: "package",
    note:
      "Laminectomy with fusion and fixation for lumbar or cervical. SN032A is a corpectomy " +
      "with fusion, which is the bigger operation. The spinal implant is priced outside the " +
      "package, exactly as the app's implant line assumes.",
  },
  "p-cabg": { code: "SV004A", basis: "package" },
  "p-angioplasty": {
    code: "MC011A",
    basis: "package",
    note:
      "PTCA inclusive of the diagnostic angiogram. The stent is not in the package — the " +
      "row names a coronary stent as a separately costed implant, which is why the private " +
      "bill's implant line has a government counterpart to compare against.",
  },
  "p-tkr": {
    code: "SB039A",
    basis: "package",
    note:
      "Primary total knee replacement, and the ClaimCast procedure is bilateral. PM-JAY " +
      "publishes no bilateral package, so this is a per-knee reference point and is lower " +
      "than the modelled admission costs. The same caveat as CGHS OR089, for the same reason.",
  },
  "p-chole": {
    code: "SG039C",
    basis: "package",
    note: "Laparoscopic, without exploration of the common bile duct. All four SG039 variants are priced alike.",
  },
  "p-appendix": {
    code: "SG017B",
    basis: "package",
    note: "Laparoscopic appendicectomy. SG017A is the open operation, at the same price.",
  },
  "p-csection": { code: "SO057A", basis: "package" },
  "p-delivery": {
    code: "SO074A",
    basis: "package",
    note: "Normal vaginal delivery. SO075A is instrumental and SO054A-E are the high-risk packages.",
  },
  "p-cataract": {
    code: "SE020A",
    basis: "package",
    note: "Phacoemulsification with a foldable IOL, the same technique CGHS OP100 prices.",
  },
  "p-dialysis": {
    code: "MG072D",
    basis: "package",
    note: "Chronic haemodialysis, one session. MG072C is the acute session, at the same price.",
  },

  // Medical management. No package price exists for any of these; the scheme
  // pays bed category times bed days, and the rate grid is the published figure.
  "p-pneumonia": { code: "MG016A", basis: "perDay" },
  "p-sepsis": {
    code: "MG002B",
    basis: "perDay",
    note: "Septic shock, the severe variant of MG002A.",
  },
  "p-observation": {
    code: "MG009A",
    basis: "perDay",
    note: "Acute gastroenteritis with moderate dehydration. MG009B is the severe one, at the same rates.",
  },
};
