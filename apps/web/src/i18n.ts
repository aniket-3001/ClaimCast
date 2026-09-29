/**
 * English and Hindi.
 *
 * English is the source text: every string on screen is written in English
 * and passed through `t()`, which returns the Hindi when Hindi is on and the
 * English otherwise. A string with no Hindi yet shows in English rather than
 * breaking, so a missing entry is a gap, never a crash.
 *
 * `tx()` is for sentences the engine writes -- deduction reasons, the names of
 * the tree's stages, scheme details. Those carry live figures, so they are
 * matched by pattern and the figures are carried across unchanged.
 *
 * Names stay as they are: hospitals, insurers, plans and treatments are proper
 * nouns from the data, and legal citations (IRDAI/HLT/REG/CIR/...) are cited
 * exactly as published.
 *
 * The current language is a module value rather than a context: the app
 * re-renders from the top when it changes, and every component reads it then.
 */

export type Lang = "en" | "hi";

const KEY = "claimcast.lang";
let current: Lang = "en";

export function storedLang(): Lang {
  try {
    return window.localStorage.getItem(KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

export function lang(): Lang {
  return current;
}

export function setLang(l: Lang, remember = true) {
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l === "hi" ? "hi" : "en";
  if (!remember) return;
  try {
    window.localStorage.setItem(KEY, l);
  } catch {
    // Storage blocked: the switch still works for this page load.
  }
}

type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

/** Screen text. `en` is the English, and the key. */
export function t(en: string, vars?: Vars): string {
  return fill(current === "hi" ? (HI[en] ?? ENGINE[en] ?? en) : en, vars);
}

/** Pick by count, in either language. */
export function plural(n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

/** A sentence the engine wrote, with its figures kept. */
export function tx(s: string | null | undefined): string {
  if (!s) return s ?? "";
  if (current !== "hi") return s;
  const exact = HI[s] ?? ENGINE[s];
  if (exact) return exact;
  for (const [re, to] of PATTERNS) {
    const m = s.match(re);
    if (m) return to(m);
  }
  // Composite details: "Nashik · private · cashless".
  if (s.includes(" · ")) return s.split(" · ").map((p) => tx(p)).join(" · ");
  return s;
}

const room = (s: string) => ENGINE[s] ?? ENGINE[s.charAt(0).toUpperCase() + s.slice(1)] ?? s;
const reason = (s: string) => ENGINE[s] ?? s;

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Charged (₹[\d,]+) a day against a limit of (₹[\d,]+)\.$/, (m) => `${m[2]} की सीमा के मुकाबले ${m[1]} प्रति दिन लिया गया।`],
  [/^Charged (₹[\d,]+) a day against an ICU limit of (₹[\d,]+)\.$/, (m) => `${m[2]} की ICU सीमा के मुकाबले ${m[1]} प्रति दिन लिया गया।`],
  [/^Priced by room category, so it is reduced in the same ratio: (₹[\d,]+) ÷ (₹[\d,]+)\.$/, (m) =>
    `यह कमरे की श्रेणी के हिसाब से तय होता है, इसलिए इसे उसी अनुपात में घटाया गया: ${m[1]} ÷ ${m[2]}।`],
  [/^Sub-limit of (₹[\d,]+) regardless of the balance sum insured\.$/, (m) => `बची हुई बीमा राशि चाहे जितनी हो, ${m[1]} की उप-सीमा।`],
  [/^Outside the (\d+)-day pre-hospitalisation window\.$/, (m) => `भर्ती से पहले की ${m[1]} दिन की सीमा के बाहर।`],
  [/^(₹[\d,]+) of the sum insured was already used this year\. Only (₹[\d,]+) was left\.$/, (m) =>
    `इस साल बीमा राशि में से ${m[1]} पहले ही इस्तेमाल हो चुकी थी। केवल ${m[2]} बचा था।`],
  [/^A pre-existing condition, and this policy has run (\d+) of the (\d+) months it must before one is covered\.$/, (m) =>
    `पहले से मौजूद बीमारी है, और कवर शुरू होने के लिए ज़रूरी ${m[2]} महीनों में से पॉलिसी को अभी ${m[1]} महीने ही हुए हैं।`],
  [/^The policy has run (\d+) months against a (\d+)-month waiting period, so the condition is covered like any other\.$/, (m) =>
    `पॉलिसी ${m[1]} महीने से चल रही है और प्रतीक्षा अवधि ${m[2]} महीने है, इसलिए यह बीमारी बाकी बीमारियों की तरह कवर है।`],
  [/^(.+) has no agreement with (.+)\. Only one route is open\.$/, (m) => `${m[1]} का ${m[2]} के साथ कोई समझौता नहीं है। केवल एक रास्ता खुला है।`],
  [/^Pre-authorisation, about (\d+) hours\. The insurer settles the rest directly\.$/, (m) =>
    `पूर्व-अनुमति में लगभग ${m[1]} घंटे। बाकी भुगतान बीमा कंपनी सीधे करती है।`],
  [/^Pay the full bill at discharge, and wait about (\d+) days to get (₹[\d,]+) of it back\.$/, (m) =>
    `छुट्टी के समय पूरा बिल चुकाएँ, और उसमें से ${m[2]} वापस पाने के लिए लगभग ${m[1]} दिन इंतज़ार करें।`],
  [/^Room rent — (.+), (\d+) days?$/, (m) => `कमरे का किराया — ${room(m[1])}, ${m[2]} दिन`],
  [/^Intensive care, (\d+) days?$/, (m) => `ICU, ${m[1]} दिन`],
  [/^(₹[\d,]+) a day$/, (m) => `${m[1]} प्रति दिन`],
  [/^(₹[\d,]+) listed$/, (m) => `${m[1]} सूची मूल्य`],
  [/^reimbursement, (\d+) days$/, (m) => `प्रतिपूर्ति, ${m[1]} दिन`],
  [/^Package rate for this procedure: (₹[\d,]+), cashless, no balance billing\.$/, (m) =>
    `इस प्रक्रिया की पैकेज दर: ${m[1]}, कैशलेस, कोई अतिरिक्त बिल नहीं।`],
  [/^Package rate for this procedure: (₹[\d,]+), cashless at empanelled centres\.$/, (m) =>
    `इस प्रक्रिया की पैकेज दर: ${m[1]}, सूचीबद्ध केंद्रों पर कैशलेस।`],
  [/^Same package rate, (₹[\d,]+) — but on age alone, not income or an existing card\.$/, (m) =>
    `वही पैकेज दर, ${m[1]} — केवल उम्र के आधार पर, आय या पहले से कार्ड की ज़रूरत नहीं।`],
  [/^ESIC tie-up, settled at the CGHS package rate of (₹[\d,]+), cashless on an ESIC referral\.$/, (m) =>
    `ESIC टाई-अप, CGHS पैकेज दर ${m[1]} पर, ESIC रेफ़रल पर कैशलेस।`],
  [/^Not available: (.+)\.$/, (m) => `उपलब्ध नहीं: ${reason(m[1])}।`],
  [/^patient is (\d+), scheme starts at 70$/, (m) => `मरीज़ की उम्र ${m[1]} है, योजना 70 से शुरू होती है`],
  [/^(.+), imported$/, (m) => `${m[1]}, आयातित`],
  [/^(.+), domestic make$/, (m) => `${m[1]}, भारत में निर्मित`],
  [/^package price at tier ([XYZ])$/, (m) => `टियर ${m[1]} पर पैकेज मूल्य`],
];

/** What the engine writes, word for word. */
const ENGINE: Record<string, string> = {
  // Stages of the tree
  Admission: "भर्ती",
  Investigation: "जाँच",
  Procedure: "प्रक्रिया",
  Recovery: "रिकवरी",
  Where: "कहाँ",
  "Which bed": "कौन सा बिस्तर",
  "How you claim": "दावा कैसे करें",
  "Which implant": "कौन सा इम्प्लांट",
  "How the stay is classified": "भर्ती को कैसे गिना जाएगा",
  "Room tariff against the sub-limit": "उप-सीमा के मुकाबले कमरे का किराया",
  "Proportionate deduction on room-linked charges": "कमरे से जुड़े खर्चों पर अनुपातिक कटौती",
  "What the family has to find on the day, and when it comes back": "परिवार को उस दिन कितना देना होगा, और वह कब वापस मिलेगा",
  "Sub-limit applies regardless of the balance sum insured": "बची हुई बीमा राशि चाहे जितनी हो, उप-सीमा लागू होती है",
  "Room, nursing and ICU charges need a valid 24-hour admission behind them": "कमरे, नर्सिंग और ICU के खर्च के लिए 24 घंटे की वैध भर्ती ज़रूरी है",
  "One room class in the building. There is nowhere cheaper to move.": "इमारत में एक ही तरह का कमरा है। इससे सस्ता विकल्प नहीं है।",
  "Already on the cheapest terms this hospital offers.": "यह पहले से इस अस्पताल का सबसे सस्ता विकल्प है।",
  "Every option here is within the sub-limit. The choice changes what the insurer pays, not what the family owes.":
    "यहाँ हर विकल्प उप-सीमा के अंदर है। चुनाव से बीमा कंपनी का भुगतान बदलता है, परिवार का नहीं।",
  Cashless: "कैशलेस",
  Reimbursement: "प्रतिपूर्ति (बाद में वापसी)",
  cashless: "कैशलेस",
  "No agreement with this insurer": "इस बीमा कंपनी से समझौता नहीं",
  "Not available here": "यहाँ उपलब्ध नहीं",
  "24 hours or more in a bed": "24 घंटे या उससे ज़्यादा बिस्तर पर",
  "Meets the definition of hospitalisation": "अस्पताल में भर्ती की परिभाषा पूरी करता है",
  "Discharged before 24 hours": "24 घंटे से पहले छुट्टी",
  "Same treatment, billed as day-care instead": "वही इलाज, पर डे-केयर के रूप में बिल",
  // Rooms
  "General ward": "जनरल वार्ड",
  "Semi-private": "सेमी-प्राइवेट",
  Private: "प्राइवेट",
  Deluxe: "डीलक्स",
  Suite: "सुइट",
  "Intensive care": "ICU (गहन चिकित्सा)",
  "general ward": "जनरल वार्ड",
  "semi-private": "सेमी-प्राइवेट",
  private: "प्राइवेट",
  deluxe: "डीलक्स",
  suite: "सुइट",
  // The gate
  "Is this a claim at all?": "क्या यह दावा बनता भी है?",
  "Not on the day-care list, so any stay is a valid claim": "डे-केयर सूची में नहीं है, इसलिए कोई भी भर्ती वैध दावा है",
  "There is no minimum stay to clear before a deduction can even be argued. Whether it is billed as a full 24-hour admission is decided further down.":
    "किसी कटौती की बात से पहले कोई न्यूनतम भर्ती अवधि पूरी नहीं करनी है। इसे पूरी 24 घंटे की भर्ती माना जाएगा या नहीं, यह आगे तय होता है।",
  "On the day-care list": "डे-केयर सूची में",
  "A listed day-care procedure. No minimum stay applies.": "सूचीबद्ध डे-केयर प्रक्रिया। कोई न्यूनतम भर्ती अवधि लागू नहीं।",
  "Pre-existing condition, waiting period served": "पहले से मौजूद बीमारी, प्रतीक्षा अवधि पूरी",
  "Pre-existing condition, inside the waiting period": "पहले से मौजूद बीमारी, प्रतीक्षा अवधि के अंदर",
  "This policy does not cover day-care procedures, and the procedure has no minimum stay to fall back on.":
    "यह पॉलिसी डे-केयर प्रक्रियाओं को कवर नहीं करती, और इस प्रक्रिया में कोई न्यूनतम भर्ती अवधि नहीं है।",
  // Bill lines
  "Surgeon's fee": "सर्जन की फ़ीस",
  "Operation theatre": "ऑपरेशन थिएटर",
  Anaesthetist: "एनेस्थेटिस्ट",
  "In-patient nursing": "भर्ती मरीज़ की नर्सिंग",
  "Investigations and imaging": "जाँच और इमेजिंग",
  "Pharmacy and consumables": "दवाइयाँ और उपभोग्य सामग्री",
  "Physiotherapy and other services": "फ़िज़ियोथेरेपी और अन्य सेवाएँ",
  "Pre-hospitalisation tests": "भर्ती से पहले की जाँचें",
  "Non-medical items (IRDAI List I)": "गैर-चिकित्सीय सामान (IRDAI सूची I)",
  "Done 42 days before admission. The policy window is 30 days.": "भर्ती से 42 दिन पहले की गईं। पॉलिसी की सीमा 30 दिन है।",
  "Toiletries, attendant meals, television, telephone, laundry, carry bags.": "टॉयलेटरीज़, साथी का खाना, टीवी, टेलीफ़ोन, कपड़े धुलाई, कैरी बैग।",
  "Whole claim": "पूरा दावा",
  // Reasons and notes
  "On IRDAI List I. Not payable under any policy, in any room.": "IRDAI सूची I में है। किसी भी पॉलिसी में, किसी भी कमरे में देय नहीं।",
  "The stay did not reach 24 hours, so this was never a valid inpatient claim.": "भर्ती 24 घंटे तक नहीं पहुँची, इसलिए यह कभी वैध भर्ती-दावा नहीं था।",
  "Priced by room category, and there was no valid inpatient stay to price it against.":
    "यह कमरे की श्रेणी से तय होता है, और इसके लिए कोई वैध भर्ती नहीं थी।",
  "Intensive care is exempt from proportionate reduction, but still requires a valid inpatient claim.":
    "ICU अनुपातिक कटौती से मुक्त है, पर इसके लिए भी वैध भर्ती-दावा ज़रूरी है।",
  "Claim refused in full. Nothing below applies.": "दावा पूरी तरह नामंज़ूर। नीचे का कुछ भी लागू नहीं।",
  "Under 24 hours, and not on the day-care list: room, nursing and every room-linked charge are refused in full. Diagnostics, pharmacy, the implant and List I are unaffected.":
    "24 घंटे से कम, और डे-केयर सूची में नहीं: कमरा, नर्सिंग और कमरे से जुड़े सभी खर्च पूरी तरह नामंज़ूर। जाँच, दवाइयाँ, इम्प्लांट और सूची I पर असर नहीं।",
  "This policy does not apply proportionate reduction. Only the rent above the limit is deducted.":
    "यह पॉलिसी अनुपातिक कटौती लागू नहीं करती। केवल सीमा से ऊपर का किराया कटता है।",
  "Intensive care is exempt from the proportionate reduction and has been left whole.": "ICU अनुपातिक कटौती से मुक्त है और पूरा रखा गया है।",
  "The admissible amount is above the sum insured.": "मंज़ूर राशि बीमा राशि से ज़्यादा है।",
  // Refused whatever the path
  "Non-medical items": "गैर-चिकित्सीय सामान",
  "Implant above its sub-limit": "उप-सीमा से ऊपर का इम्प्लांट",
  "Outside the pre and post-hospitalisation window": "भर्ती से पहले/बाद की समय-सीमा के बाहर",
  // Schemes
  "PM-JAY (Ayushman Bharat)": "PM-JAY (आयुष्मान भारत)",
  "Ayushman Bharat Vay Vandana (70+)": "आयुष्मान भारत वय वंदना (70+)",
  "ESI (Employees' State Insurance)": "ESI (कर्मचारी राज्य बीमा)",
  "The claim worked out on the rest of this page.": "इस पेज के बाकी हिस्से में निकाला गया दावा।",
  "hospital is not PM-JAY empanelled": "अस्पताल PM-JAY में सूचीबद्ध नहीं है",
  "no package rate for this procedure": "इस प्रक्रिया की कोई पैकेज दर नहीं",
  "hospital is not a CGHS centre": "अस्पताल CGHS केंद्र नहीं है",
  "hospital has no ESIC tie-up": "अस्पताल का ESIC टाई-अप नहीं है",
  "no CGHS package rate for ESIC to settle this procedure at": "ESIC के लिए इस प्रक्रिया की CGHS पैकेज दर नहीं",
  "not offered here": "यहाँ उपलब्ध नहीं",
  "household has no PM-JAY card on record": "परिवार के पास PM-JAY कार्ड नहीं है",
  "not a serving or retired central government employee": "केंद्र सरकार के वर्तमान या सेवानिवृत्त कर्मचारी नहीं",
  "not insured under ESI": "ESI में बीमित नहीं",
  // Clause citations that describe rather than cite a code
  "Policy schedule — room rent limit": "पॉलिसी विवरण — कमरे के किराए की सीमा",
  "Policy schedule — ICU limit": "पॉलिसी विवरण — ICU सीमा",
  "IRDAI List I — non-medical items": "IRDAI सूची I — गैर-चिकित्सीय सामान",
  "Policy schedule — implant sub-limit": "पॉलिसी विवरण — इम्प्लांट उप-सीमा",
  "Policy schedule — pre and post hospitalisation": "पॉलिसी विवरण — भर्ती से पहले और बाद",
  "Policy schedule — co-payment": "पॉलिसी विवरण — को-पेमेंट",
  "Policy schedule — sum insured": "पॉलिसी विवरण — बीमा राशि",
  "Definition of hospitalisation — 24 hours": "भर्ती की परिभाषा — 24 घंटे",
  "Definition of hospitalisation — day-care downgrade": "भर्ती की परिभाषा — डे-केयर में बदलाव",
  "Policy schedule — pre-existing disease waiting period": "पॉलिसी विवरण — पहले से मौजूद बीमारी की प्रतीक्षा अवधि",
  "Moratorium period — 60 months": "मोरेटोरियम अवधि — 60 महीने",
  "Policy schedule — the claim on this page": "पॉलिसी विवरण — इस पेज का दावा",
  "PM-JAY — Health Benefit Package rates": "PM-JAY — स्वास्थ्य लाभ पैकेज दरें",
  "PM-JAY — Vay Vandana Card for senior citizens": "PM-JAY — वरिष्ठ नागरिकों के लिए वय वंदना कार्ड",
  "CGHS — package rates for serving and retired central government employees": "CGHS — केंद्र सरकार के वर्तमान और सेवानिवृत्त कर्मचारियों की पैकेज दरें",
  "ESI — medical benefit for insured persons and dependants": "ESI — बीमित व्यक्तियों और आश्रितों के लिए चिकित्सा लाभ",
  "Principle of indemnity — no double recovery": "क्षतिपूर्ति का सिद्धांत — दोहरा भुगतान नहीं",
  // Hospital notes in the reference data
  "No cashless agreement with any insurer. Every claim here is a reimbursement.": "किसी बीमा कंपनी से कैशलेस समझौता नहीं। यहाँ हर दावा प्रतिपूर्ति है।",
  "No general ward. The cheapest bed in the building is semi-private.": "जनरल वार्ड नहीं है। सबसे सस्ता बिस्तर सेमी-प्राइवेट है।",
  "Tariffs below every sub-limit in the reference policies. Nothing is ever scaled here.": "किराया हर संदर्भ पॉलिसी की उप-सीमा से कम है। यहाँ कभी कटौती नहीं होती।",
  "Day-care only. No overnight beds, so the 24-hour rule decides every claim here.": "केवल डे-केयर। रात के बिस्तर नहीं, इसलिए यहाँ हर दावा 24 घंटे के नियम से तय होता है।",
  "One room class in the building. There is no cheaper room to move to.": "इमारत में एक ही तरह का कमरा है। सस्ते कमरे का विकल्प नहीं।",
  "Cheapest private room is nearly three times a 1%-of-sum-insured limit": "सबसे सस्ता प्राइवेट कमरा बीमा राशि की 1% सीमा का लगभग तीन गुना है",
  // Services
  "The cost model is not reachable.": "बिल अनुमान सेवा अभी उपलब्ध नहीं है।",
};

/** Screen text. Keys are the English exactly as written in the components. */
const HI: Record<string, string> = {
  // Shell
  "Your profile": "आपकी प्रोफ़ाइल",
  "Age {n}": "उम्र {n}",
  Done: "हो गया",
  "My plan": "मेरा प्लान",
  "Saved stays": "सहेजी गई भर्तियाँ",
  "kept from this browser": "इस ब्राउज़र से सहेजी गईं",
  "Questions asked": "पूछे गए सवाल",
  "to Ask ClaimCast": "ClaimCast से",
  "My hospital stays": "मेरी अस्पताल भर्तियाँ",
  "Nothing saved yet. Press “Save my session” at the top to keep a hospital stay here.":
    "अभी कुछ सहेजा नहीं गया। किसी भर्ती को यहाँ रखने के लिए ऊपर “मेरा सत्र सहेजें” दबाएँ।",
  "you pay": "आप देंगे",
  "Open any stay to see its path again, priced with today’s figures.": "किसी भी भर्ती को खोलकर उसका रास्ता आज के आंकड़ों के साथ फिर देखें।",
  Preferences: "पसंद",
  Language: "भाषा",
  Theme: "थीम",
  "Email sign-in": "ईमेल साइन-इन",
  "{n} saved stay is linked to this browser.": "{n} सहेजी गई भर्ती इस ब्राउज़र से जुड़ी है।",
  "{n} saved stays are linked to this browser.": "{n} सहेजी गई भर्तियाँ इस ब्राउज़र से जुड़ी हैं।",
  "Sign in with email to keep them if you switch devices.": "डिवाइस बदलने पर भी इन्हें रखने के लिए ईमेल से साइन इन करें।",
  "About you": "आपके बारे में",
  "Your insurance": "आपका बीमा",
  "Government schemes": "सरकारी योजनाएँ",
  "Your health": "आपकी सेहत",
  Review: "समीक्षा",
  "Step {a} of {b}": "चरण {a} / {b}",
  "Tell us about you": "हमें अपने बारे में बताएँ",
  "Only the age matters for the bill. Names are optional.": "बिल के लिए केवल उम्र मायने रखती है। नाम वैकल्पिक हैं।",
  "Which health insurance plan do you have?": "आपके पास कौन सा स्वास्थ्य बीमा प्लान है?",
  or: "या",
  "Can a government scheme help?": "क्या कोई सरकारी योजना मदद कर सकती है?",
  "These decide whether a scheme could pay for the stay instead.": "इनसे तय होता है कि क्या कोई योजना भर्ती का खर्च उठा सकती है।",
  "Policies wait a while before covering an illness you already had. We check that wait for you.":
    "पॉलिसी पहले से मौजूद बीमारी को कवर करने से पहले कुछ समय इंतज़ार करती है। हम आपके लिए यह जाँचते हैं।",
  "Here is where you stand": "आपकी स्थिति यह है",
  Edit: "बदलें",
  Back: "पीछे",
  Next: "आगे",
  "See my bill": "मेरा बिल देखें",
  Start: "शुरुआत",
  "The path": "रास्ता",
  "The working": "हिसाब",
  Database: "डेटाबेस",
  "What it has learned": "इसने क्या सीखा",
  "Family view": "परिवार के लिए",
  "Team view": "टीम के लिए",
  "For {name}": "{name} के लिए",
  "Sign in with email": "ईमेल से साइन इन करें",
  "Sign in": "साइन इन",
  "Sign out": "साइन आउट",
  Cancel: "रद्द करें",
  Email: "ईमेल",
  "Password, 10+ characters": "पासवर्ड, 10+ अक्षर",
  "Save my session": "मेरा सत्र सहेजें",
  "Saving…": "सहेजा जा रहा है…",
  "Saved {time} · save again": "{time} पर सहेजा गया · फिर से सहेजें",
  "Switch view": "व्यू बदलें",
  "Demo data only. Estimates, not guarantees. Not medical advice.": "केवल डेमो डेटा। अनुमान हैं, गारंटी नहीं। यह चिकित्सा सलाह नहीं है।",
  "Dark mode": "डार्क मोड",
  "Light mode": "लाइट मोड",
  // Login
  "Know what your hospital bill will cost you — before you are admitted.": "भर्ती होने से पहले जानिए कि अस्पताल का बिल आपको कितना पड़ेगा।",
  "Patient / Caregiver": "मरीज़ / देखभाल करने वाले",
  "Find out, before you are admitted, how much of the hospital bill your insurance will not pay — and which choices would lower it.":
    "भर्ती होने से पहले जानिए कि अस्पताल के बिल का कितना हिस्सा आपका बीमा नहीं देगा — और कौन से विकल्प इसे कम कर सकते हैं।",
  "Continue as user": "यूज़र के रूप में आगे बढ़ें",
  "ClaimCast team": "ClaimCast टीम",
  "See every saved session, the hospital and insurance data behind each figure, and how ClaimCast learns from every user it helps.":
    "हर सहेजा गया सत्र, हर आंकड़े के पीछे का अस्पताल और बीमा डेटा, और यह कि ClaimCast हर यूज़र से कैसे सीखता है — सब देखें।",
  "Continue as admin": "एडमिन के रूप में आगे बढ़ें",
  // Start
  "Your name": "आपका नाम",
  Optional: "वैकल्पिक",
  "Name on the policy": "पॉलिसी पर नाम",
  "Your health insurance plan": "आपका स्वास्थ्य बीमा प्लान",
  "Patient's age": "मरीज़ की उम्र",
  "Ayushman Bharat card at home?": "घर में आयुष्मान भारत कार्ड है?",
  "Central govt. employee or pensioner?": "केंद्र सरकार के कर्मचारी या पेंशनभोगी?",
  "Covered by ESI at work?": "काम पर ESI से कवर?",
  "Illness began before the policy?": "बीमारी पॉलिसी से पहले शुरू हुई?",
  Yes: "हाँ",
  No: "नहीं",
  "Your policy schedule": "आपकी पॉलिसी का विवरण",
  "Read from your PDF": "आपकी PDF से पढ़ा गया",
  "Sample plan for this demo": "इस डेमो के लिए नमूना प्लान",
  "Upload your policy document (PDF)": "अपना पॉलिसी दस्तावेज़ (PDF) अपलोड करें",
  "Click to choose the file. We read your limits from it for you to check. It is kept private and deleted after a few days.":
    "फ़ाइल चुनने के लिए क्लिक करें। हम उसमें से आपकी सीमाएँ पढ़ेंगे ताकि आप जाँच सकें। यह निजी रखी जाती है और कुछ दिनों बाद हटा दी जाती है।",
  "Reading {file}": "{file} पढ़ी जा रही है",
  "Reading your policy…": "आपकी पॉलिसी पढ़ी जा रही है…",
  "Each detail comes with the exact line it was found on, so you can check it.":
    "हर विवरण के साथ वह पंक्ति भी दिखेगी जहाँ वह मिला, ताकि आप जाँच सकें।",
  "Could not read the file": "फ़ाइल नहीं पढ़ी जा सकी",
  "Please check your plan's details below": "कृपया नीचे अपने प्लान का विवरण जाँचें",
  "Nothing we read from your document is used until you have checked it. If you fix something, ClaimCast learns to read that detail more carefully next time.":
    "आपके दस्तावेज़ से पढ़ी गई कोई भी जानकारी तब तक इस्तेमाल नहीं होती जब तक आप उसे जाँच न लें। अगर आप कुछ सुधारते हैं, तो ClaimCast अगली बार उस विवरण को और ध्यान से पढ़ना सीखता है।",
  "Your plan at a glance": "एक नज़र में आपका प्लान",
  "Confirm and continue": "पुष्टि करें और आगे बढ़ें",
  "Correct {n} field and continue": "{n} विवरण सुधारें और आगे बढ़ें",
  "Correct {n} fields and continue": "{n} विवरण सुधारें और आगे बढ़ें",
  "Please check what we read": "कृपया जाँचें कि हमने क्या पढ़ा",
  "We read {pages} pages of {file}. Next to each detail is the line we found it on — change anything that looks wrong.":
    "हमने {file} के {pages} पेज पढ़े। हर विवरण के पास वह पंक्ति है जहाँ वह मिला — जो गलत लगे उसे बदल दें।",
  "{n} detail could not be matched to a line in your document. It is marked below — please check it against your copy.":
    "{n} विवरण आपके दस्तावेज़ की किसी पंक्ति से मेल नहीं खा सका। उसे नीचे चिह्नित किया गया है — कृपया अपनी प्रति से जाँचें।",
  "{n} details could not be matched to a line in your document. They are marked below — please check them against your copy.":
    "{n} विवरण आपके दस्तावेज़ की किसी पंक्ति से मेल नहीं खा सके। उन्हें नीचे चिह्नित किया गया है — कृपया अपनी प्रति से जाँचें।",
  "page {n}": "पेज {n}",
  "please check this one": "कृपया इसे जाँचें",
  "not found in your document": "आपके दस्तावेज़ में नहीं मिला",
  "we read {v} — you changed it": "हमने {v} पढ़ा — आपने इसे बदला",
  "others often correct this one ({a} of {b} times) — worth a second look": "दूसरे लोग अक्सर इसे सुधारते हैं ({b} में से {a} बार) — एक बार फिर देख लें",
  "How many months you have had this cover": "आपके पास यह कवर कितने महीनों से है",
  "Your document shows this year's dates, not how long you have been insured without a break. Waiting periods depend on it, so please tell us.":
    "आपका दस्तावेज़ इस साल की तारीखें दिखाता है, यह नहीं कि आप बिना रुकावट कितने समय से बीमित हैं। प्रतीक्षा अवधि इसी पर निर्भर करती है, इसलिए कृपया बताएँ।",
  "Help ClaimCast improve: keep the lines I corrected as examples. Only the details you changed are kept.":
    "ClaimCast को बेहतर बनाने में मदद करें: मेरी सुधारी गई पंक्तियों को उदाहरण के रूप में रखें। केवल आपके बदले गए विवरण रखे जाते हैं।",
  "Leave it unticked and nothing from your document is kept — only a count of which details needed fixing, with nothing about you.":
    "इसे अनचेक छोड़ें तो आपके दस्तावेज़ से कुछ नहीं रखा जाता — केवल यह गिनती कि किन विवरणों को सुधारना पड़ा, आपके बारे में कुछ नहीं।",
  "Not stated": "नहीं बताया गया",
  Insurer: "बीमा कंपनी",
  Product: "प्लान",
  "Total cover per year": "प्रति वर्ष कुल कवर",
  "Room rent limit": "कमरे के किराए की सीमा",
  "Room limit (as % of cover)": "कमरे की सीमा (कवर का %)",
  "ICU limit": "ICU सीमा",
  "ICU limit (as % of cover)": "ICU सीमा (कवर का %)",
  "Cuts other charges if room is too costly": "महंगा कमरा लेने पर बाकी खर्चों में कटौती",
  "Co-payment": "को-पेमेंट (आपका हिस्सा)",
  "Limit on implants": "इम्प्लांट पर सीमा",
  "Covers costs before admission for": "भर्ती से पहले के खर्च कवर",
  "Covers costs after discharge for": "छुट्टी के बाद के खर्च कवर",
  "Short (day-care) procedures covered": "छोटी (डे-केयर) प्रक्रियाएँ कवर",
  "Wait before old illnesses are covered": "पुरानी बीमारियों के कवर से पहले इंतज़ार",
  "After this, claims cannot be disputed": "इसके बाद दावों पर विवाद नहीं हो सकता",
  "Not covered": "कवर नहीं",
  "Costs covered before / after the stay": "भर्ती से पहले / बाद के खर्च कवर",
  "{x} / day": "{x} / दिन",
  "{x} of sum insured": "बीमा राशि का {x}",
  "No limit": "कोई सीमा नहीं",
  None: "कोई नहीं",
  "No sub-limit": "कोई उप-सीमा नहीं",
  "{a} / {b} days": "{a} / {b} दिन",
  days: "दिन",
  months: "महीने",
  "₹ / day": "₹ / दिन",
  // Controls
  "Nights": "रातें",
  "In ICU": "ICU में",
  "Sum insured used": "पहले से इस्तेमाल बीमा राशि",
  Policy: "पॉलिसी",
  // Journey
  "As things stand, you pay": "अभी की स्थिति में, आप देंगे",
  "Insurer pays": "बीमा कंपनी देगी",
  Bill: "बिल",
  "The admission": "भर्ती",
  "{n} night": "{n} रात",
  "{n} nights": "{n} रातें",
  ", {n} in intensive care": ", {n} ICU में",
  "{x} sum insured": "{x} बीमा राशि",
  "Nothing is payable": "कुछ भी देय नहीं",
  "The claim fails before any deduction. The whole bill is the family’s.": "किसी कटौती से पहले ही दावा नामंज़ूर है। पूरा बिल परिवार को देना होगा।",
  "Refused whichever path you take": "आप कोई भी रास्ता चुनें, यह नहीं मिलेगा",
  "These come off the procedure, never off the room tariff. No cheaper bed and no other hospital moves them.":
    "ये इलाज से कटते हैं, कमरे के किराए से नहीं। सस्ता बिस्तर या दूसरा अस्पताल इन्हें नहीं बदलता।",
  "You pay": "आप देंगे",
  "{lo} – {hi} once the clinical bill is known, on the fitted spread. The insurer pays {paid} of {bill}.":
    "जब इलाज का असली बिल पता चलेगा तो {lo} – {hi} (मॉडल के अनुमान के अनुसार)। बीमा कंपनी {bill} में से {paid} देगी।",
  "{lo} – {hi} once the clinical bill is known, on the simulated spread. The insurer pays {paid} of {bill}.":
    "जब इलाज का असली बिल पता चलेगा तो {lo} – {hi} (नमूना अनुमान के अनुसार)। बीमा कंपनी {bill} में से {paid} देगी।",
  "Who pays for this admission": "इस भर्ती का खर्च कौन उठाएगा",
  "{way} would leave {x} to find, not {y}": "{way} से आपको {y} नहीं, बल्कि {x} देने होंगे",
  "The private policy is still the better of the paths open here": "यहाँ खुले रास्तों में निजी पॉलिसी अब भी बेहतर है",
  "One path per admission": "हर भर्ती के लिए एक ही रास्ता",
  "The rest of this tree follows the private claim.": "इस पेड़ का बाकी हिस्सा निजी दावे के अनुसार है।",
  "on this path": "इसी रास्ते पर",
  "no change": "कोई बदलाव नहीं",
  "under {x}": "{x} से कम",
  // Cost model
  "Asking the cost model for this admission…": "इस भर्ती के लिए बिल का अनुमान लिया जा रहा है…",
  "No modelled band": "कोई अनुमान सीमा नहीं",
  "The range above is the simulated private spread the reference set carries, which slide 5 declares as simulated. Nothing has been invented to fill the gap.":
    "ऊपर की सीमा संदर्भ डेटा का नमूना फैलाव है, जिसे स्लाइड 5 में नमूना बताया गया है। कमी भरने के लिए कुछ भी गढ़ा नहीं गया।",
  "What the whole bill is likely to be": "पूरा बिल संभवतः कितना होगा",
  "trained {d}": "प्रशिक्षित {d}",
  "tenth percentile": "10वाँ पर्सेंटाइल",
  median: "मध्य",
  ninetieth: "90वाँ",
  "Anchored on the {scheme} rate of": "आधार: {scheme} की दर",
  "Accreditation is not on the hospital record, so the rate is read at NABH.": "अस्पताल के रिकॉर्ड में मान्यता नहीं है, इसलिए NABH दर ली गई।",
  "Adjusted {f}× on {n} settled bills reported against earlier forecasts. Each one counted from the moment it was sent — the model behind this band is the same version it was before, and nothing was retrained.":
    "पिछले अनुमानों के मुकाबले बताए गए {n} असली बिलों के आधार पर {f}× समायोजित। हर बिल भेजते ही गिना गया — इस सीमा के पीछे का मॉडल वही संस्करण है, और कुछ भी दोबारा प्रशिक्षित नहीं हुआ।",
  "Room and board": "कमरा और भोजन",
  "Associated medical expenses": "संबंधित चिकित्सा खर्च",
  "Pharmacy, consumables and diagnostics": "दवाइयाँ, उपभोग्य सामग्री और जाँचें",
  Implant: "इम्प्लांट",
  "What is wrong with this estimate": "इस अनुमान की सीमाएँ",
  "Already had this admission? Tell us what it came to": "यह भर्ती हो चुकी है? हमें बताएँ कुल बिल कितना आया",
  "One number, and it improves the band for the next person asking about this procedure in this kind of city. It is stored against this forecast and nothing else — not your name, not your hospital, not your policy.":
    "बस एक आंकड़ा, और इससे अगले व्यक्ति के लिए ऐसे शहर में इस इलाज का अनुमान बेहतर होता है। यह केवल इस अनुमान के साथ रखा जाता है — आपका नाम, अस्पताल या पॉलिसी नहीं।",
  "What the admission actually came to": "भर्ती का असल कुल बिल",
  "Report it": "भेजें",
  "That did not reach the server. Nothing was recorded, and nothing else on this screen is affected.":
    "यह सर्वर तक नहीं पहुँचा। कुछ दर्ज नहीं हुआ, और इस स्क्रीन पर बाकी कुछ प्रभावित नहीं है।",
  "Recorded — thank you. {x} fell inside the band above. It is now one of the settled bills this model reads, and it counted from the moment you sent it: nothing was retrained, and nothing had to be.":
    "दर्ज हो गया — धन्यवाद। {x} ऊपर की सीमा के अंदर रहा। अब यह उन असली बिलों में से एक है जिन्हें यह मॉडल पढ़ता है, और यह भेजते ही गिना गया।",
  "Recorded — thank you. {x} fell outside the band above. It is now one of the settled bills this model reads, and it counted from the moment you sent it: nothing was retrained, and nothing had to be.":
    "दर्ज हो गया — धन्यवाद। {x} ऊपर की सीमा के बाहर रहा। अब यह उन असली बिलों में से एक है जिन्हें यह मॉडल पढ़ता है, और यह भेजते ही गिना गया।",
  // The working
  "{proc} at {hospital}, {city}. {product} from {insurer}.": "{hospital}, {city} में {proc}। {insurer} का {product}।",
  "Sum insured": "बीमा राशि",
  "Room limit": "कमरे की सीमा",
  none: "कोई नहीं",
  "Rent charged": "लिया गया किराया",
  "no room line": "कमरे की कोई लाइन नहीं",
  "Reduction ratio": "कटौती अनुपात",
  "Implant sub-limit": "इम्प्लांट उप-सीमा",
  "Reduction ratio {r}": "कटौती अनुपात {r}",
  "Every charge marked “room-linked” is paid at {p}% of what the hospital billed. Charges marked “not room-linked”, and intensive care, are left whole.":
    "“कमरे से जुड़ा” चिह्नित हर खर्च अस्पताल के बिल का केवल {p}% दिया जाता है। “कमरे से नहीं जुड़ा” चिह्नित खर्च और ICU पूरे रहते हैं।",
  "The bill": "बिल",
  "{n} lines": "{n} पंक्तियाँ",
  Line: "मद",
  "Treated as": "किस तरह गिना गया",
  Billed: "बिल राशि",
  Refused: "नामंज़ूर",
  Allowed: "मंज़ूर",
  room: "कमरा",
  "room-linked": "कमरे से जुड़ा",
  "intensive care": "ICU",
  "not room-linked": "कमरे से नहीं जुड़ा",
  "sub-limit": "उप-सीमा",
  "outside window": "समय-सीमा के बाहर",
  "List I": "सूची I",
  Settlement: "निपटान",
  "Cashless, pre-authorisation about {h} hours": "कैशलेस, लगभग {h} घंटे में पूर्व-अनुमति",
  "Reimbursement, about {d} days": "प्रतिपूर्ति, लगभग {d} दिन",
  "Hospital bill": "अस्पताल का बिल",
  Deductions: "कटौतियाँ",
  Admissible: "मंज़ूर राशि",
  "Co-payment at {p}": "{p} पर को-पेमेंट",
  "Above the sum insured": "बीमा राशि से ऊपर",
  "On this route the family pays {bill} at discharge and is repaid {x} about {d} days later.":
    "इस रास्ते पर परिवार छुट्टी के समय {bill} चुकाता है और लगभग {d} दिन बाद {x} वापस मिलते हैं।",
  "Every room class at {h}": "{h} में हर तरह का कमरा",
  "Room limit {x}": "कमरे की सीमा {x}",
  "This hospital has one room class.": "इस अस्पताल में एक ही तरह का कमरा है।",
  "Every hospital in the set": "सूची के सभी अस्पताल",
  "Same room class where they stock it, nearest by tariff where they do not": "जहाँ उपलब्ध हो वही कमरा, वरना किराए में सबसे नज़दीकी",
  "Every device on offer": "उपलब्ध सभी इम्प्लांट",
  "Implant sub-limit {x}": "इम्प्लांट उप-सीमा {x}",
  Option: "विकल्प",
  "Against now": "अभी के मुकाबले",
  current: "मौजूदा",
  "no cashless": "कैशलेस नहीं",
  // Chat
  "Ask ClaimCast": "ClaimCast से पूछें",
  "Ask about this admission": "इस भर्ती के बारे में पूछें",
  " · your uploaded policy": " · आपकी अपलोड की गई पॉलिसी",
  "Ask anything about your bill. Amounts come straight from ClaimCast’s calculation, never guessed. We only help with money — please ask your doctor about treatment.":
    "अपने बिल के बारे में कुछ भी पूछें। रकम सीधे ClaimCast के हिसाब से आती है, अंदाज़े से नहीं। हम केवल पैसों में मदद करते हैं — इलाज के बारे में अपने डॉक्टर से पूछें।",
  "Ask anything about your bill or your policy. Amounts come straight from ClaimCast’s calculation, never guessed. We only help with money — please ask your doctor about treatment.":
    "अपने बिल या पॉलिसी के बारे में कुछ भी पूछें। रकम सीधे ClaimCast के हिसाब से आती है, अंदाज़े से नहीं। हम केवल पैसों में मदद करते हैं — इलाज के बारे में अपने डॉक्टर से पूछें।",
  "Why do I pay this much?": "मुझे इतना क्यों देना पड़ रहा है?",
  "What would a cheaper room save me?": "सस्ता कमरा लेने से कितनी बचत होगी?",
  "Which charges won’t be paid, whatever I choose?": "कौन से खर्च कुछ भी चुनूँ, नहीं मिलेंगे?",
  "Can a government scheme help us?": "क्या कोई सरकारी योजना हमारी मदद कर सकती है?",
  "Working it out…": "हिसाब लगाया जा रहा है…",
  "Type your question…": "अपना सवाल लिखें…",
  Ask: "पूछें",
  Close: "बंद करें",
  "No answer came back.": "कोई जवाब नहीं आया।",
  "Please ignore {x} — that amount is not from ClaimCast’s calculation.": "कृपया {x} को नज़रअंदाज़ करें — यह रकम ClaimCast के हिसाब से नहीं है।",
  "Please ignore {x} — those amounts are not from ClaimCast’s calculation.": "कृपया {x} को नज़रअंदाज़ करें — ये रकमें ClaimCast के हिसाब से नहीं हैं।",
  "Where this comes from": "यह जानकारी कहाँ से आई",
  "could not be found in your document": "आपके दस्तावेज़ में नहीं मिला",
  "Learned from {n} similar question other families asked": "दूसरे परिवारों के {n} मिलते-जुलते सवाल से सीखा",
  "Learned from {n} similar questions other families asked": "दूसरे परिवारों के {n} मिलते-जुलते सवालों से सीखा",
  "The server is not reachable.": "सर्वर तक नहीं पहुँच पा रहे।",
  // Admin: database
  "What ClaimCast knows": "ClaimCast क्या जानता है",
  "The data behind every figure the family sees": "परिवार जो भी आंकड़ा देखता है, उसके पीछे का डेटा",
  Hospitals: "अस्पताल",
  Treatments: "इलाज",
  "Insurance plans": "बीमा प्लान",
  "Never covered": "कभी कवर नहीं",
  Rules: "नियम",
  "Past admissions": "पिछली भर्तियाँ",
  "No past admissions recorded yet. We do not fill this table with made-up patients — rows appear here only when real claims are settled. The families who used ClaimCast are listed above, under Saved sessions.":
    "अभी कोई पिछली भर्ती दर्ज नहीं है। हम यह तालिका नकली मरीज़ों से नहीं भरते — असली दावे निपटने पर ही पंक्तियाँ यहाँ आती हैं। ClaimCast इस्तेमाल करने वाले परिवार ऊपर ‘सहेजे गए सत्र’ में हैं।",
  "{n} settled admissions from this deployment. Open any row to see it as the family would.": "इस सिस्टम से {n} निपटी हुई भर्तियाँ। किसी भी पंक्ति को खोलकर परिवार की तरह देखें।",
  "Room prices are per day. “Clinical” shows how expensive the hospital’s treatment charges are compared with a big-city private hospital (1.00).":
    "कमरे का किराया प्रति दिन है। “क्लिनिकल” बताता है कि अस्पताल के इलाज के खर्च बड़े शहर के निजी अस्पताल (1.00) के मुकाबले कितने महंगे हैं।",
  Hospital: "अस्पताल",
  "Price tier": "मूल्य टियर",
  General: "जनरल",
  ICU: "ICU",
  Clinical: "क्लिनिकल",
  "Refund takes": "वापसी में समय",
  "{n} beds": "{n} बिस्तर",
  "cashless with {n} insurer": "{n} बीमा कंपनी के साथ कैशलेस",
  "cashless with {n} insurers": "{n} बीमा कंपनियों के साथ कैशलेस",
  "no cashless insurers": "कोई कैशलेस बीमा कंपनी नहीं",
  "accepts Ayushman Bharat": "आयुष्मान भारत स्वीकार",
  "accepts ESI": "ESI स्वीकार",
  "{n} d": "{n} दिन",
  Treatment: "इलाज",
  Code: "कोड",
  "Govt. rate (PM-JAY)": "सरकारी दर (PM-JAY)",
  "Govt. rate (CGHS)": "सरकारी दर (CGHS)",
  "Private hospitals": "निजी अस्पताल",
  Stay: "भर्ती अवधि",
  "Sample plans with invented names, built from the limits real Indian policies use.": "काल्पनिक नामों वाले नमूना प्लान, जो असली भारतीय पॉलिसियों की सीमाओं पर बने हैं।",
  Plan: "प्लान",
  Cover: "कवर",
  "Co-pay": "को-पे",
  "Cuts other charges": "बाकी खर्चों में कटौती",
  yes: "हाँ",
  "The insurance regulator (IRDAI) keeps four lists of items. Only the first — things no policy ever pays for — ends up on the family’s bill.":
    "बीमा नियामक (IRDAI) सामानों की चार सूचियाँ रखता है। केवल पहली सूची — जिनका भुगतान कोई पॉलिसी नहीं करती — परिवार के बिल में आती है।",
  "Items no policy pays for": "जिन चीज़ों का भुगतान कोई पॉलिसी नहीं करती",
  "{n} items · {x} on a five-day metro admission": "{n} सामान · महानगर में पाँच दिन की भर्ती पर {x}",
  Item: "सामान",
  Group: "समूह",
  Typical: "आम तौर पर",
  "No choice of hospital, room or plan changes these.": "अस्पताल, कमरे या प्लान का कोई भी चुनाव इन्हें नहीं बदलता।",
  "Every amount ClaimCast says will not be paid points to one of these rules.": "ClaimCast जो भी रकम ‘नहीं मिलेगी’ बताता है, वह इन्हीं में से किसी नियम पर आधारित है।",
  "No.": "क्र.",
  "Family pays": "परिवार देगा",
  "Room cut": "कमरा कटौती",
  refused: "नामंज़ूर",
  ", {n} in ICU": ", {n} ICU में",
  "{n} day": "{n} दिन",
  "{n} days": "{n} दिन",
  "day-care listed": "डे-केयर सूची में",
  implant: "इम्प्लांट",
  "in force {a} months · pre-existing wait {b} months": "{a} महीने से चालू · पुरानी बीमारी की प्रतीक्षा {b} महीने",
  "past moratorium": "मोरेटोरियम अवधि पूरी",
  no: "नहीं",
  "Public reference rates beside the private spread. Codes follow the NHA and CGHS registries; values are illustrative.":
    "सरकारी संदर्भ दरें, निजी अस्पतालों के खर्च के साथ। कोड NHA और CGHS रजिस्ट्री के अनुसार हैं; मूल्य उदाहरण के लिए हैं।",
  reimbursement: "प्रतिपूर्ति",
  "Day-care procedures": "डे-केयर प्रक्रियाएँ",
  "ICU limit as % of sum insured": "ICU सीमा (बीमा राशि का %)",
  "Room limit as % of sum insured": "कमरे की सीमा (बीमा राशि का %)",
  "Months the cover has run": "कवर कितने महीने से चल रहा है",
  Moratorium: "मोरेटोरियम अवधि",
  "Post-hospitalisation window": "छुट्टी के बाद की अवधि",
  "Pre-hospitalisation window": "भर्ती से पहले की अवधि",
  "Pre-existing disease waiting": "पुरानी बीमारी की प्रतीक्षा",
  "Proportionate deduction": "अनुपातिक कटौती",
  // Admin: saved sessions
  "Saved sessions": "सहेजे गए सत्र",
  "{n} family": "{n} परिवार",
  "{n} families": "{n} परिवार",
  Refresh: "रीफ़्रेश",
  "Reading saved sessions…": "सहेजे गए सत्र पढ़े जा रहे हैं…",
  "The server did not answer.": "सर्वर ने जवाब नहीं दिया।",
  "No saved sessions yet. When a family presses “Save my session”, their details, their hospital stay, what ClaimCast worked out and their chat appear here.":
    "अभी कोई सहेजा गया सत्र नहीं है। जब कोई परिवार “मेरा सत्र सहेजें” दबाता है, तो उनका विवरण, अस्पताल भर्ती, ClaimCast का हिसाब और उनकी बातचीत यहाँ दिखती है।",
  Unnamed: "बिना नाम",
  " · own policy uploaded": " · अपनी पॉलिसी अपलोड की",
  pays: "देगा",
  of: "में से",
  "{n} question asked": "{n} सवाल पूछा",
  "{n} questions asked": "{n} सवाल पूछे",
  "Loading…": "लोड हो रहा है…",
  Family: "परिवार",
  "(policy in the name of {x})": "(पॉलिसी {x} के नाम पर)",
  "Hospital stay": "अस्पताल भर्ती",
  "{proc}, {hospital}, {city}, {room} room, {n} nights": "{proc}, {hospital}, {city}, {room} कमरा, {n} रातें",
  "What ClaimCast worked out": "ClaimCast का हिसाब",
  "Bill {bill} · insurance pays {paid} · family pays": "बिल {bill} · बीमा देगा {paid} · परिवार देगा",
  "Not paid by insurance, and why": "बीमा ने क्या नहीं दिया, और क्यों",
  "Nothing refused.": "कुछ भी नामंज़ूर नहीं।",
  "Questions they asked": "उन्होंने क्या पूछा",
  "No questions asked.": "कोई सवाल नहीं पूछा।",
  "Contained an unchecked amount ({x}), so it is not remembered": "इसमें एक बिना जाँची रकम ({x}) थी, इसलिए यह याद नहीं रखा गया",
  "See it as the family saw it →": "परिवार की तरह देखें →",
  // Admin: learning
  "Not reachable": "उपलब्ध नहीं",
  "Could not reach the server. The family’s screens are not affected.": "सर्वर तक नहीं पहुँच सके। परिवार की स्क्रीनों पर असर नहीं।",
  "How ClaimCast learns from families": "ClaimCast परिवारों से कैसे सीखता है",
  "Updates as people use it": "इस्तेमाल के साथ अपडेट होता है",
  "Every time a family uses ClaimCast, it learns something. These counts go up as soon as it happens — the very next family benefits.":
    "हर बार जब कोई परिवार ClaimCast इस्तेमाल करता है, यह कुछ सीखता है। ये गिनतियाँ तुरंत बढ़ती हैं — अगले ही परिवार को फ़ायदा होता है।",
  "Policy details checked": "जाँचे गए पॉलिसी विवरण",
  "Families checked the details ClaimCast read from their policy document. Each fix teaches it which details to read more carefully.":
    "परिवारों ने वे विवरण जाँचे जो ClaimCast ने उनकी पॉलिसी से पढ़े। हर सुधार सिखाता है कि किन विवरणों को ज़्यादा ध्यान से पढ़ना है।",
  "Final bills shared": "साझा किए गए असली बिल",
  "Families told us what their hospital bill finally came to. This is how ClaimCast finds out whether its estimates were right.":
    "परिवारों ने बताया कि अस्पताल का बिल आखिर कितना आया। इसी से ClaimCast जानता है कि उसके अनुमान सही थे या नहीं।",
  "Choices made": "किए गए चुनाव",
  "Which hospital, room or option families picked on their path. It helps decide which options to show first.":
    "परिवारों ने अपने रास्ते पर कौन सा अस्पताल, कमरा या विकल्प चुना। इससे तय होता है कि पहले कौन से विकल्प दिखाएँ।",
  "The chat assistant’s memory": "चैट सहायक की याददाश्त",
  "Grows with every saved session": "हर सहेजे गए सत्र के साथ बढ़ती है",
  "When a family saves their session, their questions and the answers they got are remembered. When someone asks something similar later, the assistant looks back at how it was explained before — so it keeps getting better at what families actually ask. The rupee amounts always come from the new family’s own bill, never from someone else’s.":
    "जब कोई परिवार अपना सत्र सहेजता है, तो उनके सवाल और मिले जवाब याद रखे जाते हैं। बाद में कोई मिलता-जुलता सवाल पूछे, तो सहायक देखता है कि पहले कैसे समझाया गया था — इसलिए यह परिवारों के असली सवालों में बेहतर होता जाता है। रकम हमेशा नए परिवार के अपने बिल से आती है, किसी और के बिल से नहीं।",
  "Families who pressed “Save my session”. You can see each one on the Database tab.": "जिन परिवारों ने “मेरा सत्र सहेजें” दबाया। हर एक को डेटाबेस टैब पर देख सकते हैं।",
  "Answers remembered": "याद रखे गए जवाब",
  "Past answers the assistant can look back on. Answers containing a wrong amount are left out.": "पुराने जवाब जिन्हें सहायक देख सकता है। गलत रकम वाले जवाब छोड़ दिए जाते हैं।",
  "The bill estimator": "बिल अनुमानक",
  "Not connected": "जुड़ा नहीं है",
  "The bill estimator is not running right now, so its learning progress cannot be shown.": "बिल अनुमानक अभी नहीं चल रहा, इसलिए उसकी सीखने की प्रगति नहीं दिखाई जा सकती।",
  "The bill estimator teaches itself": "बिल अनुमानक खुद सीखता है",
  "Machine learning model (XGBoost)": "मशीन लर्निंग मॉडल (XGBoost)",
  "ClaimCast estimates a hospital bill using a machine learning model trained on every government price list for treatments in India. When families share their final bills, it learns from them: after every {n} new bills, it retrains itself on everything it knows and starts using the improved version straight away.":
    "ClaimCast अस्पताल के बिल का अनुमान एक मशीन लर्निंग मॉडल से लगाता है, जो भारत में इलाज की हर सरकारी मूल्य सूची पर प्रशिक्षित है। जब परिवार अपने असली बिल साझा करते हैं, यह उनसे सीखता है: हर {n} नए बिलों के बाद यह सब कुछ दोबारा सीखकर तुरंत बेहतर संस्करण इस्तेमाल करने लगता है।",
  "Real bills learned from": "जिन असली बिलों से सीखा",
  "Current version {v}, trained on {rows} government prices plus these bills.": "मौजूदा संस्करण {v}, {rows} सरकारी दरों और इन बिलों पर प्रशिक्षित।",
  "New bills waiting": "इंतज़ार में नए बिल",
  "Enough new bills are in — it retrains with the next one.": "पर्याप्त नए बिल आ गए — अगले बिल के साथ यह दोबारा सीखेगा।",
  "{n} more bill and it retrains itself.": "{n} और बिल, फिर यह खुद दोबारा सीखेगा।",
  "{n} more bills and it retrains itself.": "{n} और बिल, फिर यह खुद दोबारा सीखेगा।",
  "Accuracy check, %": "सटीकता जाँच, %",
  "Tested on prices it had not seen: {p}% fell inside its predicted range, as designed (target 80%).":
    "जिन दरों को इसने नहीं देखा था उन पर जाँचा गया: {p}% इसकी अनुमानित सीमा के अंदर रहीं, जैसा तय था (लक्ष्य 80%)।",
  "Policy details that are often misread": "पॉलिसी के वे विवरण जो अक्सर गलत पढ़े जाते हैं",
  "None checked yet": "अभी कोई जाँच नहीं",
  "{a} fixed out of {b} checked": "{b} जाँचों में से {a} सुधारे गए",
  "No family has checked an uploaded policy yet. Once they do, the details that most often need fixing will show up here.":
    "अभी तक किसी परिवार ने अपलोड की गई पॉलिसी नहीं जाँची। ऐसा होने पर, सबसे ज़्यादा सुधारे जाने वाले विवरण यहाँ दिखेंगे।",
  "The details at the top are the ones families fix most often. ClaimCast now warns the next family to double-check those details when they upload their policy.":
    "ऊपर वाले विवरण परिवार सबसे ज़्यादा सुधारते हैं। अब ClaimCast अगले परिवार को पॉलिसी अपलोड करते समय इन्हें दोबारा जाँचने की चेतावनी देता है।",
  "{a} of {b} could not be matched to the document": "{b} में से {a} दस्तावेज़ से मेल नहीं खाए",
  "Privacy: we keep counts, not documents. A family’s policy wording is kept only if they ticked the box to share it, and choices on the path are never linked to a person.":
    "गोपनीयता: हम गिनती रखते हैं, दस्तावेज़ नहीं। किसी परिवार की पॉलिसी के शब्द तभी रखे जाते हैं जब उन्होंने साझा करने का बॉक्स चुना हो, और रास्ते के चुनाव किसी व्यक्ति से नहीं जोड़े जाते।",
};
