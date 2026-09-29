import type { Procedure } from "../types";
import { rupees as r } from "../money";

/**
 * Fifteen synthetic procedures, with enough of a cost model to rebuild a bill.
 *
 * The cost model is illustrative and follows the shape of the real registries
 * rather than their contents. `pmjayRate` no longer is. Each one is the
 * National Reference Price of the PM-JAY package named in the comment beside
 * it, printed in the HBP 2022 Office Memorandum and carried here so these
 * fixtures agree with the database rather than approximating it; the mapping
 * from procedure to package code is in apps/api/prisma/hbp-map.ts.
 *
 * Two are null, and both are findings rather than gaps. PM-JAY prices a medical
 * admission by bed category per day and publishes no package price for
 * pneumonia at all, and it prices chemotherapy by cancer and by regimen across
 * 287 codes, with no generic per-cycle package to point at. Three entries exist for what
 * they do to the arithmetic rather than for breadth: the medical admission with
 * no surgical fee, where proportionate reduction has almost nothing to bite on;
 * the intensive-care stay, which the 2020 circular exempts outright; and the
 * nineteen-hour observation, which fails the definition of hospitalisation and
 * is refused whole.
 */
export const PROCEDURES: Procedure[] = [
  {
    id: "p-spine-fusion",
    name: "Lumbar spinal fusion, single level",
    hbpCode: "SG-ORT-047",
    specialty: "Orthopaedics",
    dayCare: false,
    medianStayDays: 5,
    usesImplant: true,
    implantOptions: [
      { id: "imported", label: "Titanium cage, imported", amount: r(105000) },
      { id: "domestic", label: "Titanium cage, domestic make", amount: r(62000) },
    ],
    pmjayRate: r(54375), // SN034B
    cghsRate: r(76000), // CGHS NS036, X tier, NABH
    privateLow: r(260000),
    privateHigh: r(480000),
    costs: {
      surgical: r(100000),
      nursingPerDay: r(1360),
      icuPerDay: r(18000),
      diagnostics: r(34000),
      pharmacyPerDay: r(5720),
      implant: r(105000),
      otherIndependent: r(6000),
      nonPayableFixed: r(4100),
      nonPayablePerDay: r(1560),
      outsideWindow: r(11600),
    },
  },
  {
    id: "p-cabg",
    name: "Coronary artery bypass graft",
    hbpCode: "SG-CVS-011",
    specialty: "Cardiothoracic surgery",
    dayCare: false,
    medianStayDays: 8,
    usesImplant: false,
    pmjayRate: r(129910), // SV004A
    cghsRate: r(180000), // CGHS CV013, X tier, NABH
    privateLow: r(280000),
    privateHigh: r(650000),
    costs: {
      surgical: r(340000),
      nursingPerDay: r(2600),
      icuPerDay: r(24000),
      diagnostics: r(68000),
      pharmacyPerDay: r(12500),
      implant: null,
      otherIndependent: r(18000),
      nonPayableFixed: r(6400),
      nonPayablePerDay: r(2100),
      outsideWindow: r(22000),
    },
  },
  {
    id: "p-angioplasty",
    name: "Angioplasty with drug-eluting stent",
    hbpCode: "SG-CVS-004",
    specialty: "Interventional cardiology",
    dayCare: false,
    medianStayDays: 3,
    usesImplant: true,
    implantOptions: [
      { id: "imported", label: "Drug-eluting stent, imported", amount: r(145000) },
      { id: "domestic", label: "Drug-eluting stent, domestic make", amount: r(68000) },
    ],
    pmjayRate: r(40600), // MC011A
    cghsRate: r(97000), // CGHS CP001, X tier, NABH
    privateLow: r(210000),
    privateHigh: r(490000),
    costs: {
      surgical: r(145000),
      nursingPerDay: r(2200),
      icuPerDay: r(24000),
      diagnostics: r(42000),
      pharmacyPerDay: r(8600),
      implant: r(145000),
      otherIndependent: r(6000),
      nonPayableFixed: r(5200),
      nonPayablePerDay: r(1900),
      outsideWindow: r(14000),
    },
  },
  {
    id: "p-tkr",
    name: "Total knee replacement, bilateral",
    hbpCode: "SG-ORT-019",
    specialty: "Orthopaedics",
    dayCare: false,
    medianStayDays: 6,
    usesImplant: true,
    implantOptions: [
      { id: "imported", label: "Bilateral prosthesis, imported", amount: r(220000) },
      { id: "domestic", label: "Bilateral prosthesis, domestic make", amount: r(120000) },
    ],
    pmjayRate: r(29062.5), // SB039A, per knee
    cghsRate: r(152000), // CGHS OR089, X tier, NABH
    privateLow: r(320000),
    privateHigh: r(720000),
    costs: {
      surgical: r(220000),
      nursingPerDay: r(2000),
      icuPerDay: r(18000),
      diagnostics: r(26000),
      pharmacyPerDay: r(7400),
      implant: r(220000),
      otherIndependent: r(24000),
      nonPayableFixed: r(4800),
      nonPayablePerDay: r(1740),
      outsideWindow: r(9600),
    },
  },
  {
    // Added so a health report for a broken ankle -- the commonest fracture
    // that ends in theatre -- has a priced admission to land on.
    id: "p-ankle-orif",
    name: "Ankle fracture fixation (ORIF)",
    hbpCode: "SB020A",
    specialty: "Orthopaedics",
    dayCare: false,
    medianStayDays: 3,
    usesImplant: true,
    implantOptions: [
      { id: "imported", label: "Titanium locking plate and screws, imported", amount: r(38000) },
      { id: "domestic", label: "Steel plate and screws, domestic make", amount: r(14000) },
    ],
    pmjayRate: r(15600), // SB020A
    cghsRate: r(43000), // CGHS OR041, X tier, NABH
    privateLow: r(80000),
    privateHigh: r(220000),
    costs: {
      surgical: r(55000),
      nursingPerDay: r(1200),
      icuPerDay: r(16000),
      diagnostics: r(9000),
      pharmacyPerDay: r(3200),
      implant: r(38000),
      otherIndependent: r(4000),
      nonPayableFixed: r(3000),
      nonPayablePerDay: r(1100),
      outsideWindow: r(3000),
    },
  },
  {
    id: "p-chole",
    name: "Laparoscopic cholecystectomy",
    hbpCode: "SG-GEN-022",
    specialty: "General surgery",
    dayCare: false,
    medianStayDays: 2,
    usesImplant: false,
    pmjayRate: r(31050), // SG039C
    cghsRate: r(35000), // CGHS AG037, X tier, NABH
    privateLow: r(55000),
    privateHigh: r(145000),
    costs: {
      surgical: r(62000),
      nursingPerDay: r(1200),
      icuPerDay: r(16000),
      diagnostics: r(12000),
      pharmacyPerDay: r(3400),
      implant: null,
      otherIndependent: r(2500),
      nonPayableFixed: r(3200),
      nonPayablePerDay: r(1180),
      outsideWindow: r(4800),
    },
  },
  {
    id: "p-appendix",
    name: "Appendicectomy",
    hbpCode: "SG-GEN-008",
    specialty: "General surgery",
    dayCare: false,
    medianStayDays: 3,
    usesImplant: false,
    pmjayRate: r(20000), // SG017B
    cghsRate: r(20900), // CGHS AG045, X tier, NABH
    privateLow: r(46000),
    privateHigh: r(120000),
    costs: {
      surgical: r(48000),
      nursingPerDay: r(1100),
      icuPerDay: r(16000),
      diagnostics: r(9600),
      pharmacyPerDay: r(3100),
      implant: null,
      otherIndependent: r(1800),
      nonPayableFixed: r(2800),
      nonPayablePerDay: r(1120),
      outsideWindow: r(3200),
    },
  },
  {
    id: "p-csection",
    name: "Caesarean section",
    hbpCode: "SG-OBG-003",
    specialty: "Obstetrics",
    dayCare: false,
    medianStayDays: 4,
    usesImplant: false,
    pmjayRate: r(12000), // SO057A
    cghsRate: r(53000), // CGHS OG004, X tier, NABH
    privateLow: r(62000),
    privateHigh: r(180000),
    costs: {
      surgical: r(58000),
      nursingPerDay: r(1500),
      icuPerDay: r(16000),
      diagnostics: r(11200),
      pharmacyPerDay: r(5400),
      implant: null,
      otherIndependent: r(3600),
      nonPayableFixed: r(3800),
      nonPayablePerDay: r(1340),
      outsideWindow: r(6800),
    },
  },
  {
    id: "p-delivery",
    name: "Normal delivery",
    hbpCode: "MG-OBG-001",
    specialty: "Obstetrics",
    dayCare: false,
    medianStayDays: 3,
    usesImplant: false,
    pmjayRate: r(8000), // SO074A
    cghsRate: r(35000), // CGHS OG002, X tier, NABH
    privateLow: r(32000),
    privateHigh: r(95000),
    costs: {
      surgical: r(26000),
      nursingPerDay: r(1300),
      icuPerDay: null,
      diagnostics: r(6800),
      pharmacyPerDay: r(3600),
      implant: null,
      otherIndependent: r(2400),
      nonPayableFixed: r(3400),
      nonPayablePerDay: r(1260),
      outsideWindow: r(5200),
    },
  },
  {
    id: "p-pneumonia",
    name: "Community-acquired pneumonia, medical management",
    hbpCode: "MG-RES-012",
    specialty: "Internal medicine",
    dayCare: false,
    medianStayDays: 5,
    usesImplant: false,
    pmjayRate: null, // MG016A is priced per bed-day
    cghsRate: null, // no CGHS procedure code: medical management, not a package
    privateLow: r(48000),
    privateHigh: r(160000),
    costs: {
      surgical: 0,
      nursingPerDay: r(1450),
      icuPerDay: r(16000),
      diagnostics: r(18600),
      pharmacyPerDay: r(6900),
      implant: null,
      otherIndependent: r(2200),
      nonPayableFixed: r(2600),
      nonPayablePerDay: r(1080),
      outsideWindow: r(4400),
    },
  },
  {
    id: "p-sepsis",
    name: "Septic shock, intensive care",
    hbpCode: null,
    specialty: "Critical care",
    dayCare: false,
    medianStayDays: 5,
    usesImplant: false,
    pmjayRate: null,
    cghsRate: null, // no CGHS procedure code: medical management, not a package
    privateLow: r(180000),
    privateHigh: r(540000),
    costs: {
      surgical: 0,
      nursingPerDay: 0,
      icuPerDay: r(22000),
      diagnostics: r(48000),
      pharmacyPerDay: r(16400),
      implant: null,
      otherIndependent: 0,
      nonPayableFixed: r(4200),
      nonPayablePerDay: r(1900),
      outsideWindow: 0,
    },
  },
  {
    id: "p-cataract",
    name: "Cataract extraction with intraocular lens",
    hbpCode: "SG-OPH-002",
    specialty: "Ophthalmology",
    dayCare: true,
    medianStayDays: 1,
    usesImplant: true,
    implantOptions: [
      { id: "imported", label: "Foldable intraocular lens, imported", amount: r(18000) },
      { id: "domestic", label: "Foldable intraocular lens, domestic make", amount: r(8500) },
    ],
    pmjayRate: r(4500), // SE020A
    cghsRate: r(17000), // CGHS OP100, X tier, NABH
    privateLow: r(28000),
    privateHigh: r(92000),
    costs: {
      surgical: r(24000),
      nursingPerDay: 0,
      icuPerDay: null,
      diagnostics: r(3200),
      pharmacyPerDay: r(1800),
      implant: r(18000),
      otherIndependent: 0,
      nonPayableFixed: r(1400),
      nonPayablePerDay: r(620),
      outsideWindow: r(2400),
    },
  },
  {
    id: "p-chemo",
    name: "Chemotherapy, one cycle",
    hbpCode: "MG-ONC-006",
    specialty: "Medical oncology",
    dayCare: true,
    medianStayDays: 1,
    usesImplant: false,
    pmjayRate: null, // no generic package exists
    cghsRate: r(2300), // CGHS CT002, X tier, NABH
    privateLow: r(22000),
    privateHigh: r(140000),
    costs: {
      surgical: r(6500),
      nursingPerDay: 0,
      icuPerDay: null,
      diagnostics: r(8400),
      pharmacyPerDay: r(62000),
      implant: null,
      otherIndependent: 0,
      nonPayableFixed: r(1200),
      nonPayablePerDay: r(780),
      outsideWindow: r(6400),
    },
  },
  {
    id: "p-dialysis",
    name: "Maintenance haemodialysis, one session",
    hbpCode: "MG-NEP-001",
    specialty: "Nephrology",
    dayCare: true,
    medianStayDays: 1,
    usesImplant: false,
    pmjayRate: r(1500), // MG072D
    cghsRate: r(2500), // CGHS NU122, X tier, NABH
    privateLow: r(2800),
    privateHigh: r(6500),
    costs: {
      surgical: r(3400),
      nursingPerDay: 0,
      icuPerDay: null,
      diagnostics: r(1200),
      pharmacyPerDay: r(1900),
      implant: null,
      otherIndependent: 0,
      nonPayableFixed: r(400),
      nonPayablePerDay: r(260),
      outsideWindow: 0,
    },
  },
  {
    id: "p-observation",
    name: "Acute gastroenteritis, observation",
    hbpCode: null,
    specialty: "Emergency medicine",
    dayCare: false,
    medianStayDays: 1,
    usesImplant: false,
    pmjayRate: null,
    cghsRate: null, // no CGHS procedure code: medical management, not a package
    privateLow: r(8000),
    privateHigh: r(34000),
    costs: {
      surgical: 0,
      nursingPerDay: r(900),
      icuPerDay: null,
      diagnostics: r(4200),
      pharmacyPerDay: r(2600),
      implant: null,
      otherIndependent: 0,
      nonPayableFixed: r(2200),
      nonPayablePerDay: r(780),
      outsideWindow: 0,
    },
  },
];

export const procedure = (id: string): Procedure => PROCEDURES.find((p) => p.id === id)!;
