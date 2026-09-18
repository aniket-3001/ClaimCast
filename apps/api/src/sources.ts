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
    url: "https://irdai.gov.in/documents/37343/365525/Modification+Guidelines+on+Standardization+in+Health+Insurance.pdf",
    checksum: "ca53bb9d872e89c854359d4ea72e8a676ccc36dd05f401100490264485ae3e1a",
    fetchedAt: new Date("2026-09-18T11:22:10Z"),
    caveat:
      "The circular has been downloaded and checksummed, and the four lists parsed from " +
      "Annexure-I of IRDAI/HLT/REG/CIR/176/09/2019 run to 68, 37, 23 and 18 items. What is " +
      "published is the item names and nothing else: IRDAI names these items without pricing " +
      "or grouping them, so every `typical` amount and every group heading here is ClaimCast's " +
      "own modelling of a five-day metro admission, not the regulator's.",
  },
  {
    id: "nha-hbp-2-2",
    name: "Ayushman Bharat PM-JAY Health Benefit Package 2.2 (User Guidelines)",
    publisher: "National Health Authority",
    url: "https://hem.nha.gov.in/HBP.pdf",
    checksum: "9bd399d781f57d7ae0009aa157697f78ca8a0b7507dc895d1eb56962fd1eaf61",
    fetchedAt: new Date("2026-09-18T11:24:22Z"),
    caveat:
      "Scheme rules, not rates. The file behind this row is the HBP 2.2 User Guidelines, " +
      "which reference 'Annexure 2: Packages and Rates' without containing it. That " +
      "annexure has since been found, in the HBP 2022 Office Memorandum, and the " +
      "per-procedure rates in this database come from there rather than from here. What " +
      "this document supplies is the ₹5,00,000 family cover, the ₹1,00,000 " +
      "unspecified-procedure cap and the scheme's generic medical bed-day rates.",
  },
  {
    id: "nha-hbp-2022",
    name: "Ayushman Bharat PM-JAY Health Benefit Package 2022 (package master)",
    publisher: "National Health Authority",
    url: "https://cdnbbsr.s3waas.gov.in/s3169779d3852b32ce8b1a1724dbf5217d/uploads/2024/06/20240619792610196.pdf",
    checksum: "4f6ca823468c947449647fbea9cfd5876d1d4fee5d46f3fa27179397eeb953e4",
    fetchedAt: new Date("2026-09-18T11:24:22Z"),
    caveat:
      "Issued by the National Health Authority, downloaded from a state mirror. The NHA's " +
      "own portals do not serve this file — nha.gov.in answers every path, including its " +
      "own document links, with the same 3,843-byte HTML shell, and pmjay.gov.in refuses " +
      "the connection — so the copy checksummed here is the Haryana State Health Agency's, " +
      "on the NIC government CDN. It is the national Office Memorandum and not a state " +
      "variant, and Haryana republishes it rather than issuing it. 1,949 packages are " +
      "transcribed exactly as printed, including the 246 whose city-tier prices do not " +
      "follow the multipliers the rest of the document uses; computing those would have " +
      "been tidier and wrong 246 times. The tier a rate applies to comes from the " +
      "memorandum's own Annexure-3, which names the Tier 1 and Tier 2 cities and leaves " +
      "Tier 3 to be everything else.",
  },
  {
    id: "cghs-rates",
    name: "CGHS rate list (Annexure I), Office Memorandum of 3 October 2025",
    publisher: "Central Government Health Scheme, Ministry of Health and Family Welfare",
    url: "https://delhijalboard.delhi.gov.in/sites/default/files/Jalboard/universal-tab/new_cghs_rates_applicable.pdf",
    checksum: "fd56c4e1d46b4cb926e0a52fc96344075072cda38ca289a7ce2e19c8b6b32a33",
    fetchedAt: new Date("2026-09-18T11:24:22Z"),
    caveat:
      "Mirror, not the issuing authority. This is CGHS OM F.No. 5-16/CGHS(HQ)/HEC/2024(PartI) " +
      "of 3 October 2025, in supersession of all previous memoranda — the current national " +
      "schedule, and its 1,998 coded rates are ingested verbatim. But it was retrieved from a " +
      "Delhi Jal Board copy: cghs.gov.in did not resolve and cghs.mohfw.gov.in is banner-marked " +
      "a test environment with its rate-list links disabled. The rates are real; the chain of " +
      "custody runs through a mirror, and that is what this caveat records.",
  },
  {
    id: "arogya-sanjeevani",
    name: "Arogya Sanjeevani standard product wording",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/documents/37343/366029/Master+Circular+on+Standardization+of+Health+Insurance+Products.pdf/40548736-71a8-1b76-e28d-0df899407e1e?version=1.2&t=1665033878433&download=true",
    checksum: "cdde737a8f562db8ce4749d9a4d34841cf382e813f48546a752cba45902cf2ee",
    fetchedAt: new Date("2026-09-18T11:22:16Z"),
    caveat:
      "Superseded document, product still in force. Every term of the Arogya Sanjeevani " +
      "row -- room cap, ICU cap, co-pay, proportionate deduction, pre- and post-" +
      "hospitalisation -- is quoted from the Master Circular of 22 July 2020, downloaded, " +
      "checksummed and verified against the page it cites. That circular is listed in " +
      "Annexure-6 of the Master Circular of 29 May 2024 and superseded by it, which " +
      "carries the standard products forward expressly: Arogya Sanjeevani is still the " +
      "mandated standard product and these are still its prescribed terms. Two figures " +
      "come from elsewhere. The moratorium is 60 months, set by the 2024 circular, not " +
      "the eight years this one prints. The pre-existing waiting period is inherited from " +
      "standard exclusion Excl01 and is the one term here not yet re-verified against the " +
      "2024 framework. Every other policy in this database is an invented product.",
  },
  {
    id: "irdai-master-circular-2024",
    name: "Master Circular on Health Insurance Business, 29 May 2024",
    publisher: "Insurance Regulatory and Development Authority of India",
    url: "https://irdai.gov.in/document-detail?documentId=4942918",
    checksum: "fdc70264ce307e0c0ead2de442881c907a03a638477c03a7aaf473d3cc139134",
    fetchedAt: new Date("2026-09-18T13:05:00Z"),
    caveat:
      "Downloaded and checksummed, and it says less than we had assumed. The circular " +
      "carries no non-payable lists at all -- it is process, turnaround times and filing " +
      "forms -- so the lists in this database come from the Modification Guidelines of " +
      "27 September 2019, which this circular does not repeal. What it does settle is the " +
      "moratorium: 60 months of continuous coverage, in its own words, replacing the eight " +
      "years the 2020 circular set. Its Annexure-6 supersedes forty-six circulars, one of " +
      "which is the 2020 Master Circular on Standardization.",
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
