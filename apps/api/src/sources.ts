/**
 * Where every seeded figure comes from.
 *
 * The rule the project runs on is that a number either carries a source or is
 * labelled synthetic, and there is no third option. Today almost everything in
 * the database is the second kind: the reference set was hand-modelled for the
 * prototype, and saying so in a column is the only way that stays true once
 * the data is behind an API and nobody can see where it came from.
 *
 * `caveat` is therefore not documentation. It is a queryable field, and any
 * screen that shows a figure whose source carries one has to say so. Phase 3
 * replaces these rows one published document at a time, and a source loses its
 * caveat only when the file behind it has actually been downloaded and its
 * checksum recorded.
 */

export interface SourceSeed {
  id: string;
  name: string;
  publisher: string;
  url: string;
  checksum: string | null;
  fetchedAt: Date;
  caveat: string | null;
}

/** The day this reference set was assembled. */
const ASSEMBLED = new Date("2026-09-18T00:00:00Z");

export const SOURCES: SourceSeed[] = [
  {
    id: "claimcast-synthetic",
    name: "ClaimCast synthetic reference set",
    publisher: "ClaimCast",
    url: "https://github.com/aniket-3001/ClaimCast",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "Modelled, not observed. No real hospital, insurer, patient or bill appears in it. " +
      "Figures are chosen to be realistic in magnitude and to exercise every adjudication " +
      "rule, and must never be presented as measured data.",
  },
  {
    id: "irdai-cir-151-2020",
    name: "Guidelines on standardisation of exclusions and proportionate deduction (IRDAI/HLT/REG/CIR/151/06/2020)",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "The circular reference and the substance of the rule are carried from the research " +
      "dossier. The PDF itself has not yet been downloaded and checksummed, so the clause " +
      "text stored here is a faithful paraphrase rather than a verbatim quotation.",
  },
  {
    id: "irdai-lists",
    name: "IRDAI Lists I-IV of non-payable, consumable and optional items",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "The item names and their grouping follow the published lists. The amounts do not: " +
      "IRDAI names the items without pricing them, so every `typical` figure here is " +
      "modelled for a five-day metro admission and is synthetic.",
  },
  {
    id: "nha-hbp-2-2",
    name: "Ayushman Bharat PM-JAY Health Benefit Package 2.2",
    publisher: "National Health Authority",
    url: "https://nha.gov.in/PM-JAY",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "HBP 2.2 publishes roughly 1,949 package rates across 27 specialties. None of them " +
      "have been ingested yet. The PM-JAY rates seeded here are placeholders of plausible " +
      "magnitude and are replaced wholesale in Phase 3.",
  },
  {
    id: "cghs-rates",
    name: "CGHS city-wise rate lists",
    publisher: "Central Government Health Scheme, Ministry of Health and Family Welfare",
    url: "https://cghs.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "PARTIAL. That CGHS publishes city-wise, NABH-differentiated rates is well " +
      "established, but no authoritative rate document has been retrieved. The CGHS " +
      "figures seeded here are placeholders and no derived figure may ship until the " +
      "real file is pulled and checksummed.",
  },
  {
    id: "arogya-sanjeevani",
    name: "Arogya Sanjeevani standard product wording",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "The regulator-prescribed standard product. Its wording has not yet been ingested; " +
      "the policies seeded here are invented products carrying realistic terms, not this " +
      "or any other real insurer's schedule.",
  },
  {
    id: "irdai-master-circular-2024",
    name: "Master Circular on Health Insurance Business, 29 May 2024",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "Cited from the research dossier. The circular consolidates the non-payable lists " +
      "and the moratorium rule; the document has not yet been downloaded and checksummed.",
  },
  {
    id: "irdai-standard-definitions",
    name: "IRDAI standard definitions of terms used in health insurance",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "The prescribed definitions of in-patient care and day-care treatment. Carried from " +
      "the research dossier; not yet downloaded and checksummed.",
  },
  {
    id: "nha-vay-vandana",
    name: "Ayushman Bharat Vay Vandana, cover for citizens aged 70 and above",
    publisher: "National Health Authority",
    url: "https://nha.gov.in/PM-JAY",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "Launched 29 October 2024. Eligibility on age alone, with no means test, is carried " +
      "from the research dossier; the scheme notification has not been downloaded.",
  },
  {
    id: "general-insurance-law",
    name: "The principle of indemnity",
    publisher: "Settled position, no single publishing authority",
    url: "https://irdai.gov.in/",
    checksum: null,
    fetchedAt: ASSEMBLED,
    caveat:
      "Not a document. That a single hospitalisation is settled down one payment route " +
      "rather than several stacked together is a settled principle with no one circular " +
      "behind it, and is recorded this way rather than attributed to a source that does " +
      "not exist.",
  },
];

/**
 * Which published source each clause is attributed to.
 *
 * Every clause id in the engine's registry appears here, deliberately: a
 * clause with no entry would silently fall back to something, and the point of
 * the registry is that no deduction happens without a citable reason. The ones
 * pointing at the synthetic set are product wordings — our policies are
 * invented, so the clause that quotes them is invented too.
 */
export const CLAUSE_SOURCE: Record<string, string> = {
  ROOM_CAP: "claimcast-synthetic",
  PROPORTIONATE: "irdai-cir-151-2020",
  PROPORTIONATE_ICU: "irdai-cir-151-2020",
  ICU_CAP: "claimcast-synthetic",
  LIST_I: "irdai-master-circular-2024",
  IMPLANT_SUBLIMIT: "claimcast-synthetic",
  PRE_POST_WINDOW: "claimcast-synthetic",
  COPAY: "claimcast-synthetic",
  SUM_INSURED: "claimcast-synthetic",
  DAY_CARE: "irdai-standard-definitions",
  DAY_CARE_DOWNGRADE: "irdai-standard-definitions",
  PED_WAITING: "claimcast-synthetic",
  MORATORIUM: "irdai-master-circular-2024",
  PRIVATE_INDEMNITY: "claimcast-synthetic",
  PMJAY: "nha-hbp-2-2",
  VAY_VANDANA: "nha-vay-vandana",
  CGHS_SCHEME: "cghs-rates",
  SINGLE_CLAIM_PATH: "general-insurance-law",
};
