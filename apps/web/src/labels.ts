import { isNoPolicy, type Policy } from "@claimcast/engine";
import { t } from "./i18n";

/** How a plan is named in a picker or a sentence. The nil plan reads as what it means. */
export const policyLabel = (p: Policy) => (isNoPolicy(p) ? t("No insurance (we will pay ourselves)") : `${p.product} — ${p.insurer}`);
export const policyShort = (p: Policy) => (isNoPolicy(p) ? t("No insurance") : p.product);

/** Plans that exist only in this browser travel with a question or a save. Every upload gets its own id, so this matches any of them. */
export const policyTravels = (p: Policy) => p.id.startsWith("pol-uploaded") || isNoPolicy(p);
