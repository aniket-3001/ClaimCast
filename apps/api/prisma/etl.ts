/**
 * What the Python ETL produced, read back on the TypeScript side.
 *
 * The seed reads `etl/out/`, never `etl/raw/` and never the network. Those
 * files are built by `python -m etl.build` from documents that have already
 * been downloaded, magic-byte checked and checksummed, and they are tracked in
 * git, so seeding a fresh machine needs neither Python nor a working
 * government portal.
 *
 * If a file is missing the seed stops. It does not fall back to the fixtures,
 * for the same reason the web app has no offline copy of its reference data:
 * silently substituting a modelled figure for a published one is the single
 * failure this project cannot afford.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../../etl/out");

/** Provenance as the ETL recorded it, matching the Source table's columns. */
export interface EtlSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  checksum: string;
  caveat: string | null;
  document: string;
  effectiveFrom: string | null;
}

export interface CghsRate {
  code: string;
  name: string;
  specialty: string;
  /** Paise, semi-private ward, X (Tier I) city. */
  nonNabh: number;
  nabh: number;
  superSpecialty: number;
  page: number;
}

export interface CghsFile {
  source: EtlSource;
  rules: {
    wardFactor: Record<string, number>;
    cityFactor: Record<"X" | "Y" | "Z", number>;
    subsequentProcedureFactor: number;
    citation: string;
    [k: string]: unknown;
  };
  rates: CghsRate[];
}

function read<T>(name: string): T {
  const path = resolve(OUT, name);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(
      "could not read " +
        path +
        ". The ETL output is tracked in git, so this usually means the file was " +
        "deleted rather than never built; rebuild it with `python -m etl.build`. " +
        "Underlying error: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

export interface IrdaiListItem {
  serial: number;
  label: string;
}

export interface IrdaiListsFile {
  source: EtlSource;
  note: string;
  framework: { id: string; title: string; effect: string }[];
  lists: Record<"I" | "II" | "III" | "IV", IrdaiListItem[]>;
}

export interface AsClause {
  id: string;
  cite: string;
  text: string;
  page: number;
}

export interface ArogyaFile {
  source: EtlSource;
  policy: {
    id: string;
    insurer: string;
    product: string;
    sumInsured: number;
    sumInsuredMin: number;
    sumInsuredMax: number;
    roomCapPerDay: number;
    roomCapPctOfSI: number;
    icuCapPerDay: number;
    icuCapPctOfSI: number;
    proportionateDeduction: boolean;
    copayPct: number;
    implantSubLimit: number | null;
    preHospDays: number;
    postHospDays: number;
    dayCareCovered: boolean;
    monthsInForce: number;
    pedWaitingMonths: number;
    moratoriumMonths: number;
    notes: string;
  };
  clauses: AsClause[];
}

export const cghs = () => read<CghsFile>("cghs-rates.json");
export const irdaiLists = () => read<IrdaiListsFile>("irdai-lists.json");
export const arogya = () => read<ArogyaFile>("arogya-sanjeevani.json");

/**
 * The published Tier I semi-private rate, moved to another city tier.
 *
 * The OM prints one grid and states the rest as arithmetic: rates in Y (Tier
 * II) cities are 10% lower than X, and in Z (Tier III) 20% lower. Rounded to
 * the rupee, because a tariff is quoted in rupees and carrying fractional
 * paise here would only invent precision.
 */
export const atTier = (paise: number, factor: number): number =>
  Math.round((paise * factor) / 100) * 100;
