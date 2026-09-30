# -*- coding: utf-8 -*-
"""
Presenter notes for the ClaimCast pitch deck, as a PDF: one section per
slide (what it says, how to explain it, where the numbers come from, the
short forms on it), then a glossary of every abbreviation in the deck.

    python src/build_notes.py  ->  presentation deck/ClaimCast - Presenter Notes.pdf
"""
import os

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "presentation deck", "ClaimCast - Presenter Notes.pdf")

# Georgia carries the ₹ sign; the built-in PDF fonts do not.
SUP = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("G", SUP + "Georgia.ttf"))
pdfmetrics.registerFont(TTFont("G-B", SUP + "Georgia Bold.ttf"))
pdfmetrics.registerFont(TTFont("G-I", SUP + "Georgia Italic.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily  # noqa: E402
registerFontFamily("G", normal="G", bold="G-B", italic="G-I", boldItalic="G-B")

BLUE, INK, MUTE, PALE = HexColor("#005EB8"), HexColor("#14181C"), HexColor("#5F6872"), HexColor("#E8F1FA")
H1 = ParagraphStyle("h1", fontName="G-B", fontSize=24, leading=29, textColor=INK, spaceAfter=6)
SUB = ParagraphStyle("sub", fontName="G", fontSize=11.5, leading=16, textColor=MUTE, spaceAfter=14)
H2 = ParagraphStyle("h2", fontName="G-B", fontSize=16, leading=21, textColor=BLUE, spaceBefore=4, spaceAfter=6)
H3 = ParagraphStyle("h3", fontName="G-B", fontSize=10.5, leading=14, textColor=INK, spaceBefore=8, spaceAfter=3)
BODY = ParagraphStyle("b", fontName="G", fontSize=10.5, leading=15.5, textColor=INK, alignment=TA_LEFT, spaceAfter=4)
BUL = ParagraphStyle("bul", parent=BODY, leftIndent=12, bulletIndent=2, spaceAfter=2)
SMALL = ParagraphStyle("s", fontName="G", fontSize=9.5, leading=13.5, textColor=MUTE)


def bullets(items):
    return [Paragraph(i, BUL, bulletText="•") for i in items]


SLIDES = [
    ("Title — ClaimCast", {
        "says": "Who we are and the one-line promise: know what your hospital bill will cost you before you are "
                "admitted, not after you are discharged. It names the challenge track we entered.",
        "explain": ["Open with the problem in one breath: families find out what insurance refused only after "
                    "discharge, when nothing can be changed.",
                    "ClaimCast moves that moment to before admission, while choices are still open."],
        "abbr": ["<b>GE HealthCare</b> — the company running the challenge.",
                 "<b>IIIT-Delhi</b> — Indraprastha Institute of Information Technology, Delhi."],
    }),
    ("Slide 2 — The problem", {
        "says": "Insurance can refuse a large part of a hospital bill, and families decide the things that cause it "
                "(which room, which hospital) in minutes, without reading the policy.",
        "explain": ["<b>The room-rent trap.</b> A policy pays room rent up to a limit, e.g. ₹5,000 a day. If the "
                    "family takes a ₹10,000 room, the insurer does not just refuse the extra ₹5,000 a day — it also "
                    "cuts every charge that is priced by room category (surgeon, operation theatre, nursing) by the "
                    "same ratio, here 5,000 ÷ 10,000 = half. This is called <i>proportionate deduction</i>.",
                    "“50% of a bill can be refused” is the worst case of that rule; how much applies depends on the "
                    "policy wording. Say “up to”.",
                    "₹39,085 and ₹3.31 lakh show how much cancer patients in India pay from their own pocket — "
                    "real money that surprises families.",
                    "The last box: surprise bills push families into debt and make people stop treatment midway."],
        "numbers": ["Proportionate deduction rule: IRDAI circular IRDAI/HLT/REG/CIR/151/06/2020 (11 June 2020).",
                    "₹39,085 per cancer hospital stay and ₹3.31 lakh per patient per year: Prinja et al., "
                    "<i>Frontiers in Public Health</i>, 2023, a 12,148-patient study.",
                    "Stopping treatment: CROCODILE study, <i>Lancet Regional Health – Southeast Asia</i>, 2022."],
        "abbr": ["<b>IRDAI</b> — Insurance Regulatory and Development Authority of India, the insurance regulator.",
                 "<b>₹3.31 L</b> — 3.31 lakh rupees (1 lakh = 1,00,000).",
                 "<b>SE Asia</b> — Southeast Asia."],
    }),
    ("Slide 3 — What ClaimCast does", {
        "says": "ClaimCast runs the same calculation the insurer runs after discharge, but before admission, in "
                "three steps, and shows what each choice would cost the family.",
        "explain": ["<b>Tell us</b> — who the patient is and the family, the insurance plan (the policy PDF can be "
                    "uploaded: ClaimCast reads it and the family checks every detail), any government scheme, and "
                    "optionally a health report or prescription.",
                    "<b>See every choice</b> — hospital, room, implant, cashless or refund, and where to have each "
                    "scan, each with the rupee amount the family would pay.",
                    "<b>Understand the bill</b> — every rupee the insurance will not pay, line by line, with the rule "
                    "behind it; questions can be typed or spoken, in English or Hindi.",
                    "The example: the same spine surgery costs the family ₹1,26,900 in a private room but ₹48,500 "
                    "in a semi-private one — ₹78,400 kept just by choosing the bed with the room limit in mind."],
        "numbers": ["The example is the prototype's reference case: Meridian Institute (New Delhi), 5 nights, "
                    "Health Shield Classic with ₹5 lakh cover and a ₹5,000-a-day room limit. The figures come from "
                    "the ClaimCast engine and are checked by an automated test. Hospital, insurer and patient are "
                    "made up."],
        "abbr": ["<b>PDF</b> — Portable Document Format, the usual file type for a policy document.",
                 "<b>Cashless</b> — the insurer pays the hospital directly. <b>Refund / reimbursement</b> — the "
                 "family pays first and is paid back later."],
    }),
    ("Slide 4 — How it works: the family's path and the team's", {
        "says": "The pipeline of the working prototype: the seven screens a family goes through, the shared core, "
                "and the four screens the ClaimCast team uses.",
        "explain": ["<b>Family side.</b> 1 Log in as Patient / Caregiver (language and theme buttons are on every "
                    "page). 2 Start: a five-step wizard — About you (with family members), Your insurance, "
                    "Government schemes, Your health, Review. 3 “Estimate my bill” opens the path; with a health "
                    "report, its plan is shown first. 4 The path: every choice priced, a ‘None’ option for the "
                    "treatment and for the policy, the likely bill range from the ML model, and a form to share the "
                    "final bill. 5 The working: the bill line by line and cheaper options. 6 Ask ClaimCast. "
                    "7 Save my session (each person gets a unique ID; the Profile keeps stays and family).",
                    "<b>Shared core.</b> One rule-based money engine (the same code runs in the browser and on the "
                    "server), a PostgreSQL database, the XGBoost bill estimator, and the AI readers.",
                    "<b>Team side.</b> Log in as ClaimCast team (no password in the demo), Saved sessions (search "
                    "by name, hospital, diagnosis or ID), What ClaimCast knows (all reference data with sources), "
                    "What it has learned (the learning counters and the estimator's retraining)."],
        "abbr": ["<b>ML</b> — machine learning.",
                 "<b>PostgreSQL</b> — the open-source database that stores sessions, people and reference data."],
    }),
    ("Slide 5 — Built around the whole family", {
        "says": "Two features for families: one profile for the whole family where every person has a unique ID, "
                "and turning a health report into a costed plan.",
        "explain": ["<b>Family branch.</b> Start to About you asks for your name and age, the patient's name and age "
                    "(with a “The patient is me” shortcut), the name on the policy, and any number of family "
                    "members (husband, wife, son, daughter, father, mother, other) with the + Add button.",
                    "<b>Unique IDs.</b> When the session is saved, the server gives every person a UUID and keeps "
                    "it on later saves. Two sons both called Ravi get two IDs. An ID copied from another session, or "
                    "sent twice, is replaced. The IDs appear in Profile to My family and in the team's Database, "
                    "which can be searched by ID. The four IDs on the slide are real ones from a test save.",
                    "<b>Health report to plan.</b> On Start to Your health, upload a PDF or photo, or type the report. "
                    "It is read once and not stored. The diagnosis, tests, surgery and medicines are each quoted from "
                    "the report and the quote is checked. Scans are matched to CGHS test codes and the surgery to its "
                    "PM-JAY package; the family confirms or fixes. The path then opens with a recommendation, each "
                    "scan at every hospital, the surgery at every hospital, and who pays.",
                    "<b>Example.</b> A 68-year-old with a broken ankle on Health Shield Classic: X-ray, MRI, blood "
                    "tests and ECG, then ankle fixation. Cheapest overall: Navjeevan District Hospital, Rewa, about "
                    "₹9,300 for the family; the same at Meridian, Delhi: ₹53,600.",
                    "<b>Show it live</b> with the specimen pack: upload Senior Shield 60+ (Sita Kumar's policy) on Your "
                    "insurance and the Navjeevan X-ray bill on Your health. The figures then follow her policy's 20% "
                    "co-payment rather than the slide's example (see “The specimen documents pack” below)."],
        "numbers": ["Scan prices are ClaimCast estimates: about twice the CGHS rate, adjusted for each hospital's "
                    "cost level and never below the CGHS rate; the site shows them as “about”.",
                    "Who pays a scan: ESI at hospitals with an ESIC tie-up; CGHS at empanelled centres; PM-JAY only "
                    "inside the surgery package at the same hospital; the policy as pre-hospitalisation cost within "
                    "its window (30 days for Health Shield Classic)."],
        "abbr": ["<b>UUID</b> — universally unique identifier, a 36-character ID that is never repeated.",
                 "<b>ORIF</b> — open reduction and internal fixation: surgery that fixes a broken bone with plates "
                 "and screws.",
                 "<b>MRI / ECG / CBC</b> — magnetic resonance imaging scan / electrocardiogram (heart trace) / "
                 "complete blood count."],
    }),
    ("Slide 6 — The AI inside", {
        "says": "Where language models are used, which ones, what they are given, and how code checks what they "
                "return. The rule: AI reads and explains; it never works out a rupee.",
        "explain": ["<b>Reading the policy PDF</b> — Gemini 2.5 Pro on Google's Vertex AI in the cloud version (Groq "
                    "and Llama 3.3 70B as fallbacks). It gets the PDF, the passages a TF-IDF search finds for each "
                    "detail, and past corrections if families agreed to share them. It returns 17 details, each with "
                    "the sentence and page it came from; code looks for every quote in the PDF's own text, and the "
                    "family confirms each detail.",
                    "<b>Ask ClaimCast</b> — Llama 3.3 70B via OpenRouter. It gets the engine's numbered facts, "
                    "health-report facts, passages from the uploaded policy and the three most similar past answers. "
                    "Every rupee figure in its answer must match an engine fact or a checked quote; anything else is "
                    "flagged on screen.",
                    "<b>Reading a health report</b> — the same Llama model; a photo or scanned PDF is first "
                    "transcribed by Gemini 2.5 Flash. Quotes are checked, tests are matched to CGHS codes by fixed "
                    "rules, and keyword rules take over if no model is available.",
                    "<b>Not AI, on purpose</b> — the money engine, the XGBoost bill-range model, and the browser's "
                    "own speech features for voice in and read-aloud."],
        "abbr": ["<b>LLM</b> — large language model.",
                 "<b>TF-IDF</b> — term frequency–inverse document frequency, a simple word-matching search.",
                 "<b>Vertex AI / OpenRouter / Groq</b> — cloud services that run AI models.",
                 "<b>Gemini</b> — Google's AI models. <b>Llama</b> — Meta's open AI models."],
    }),
    ("Slide 7 — Self-learning, checked on the running system", {
        "says": "What learns, how, and the proof: a live test on the running prototype, plus automated tests "
                "against a real database.",
        "explain": ["<b>1 · Final bills teach the bill estimator.</b> On 29 Sep 2026 we reported ten ankle-surgery bills "
                    "about 60% above the estimate. The middle estimate went from ₹83,881 to ₹92,336 after five bills "
                    "(each new bill corrects it straight away), and when ten new bills were in, the XGBoost model "
                    "retrained itself into a new version (2026-09-29.1 to 2026-09-29.2) with no one pressing a "
                    "button. The test bills were deleted afterwards.",
                    "<b>2 · Policy fixes teach the PDF reader.</b> A detail checked at least 3 times and corrected in at "
                    "least a quarter of them gets a warning for the next family. Corrections the family agreed to "
                    "share are shown to the AI as worked examples when it reads the next policy.",
                    "<b>3 · Saved chats become the chat's memory.</b> The three most similar remembered answers guide how a "
                    "new question is explained. Answers that contained a wrong figure are never remembered, and "
                    "figures always come from the new family's bill.",
                    "<b>4 · Choices on the path are only counted.</b> Which options families pick is counted for the team; it changes no "
                    "figure. Be clear about this if asked.",
                    "<b>What does not learn:</b> the AI models' weights and the money rules, by design."],
        "numbers": ["One older bill already in the database made the tenth; the service dropped one unusable row "
                    "and trained on nine. Retrain threshold: 10 bills (RETRAIN_EVERY)."],
    }),
    ("Slide 8 — User study", {
        "says": "Three questions we asked of the design — is it easy, is it open to everyone, does it change a "
                "decision — what we have done for each, and the study with real families we plan next.",
        "explain": ["<b>Be clear with the judges:</b> the three columns are our own design review and the changes we "
                    "made. No study with real families has been run yet; the blue box is the plan.",
                    "Usability: Start is five short steps with a Review; the answer comes first; insurance words "
                    "replaced (“When did this illness begin?”).",
                    "Accessibility: English and Hindi on every page, voice questions in either language, answers read "
                    "aloud, high contrast, large figures, light and dark themes.",
                    "Purpose: every choice shows what it saves; a health report becomes the cheapest place for each "
                    "scan and the surgery.",
                    "The plan: 20 caregivers at a hospital admission desk, three tasks, and a usability score "
                    "target of 70 or more out of 100."],
        "abbr": ["<b>SUS</b> — System Usability Scale, a standard 10-question survey scored 0–100; about 68 is "
                 "average, 70+ is considered good."],
    }),
    ("Slide 9 — User personas", {
        "says": "Five design personas and the feature built for each. They are not study participants.",
        "explain": ["<b>A · The chatbox — Rohit, 34.</b> Asks what the screen does not show (“two days in ICU?”). "
                    "Ask ClaimCast answers from the engine's figures, keeps the conversation, and says when it does "
                    "not know.",
                    "<b>B · Hindi and voice — Kamla, 45, cannot read.</b> One tap on the Hindi button, speaks her question into "
                    "the chat's mic in Hindi, hears the answer read aloud; the Ayushman card is asked about in Start.",
                    "<b>C · Transparency — Mr Sharma, 58, suspicious.</b> Every cut on The working names its rule; "
                    "quotes from his own policy PDF are checked with page numbers; any AI figure not from the engine "
                    "is flagged.",
                    "<b>D · Audio answers — Arjun, 29, blind.</b> “Read answers aloud”, a Listen button on each "
                    "answer, spoken questions, and screen-reader updates; ₹ is read as “rupees”.",
                    "<b>E · Family analysis — Meena, 42, family floater.</b> Every member with an ID; the patient "
                    "separate from the policyholder; “Sum insured used” on the path accounts for what other members "
                    "already claimed this year; age 70+ unlocks Vay Vandana.",
                    "The WHERE line on each card is where to show it in a live demo. Documents from the specimen "
                    "pack that fit each persona: C, any policy PDF (every quote is checked with its page); E, the "
                    "Parivar Floater with Savitri Sharma's Vay Vandana summary and knee X-ray bill; A, B and D, ask "
                    "about any of them in the chat, by typing, in Hindi, or by voice."],
        "abbr": ["<b>Family floater</b> — one policy whose sum insured is shared by the whole family.",
                 "<b>Screen reader</b> — software that reads the screen aloud for blind users."],
    }),
    ("Slide 10 — Who it helps: every income group", {
        "says": "Hospital costs hit every income group, and ClaimCast helps each one in a different way.",
        "explain": ["<b>The chart:</b> India's households are split into five equal groups by how much they spend, "
                    "from the poorest 20% to the richest 20%. Each pair of bars is the average amount one stay in a "
                    "<i>private</i> hospital cost that group — dark blue for cities, light blue for villages — in "
                    "today's rupees.",
                    "<b>What to point out:</b> even the poorest fifth pays about ₹35,000–38,000 for one private "
                    "hospital stay, and the richest pay about ₹81,000 in cities. A private stay costs about 7 times "
                    "a government one. So a surprise refusal matters to everyone, and most of all to families with "
                    "the least money.",
                    "<b>Why it is relevant:</b> it answers “who needs this?” with national data, and the five cards "
                    "on the right show the specific help for each group:",
                    "Lower income — checks Ayushman Bharat (PM-JAY) eligibility, or age 70+ (Vay Vandana), which can "
                    "make the stay free at a listed hospital.",
                    "Salaried workers — ESI covers employees earning up to ₹21,000 a month.",
                    "Government staff — CGHS rates for central government employees and pensioners.",
                    "Middle income — finds the room, hospital and implant that leave the most money with the family.",
                    "Higher income — shows the real cost of premium rooms: in the example, a suite means paying "
                    "₹2,39,762 yourself."],
        "numbers": ["Chart: NSS 75th round survey (July 2017 – June 2018, 1,13,823 households), average private "
                    "hospital spending per stay by spending group, multiplied by the CPI health index (×1.536) to "
                    "bring it to December 2025 prices.",
                    "“About 7×”: private ₹31,845 vs government ₹4,452 per stay in the same survey (2017–18 rupees).",
                    "The ₹2,39,762 suite figure is the prototype's example case (made-up hospital)."],
        "abbr": ["<b>NSS / NSSO</b> — National Sample Survey (Office), the government's household survey body.",
                 "<b>CPI</b> — Consumer Price Index; its health part measures how medical prices rise over time.",
                 "<b>PM-JAY</b> — Pradhan Mantri Jan Arogya Yojana, part of Ayushman Bharat: free hospital cover up "
                 "to ₹5 lakh a year for eligible families.",
                 "<b>Vay Vandana</b> — the Ayushman Bharat card for everyone aged 70 and above, whatever their income.",
                 "<b>ESI</b> — Employees' State Insurance, health cover for lower-paid workers.",
                 "<b>CGHS</b> — Central Government Health Scheme."],
    }),
    ("Slide 11 — What is new, and how it compares", {
        "says": "Where families get help today, why none of them does what ClaimCast does, and the five things "
                "that are new.",
        "explain": ["<b>Hospital insurance desk</b> — helps at admission but after the choice is made, and works for "
                    "the hospital. <b>Policy websites</b> (e.g. Policybazaar, Ditto) — help people buy a policy. "
                    "<b>Insurer's app</b> — claim status after filing. <b>General AI chatbots</b> — explain wording "
                    "but may guess numbers.",
                    "<b>New:</b> before, not after; every decision priced, including each scan on a health report; "
                    "every rupee shows its rule and the AI never makes up a number; built for the whole family in "
                    "their language; learns from use.",
                    "Keep it fair: the table says what each kind of service is for, not criticism of how it works."],
        "abbr": ["<b>TPA</b> — Third Party Administrator, the company that handles claims for insurers at the "
                 "hospital's insurance desk."],
    }),
    ("Slide 12 — What each answer costs", {
        "says": "The inference cost of answering a family, measured on the working prototype, and what it becomes "
                "at scale. Hosting and storage are left out on purpose.",
        "explain": ["<b>₹0 for data</b> — every price list and rule is public government data.",
                    "<b>~4 paise per chat question</b> — Llama 3.3 70B through OpenRouter.",
                    "<b>4–8 paise per health report</b> — about 4 paise for a PDF or typed report, 8 for a photo, "
                    "which Gemini 2.5 Flash transcribes first.",
                    "<b>≈ ₹0 per bill estimate</b> — about a millisecond on an ordinary processor.",
                    "<b>The table:</b> 5 questions, 1 photo report and 20 estimates per family comes to about 30 "
                    "paise a family, whether 1,000 or 10 lakh families a month."],
        "numbers": ["Chat: about US$0.0005 per question (OpenRouter spending over test questions).",
                    "Health report: US$0.00041 per PDF read and US$0.00086 per photo read, from the OpenRouter usage "
                    "counter over three reads of each, 29 Sep 2026.",
                    "Bill estimate: 0.9–2.7 ms per answer, priced at 2 ms of Google Cloud Run CPU (US$0.000024 per "
                    "vCPU-second). US$1 is taken as ₹88."],
        "abbr": ["<b>Inference</b> — using a trained model to answer (as opposed to training it).",
                 "<b>CPU / vCPU</b> — (virtual) central processing unit. <b>ms</b> — millisecond."],
    }),
    ("Slide 13 — What comes next", {
        "says": "A 3 / 6 / 12-month plan, each with a goal and a target, and what already works.",
        "explain": ["<b>3 months — prove it helps families:</b> the study with 20 families, including blind users "
                    "with a screen reader; Tamil, Bengali and Marathi with voice; WhatsApp voice notes and report "
                    "photos; team logins with roles.",
                    "<b>6 months — real prices, real bills:</b> partner hospitals' price lists and bills so scan and "
                    "bill estimates use real prices; all 1,949 PM-JAY packages on the path (15 procedures today); "
                    "family floater tracking from saved stays; policy formats of the 20 largest insurers.",
                    "<b>12 months — ready for real patients:</b> a hospital pilot, health records through ABDM with "
                    "consent, DPDP Act consent and deletion, cashless pre-approval sent to the insurer.",
                    "The bottom bar lists what already works today."],
        "numbers": ["Targets and dates are goals, not commitments. The estimator is trained on 17,715 tariff rows "
                    "built from the 1,949 PM-JAY packages and CGHS rates."],
        "abbr": ["<b>DPDP Act</b> — Digital Personal Data Protection Act, 2023, India's data privacy law.",
                 "<b>ABDM</b> — Ayushman Bharat Digital Mission, the national programme for digital health records."],
    }),
    ("Slide 14 — Thank you", {
        "says": "The closing line — “The decision, before the bill” — and an invitation for questions.",
        "explain": ["Leave the audience with the one idea: families should know the money before they choose, not "
                    "after.",
                    "The small print matters if asked: these are estimates, not guarantees; ClaimCast gives no "
                    "medical advice and does not interpret reports medically; the demo uses made-up patients and "
                    "hospitals."],
    }),
]

PACK = "presentation deck/mockup documents/ClaimCast - Specimen Documents.pdf"

# (document, pages in the pack, what it contains, what to show with it)
DOCS = [
    ("1 · Suraksha Plus — Sanrakshan General", "2–3",
     "Ravi Kumar, 40. ₹3 lakh; room ₹3,000/day; ICU ₹6,000/day; 10% co-pay; implants up to ₹50,000; "
     "30/60 days before/after; 36-month wait.",
     "A tight room limit plus a co-pay: the room-rent trap at its sharpest."),
    ("2 · Arogya Gold — Nivaran Insurance", "4–5",
     "Priya Nair, 35. ₹10 lakh; room 1% and ICU 2% of cover per day; no co-pay; no implant limit; 60/90 days; "
     "24-month wait.",
     "Limits written as a percentage of the sum insured, which the reader must turn into a daily figure."),
    ("3 · Vaayu Complete — Vaayu Health", "6–7",
     "Arjun Mehta, 29. ₹7.5 lakh; any room; no ICU limit; no proportionate deduction; implants up to "
     "₹2 lakh; 60/180 days. Insured since Jul 2026.",
     "The contrast case: the room choice costs nothing extra. Also a new policy, so an old illness is still "
     "inside its 36-month wait."),
    ("4 · Senior Shield 60+ — Setu Assurance", "8–9",
     "Sita Kumar, 68. ₹5 lakh; room ₹4,000/day; ICU ₹8,000/day; 20% co-pay; implants up to ₹75,000; "
     "30/60 days; 12-month wait. Declared hypertension and diabetes.",
     "The ankle story on slide 5, with the Navjeevan X-ray bill."),
    ("5 · Parivar Floater — Prabha Life", "10–11",
     "Meena Sharma's family of five: Meena 42, Rajesh 45, Aarav 14, Isha 10, Savitri 71. ₹15 lakh shared; "
     "room ₹7,500/day; ICU ₹15,000/day; no co-pay except 20% for members 61+.",
     "Persona E: family profile with IDs, the floater's shared cover, “Sum insured used”."),
    ("6 · Ayushman Vay Vandana summary", "12",
     "Savitri Sharma, 71. The published scheme terms: ₹5 lakh a year, no premium, illnesses already present "
     "covered from day one, 3 days before and 15 after a stay, in-patient only.",
     "Age 70+ unlocking Vay Vandana; a scheme is an alternative to the policy, never a top-up."),
    ("7 · X-ray bill — Navjeevan District Hospital, Rewa", "13",
     "Sita Kumar. Left ankle AP and lateral (₹340, CGHS RI037). Bimalleolar fracture. Total ₹450.",
     "Upload on Your health: a report becomes a plan. The ₹340 matches the site's estimate there."),
    ("8 · X-ray bill — Meridian Institute, New Delhi", "14",
     "Savitri Sharma. Both knees standing and chest PA, with an out-patient consultation. Knee "
     "osteoarthritis, grade 3. Total ₹1,920.",
     "A tests-only report: out-patient tests are the family's to pay unless an admission follows."),
]

DEMO = [
    "<b>Before you start:</b> the separate files are in <i>presentation deck/mockup documents/specimens/</i>; "
    "upload one file at a time. The combined PDF is for reading and printing.",
    "<b>1 · Sita's policy.</b> Log in as Patient / Caregiver. In Start, About you: patient Sita Kumar, age 68. "
    "Your insurance: upload <i>4-setu-senior-shield.pdf</i>. Every detail appears with the line it came from; "
    "set “months you have had this cover” to 23 (insured since Oct 2024) and confirm.",
    "<b>2 · Her X-ray.</b> Your health: upload <i>7-xray-bill-navjeevan.pdf</i>. The reader finds the "
    "bimalleolar fracture and the ankle X-ray (CGHS RI037). The bill only says “orthopaedic opinion advised”, so "
    "choose <i>Ankle fracture fixation (ORIF)</i> under “Price it as”, then confirm.",
    "<b>3 · The plan.</b> Estimate my bill. Expected: the recommendation is Navjeevan District Hospital, Rewa, "
    "about ₹25,476 in all (X-ray ₹68 after the 20% co-pay, operation ₹25,408), against ₹81,668 at Meridian.",
    "<b>4 · The family.</b> Back in About you, add Rajesh, Aarav, Isha and Savitri with + Add and save: five "
    "unique IDs. Upload <i>5-prabha-parivar-floater.pdf</i> and make Savitri (71) the patient. On The path, “Who pays for "
    "this admission” now offers Ayushman Vay Vandana (for a priced operation at a PM-JAY empanelled hospital, "
    "such as Meridian). Page 12 of the pack is her cover summary to hold up.",
    "<b>5 · Tests only.</b> Upload <i>8-xray-bill-meridian.pdf</i> on Your health and keep “No operation — "
    "tests only”. The path shows where each X-ray is cheapest and that the family pays for out-patient tests.",
    "<b>6 · The contrast.</b> Upload <i>3-vaayu-complete.pdf</i>: with no room limit and no proportionate "
    "deduction, a private room no longer cuts the other charges.",
]

WATCH = [
    "<b>Check every rupee on the confirm screen.</b> In testing, Llama 3.3 read each detail and every quote "
    "checked out, but it sometimes returned rupee limits in the wrong unit (₹4,000 a day showed as ₹40). Correct "
    "any figure that does not match the page before confirming. This is what the confirmation step is for, "
    "and each correction is counted by the learning loop on slide 7.",
    "<b>Co-payment on the floater</b> is read as 20%, which applies only to members aged 61+. Set it to 0 unless "
    "the patient is Savitri.",
    "<b>Scan prices are estimates</b> (about twice the CGHS rate, adjusted per hospital), shown as “about” on "
    "the site; the bills in the pack use the same figures.",
    "<b>Everything in the pack is synthetic</b> and marked SPECIMEN. The scheme page says plainly that it is not "
    "a government document; it summarises the published Vay Vandana terms for a made-up person.",
]

GLOSSARY = [
    ("Co-payment", "The share of every admissible claim the policyholder pays, e.g. 20%."),
    ("Moratorium period", "After this many months of continuous cover, the insurer can no longer contest a claim except for fraud."),
    ("PED", "Pre-existing disease: an illness diagnosed or treated before the policy began; covered only after a waiting period."),
    ("Specimen", "A made-up sample document, marked as such, used to demonstrate the app."),
    ("UHID", "Unique health identification number a hospital gives each patient."),
    ("CBC / ECG / MRI", "Complete blood count / electrocardiogram (heart trace) / magnetic resonance imaging scan."),
    ("Family floater", "One policy whose sum insured is shared by the whole family."),
    ("Gemini", "Google's AI models; Gemini 2.5 Pro reads policy PDFs, Gemini 2.5 Flash transcribes report photos."),
    ("Groq", "A cloud service that runs AI models; a fallback reader for policy PDFs."),
    ("ORIF", "Open reduction and internal fixation — surgery that fixes a broken bone with plates and screws."),
    ("PostgreSQL", "The open-source database behind ClaimCast."),
    ("TF-IDF", "Term frequency–inverse document frequency — a simple word-matching search used to find passages."),
    ("UUID", "Universally unique identifier — a 36-character ID given to every person in a saved session."),
    ("Vertex AI", "Google Cloud's service for running AI models."),
    ("Web Speech API", "The browser's built-in speech recognition and read-aloud, used for voice in and out."),
    ("₹, paise, lakh", "Indian rupee; 100 paise = ₹1; 1 lakh = 1,00,000 (one hundred thousand); written ₹1 L."),
    ("ABDM", "Ayushman Bharat Digital Mission — India's national programme for digital health records."),
    ("AI", "Artificial intelligence."),
    ("Cashless / reimbursement", "Cashless: the insurer pays the hospital directly. Reimbursement: the family pays, "
                                 "then the insurer pays them back."),
    ("CGHS", "Central Government Health Scheme — health cover for central government employees and pensioners."),
    ("CPI", "Consumer Price Index — measures price rises; its health part is used to update old costs to today."),
    ("CPU / vCPU", "(Virtual) central processing unit — an ordinary computer processor."),
    ("Day-care", "A treatment that does not need a 24-hour hospital stay."),
    ("DPDP Act", "Digital Personal Data Protection Act, 2023 — India's data privacy law."),
    ("ESI / ESIC", "Employees' State Insurance / its Corporation — health cover for workers earning up to ₹21,000 "
                   "a month."),
    ("GE HealthCare", "The company running the Precision Care Challenge."),
    ("GPU", "Graphics processing unit — hardware often needed by large AI models."),
    ("HBP", "Health Benefit Package — the government's price list of treatments under PM-JAY (1,949 packages)."),
    ("ICU", "Intensive care unit."),
    ("IIIT-Delhi", "Indraprastha Institute of Information Technology, Delhi."),
    ("Inference", "Using a trained model to answer (as opposed to training it)."),
    ("IRDAI", "Insurance Regulatory and Development Authority of India — the insurance regulator."),
    ("List I", "IRDAI's list of items no health policy pays for, e.g. toiletries and registration fees."),
    ("Llama 3.3 70B", "An open AI language model from Meta with 70 billion parameters; runs the chat assistant."),
    ("LLM", "Large language model — an AI that reads and writes text, such as Llama."),
    ("ML", "Machine learning — computers learning patterns from data."),
    ("ms", "Millisecond — a thousandth of a second."),
    ("NABH", "National Accreditation Board for Hospitals & Healthcare Providers — hospital quality accreditation."),
    ("NHA", "National Health Authority — runs Ayushman Bharat PM-JAY."),
    ("NSS / NSSO", "National Sample Survey (Office) — the government's large household surveys."),
    ("OpenRouter", "A service giving access to many AI models, billed by use."),
    ("PCC", "Precision Care Challenge 2026 — the GE HealthCare competition."),
    ("PDF", "Portable Document Format — a common document file type."),
    ("PM-JAY", "Pradhan Mantri Jan Arogya Yojana (Ayushman Bharat) — free hospital cover up to ₹5 lakh a year for "
               "eligible families."),
    ("Proportionate deduction", "If the room taken costs more than the policy's room limit, charges tied to the "
                                "room are cut in the same ratio."),
    ("Sub-limit", "A cap inside the policy on one kind of cost, e.g. room rent or implants."),
    ("SUS", "System Usability Scale — a 10-question survey scored 0–100; 70+ is good."),
    ("TPA", "Third Party Administrator — handles claims for insurers at the hospital's insurance desk."),
    ("US$", "United States dollar; taken as ₹88 in the cost slide."),
    ("Vay Vandana", "Ayushman Bharat card for everyone aged 70+, regardless of income."),
    ("XGBoost", "“Extreme Gradient Boosting” — the machine learning method behind the bill estimator."),
]


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("G", 8.5)
    canvas.setFillColor(MUTE)
    canvas.drawString(20 * mm, 12 * mm, "ClaimCast · Presenter notes · Team Rocket, IIIT-Delhi")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, str(doc.page))
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                            bottomMargin=20 * mm, title="ClaimCast — Presenter Notes", author="Team Rocket")
    story = [Paragraph("ClaimCast — Presenter Notes", H1),
             Paragraph("What each slide of the pitch deck is saying, how to explain it, where every number comes "
                       "from, and what every short form means. After the slides: the specimen documents pack and how to use it in "
                       "a live demo. A full glossary is at the end.", SUB)]
    for i, (head, d) in enumerate(SLIDES):
        block = [Paragraph(head, H2), Paragraph("What this slide says", H3), Paragraph(d["says"], BODY),
                 Paragraph("How to explain it", H3), *bullets(d["explain"])]
        if d.get("numbers"):
            block += [Paragraph("Where the numbers come from", H3), *bullets(d["numbers"])]
        if d.get("abbr"):
            block += [Paragraph("Short forms on this slide", H3), *bullets(d["abbr"])]
        story += [KeepTogether(block[:3]), *block[3:], Spacer(1, 12)]
    story += [PageBreak(), Paragraph("The specimen documents pack", H2),
              Paragraph("Eight synthetic documents in one 14-page PDF (<i>%s</i>), each also saved on its own for "
                        "uploading. The five policies share one template, as do the two bills; only the contents "
                        "differ. Page 1 of the pack is a contents page." % PACK, BODY)]
    rows = [[Paragraph("<b>Document</b>", SMALL), Paragraph("<b>Pages</b>", SMALL), Paragraph("<b>What it contains</b>", SMALL),
             Paragraph("<b>Show with it</b>", SMALL)]]
    rows += [[Paragraph("<b>%s</b>" % d, SMALL), Paragraph(pg, SMALL), Paragraph(c, SMALL), Paragraph(w, SMALL)]
             for d, pg, c, w in DOCS]
    t = Table(rows, colWidths=[38 * mm, 15 * mm, 60 * mm, A4[0] - 40 * mm - 113 * mm], repeatRows=1)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("ROWBACKGROUNDS", (0, 0), (-1, -1), [PALE, HexColor("#FFFFFF")]),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                           ("LEFTPADDING", (0, 0), (-1, -1), 5)]))
    story += [Spacer(1, 4), t,
              Paragraph("A live demo with the pack", H3), *bullets(DEMO),
              Paragraph("What to watch for", H3), *bullets(WATCH)]
    story += [PageBreak(), Paragraph("Glossary of abbreviations and terms", H2)]
    rows = [[Paragraph("<b>%s</b>" % k, BODY), Paragraph(v, BODY)] for k, v in sorted(GLOSSARY, key=lambda g: (not g[0].startswith("₹"), g[0].lower()))]
    tbl = Table(rows, colWidths=[42 * mm, A4[0] - 40 * mm - 42 * mm])
    tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("ROWBACKGROUNDS", (0, 0), (-1, -1), [HexColor("#FFFFFF"), PALE]),
                             ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                             ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    story += [tbl, Spacer(1, 10),
              Paragraph("All hospitals, insurers, patients and bills in the ClaimCast demo are made up. Public "
                        "statistics are cited on the slide they appear on.", SMALL)]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
