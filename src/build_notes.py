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
        "explain": ["<b>Tell us</b> — the family picks their plan, treatment and hospital; they can upload their "
                    "policy PDF, which ClaimCast reads and they check.",
                    "<b>See every choice</b> — hospital, room, implant, cashless or refund, each with the rupee "
                    "amount the family would pay.",
                    "<b>Understand the bill</b> — every rupee the insurance will not pay, line by line, with the "
                    "policy rule that causes it.",
                    "The example: the same spine surgery costs the family ₹1,26,900 in a private room but ₹48,500 "
                    "in a semi-private one — ₹78,400 kept just by choosing the bed with the room limit in mind."],
        "numbers": ["The example is the prototype's reference case: 5 nights, ₹5 lakh policy, room limit "
                    "₹5,000 a day. The figures come from the ClaimCast calculator and are checked by an automated "
                    "test on every code change. The hospital, insurer and patient are made up."],
        "abbr": ["<b>PDF</b> — Portable Document Format, the usual file type for a policy document.",
                 "<b>Cashless</b> — the insurer pays the hospital directly. <b>Refund / reimbursement</b> — the "
                 "family pays first and is paid back later."],
    }),
    ("Slide 4 — Two sides of ClaimCast", {
        "says": "The left side is what a family uses; the right side is what the ClaimCast team sees — the "
                "system's memory and how it learns. Everything listed is built and working in the prototype.",
        "explain": ["<b>For families:</b> Start (a few simple questions), The path (every choice and its cost), "
                    "The working (the bill line by line), Ask ClaimCast (a chat assistant), and Save my session.",
                    "<b>1 · Every saved session is kept</b> — who, which hospital, what they pay and what they asked. "
                    "The team sees each one on the Database tab.",
                    "<b>2 · The chat assistant remembers</b> — when someone asks something, it recalls the three most "
                    "similar questions from saved sessions and how they were answered. The AI model itself is not "
                    "retrained; it learns by remembering. Amounts always come from the new family's own bill.",
                    "<b>3 · The bill estimator retrains itself</b> — families can report what their bill finally came "
                    "to (“Already had this admission?” at the bottom of The path). After every 10 new bills, the "
                    "estimator is rebuilt on all the data and the new version is used straight away. This was tested "
                    "end to end: 10 bills in, new version out, forecast moved.",
                    "<b>4 · Misread policy details are counted</b> — when a family uploads a policy and fixes a detail "
                    "ClaimCast read wrongly, that is counted. A detail checked at least 3 times and corrected in at "
                    "least a quarter of them is flagged: the next family is warned to double-check it, and past "
                    "corrections are shown to the AI as examples when it reads the next policy."],
        "numbers": ["Retrain threshold: 10 bills (a setting, RETRAIN_EVERY). Misread flag: at least 3 checks and "
                    "at least 25% corrected."],
        "abbr": ["<b>AI</b> — artificial intelligence.",
                 "<b>Estimator</b> — the machine learning model that predicts what the whole bill is likely to be."],
    }),
    ("Slide 5 — User study", {
        "says": "Three questions we asked of the design — is it easy, is it open to everyone, does it change a "
                "decision — what we have done for each, and the study with real families we plan next.",
        "explain": ["<b>Be clear with the judges:</b> the three columns are our own design review and the changes we "
                    "made. No study with real families has been run yet; the blue box is the plan.",
                    "Usability: the answer comes first (“you pay ₹…”), insurance words replaced with plain ones, "
                    "every choice shows its rupee effect.",
                    "Accessibility: high contrast, large figures, English and Hindi on every page, light and dark "
                    "themes, works without uploading anything.",
                    "Purpose: every choice shows what it saves; the assistant only talks about money and sends "
                    "medical questions to the doctor.",
                    "The plan: 20 caregivers at a hospital admission desk, three tasks, and a usability score "
                    "target of 70 or more out of 100."],
        "abbr": ["<b>SUS</b> — System Usability Scale, a standard 10-question survey scored 0–100; about 68 is "
                 "average, 70+ is considered good."],
    }),
    ("Slide 6 — Who it helps: every income group", {
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
    ("Slide 7 — What is new about ClaimCast", {
        "says": "The four things that make ClaimCast different from what exists today.",
        "explain": ["<b>Before, not after</b> — the same calculation insurers do after discharge, done before "
                    "admission.",
                    "<b>Prices the decision</b> — other tools explain the policy wording; ClaimCast puts a rupee "
                    "figure on each choice.",
                    "<b>Shows its working</b> — every rupee not paid points to the rule behind it, and the chat "
                    "assistant is checked so it cannot invent an amount.",
                    "<b>Learns from every family</b> — saved sessions, shared bills and fixed policy details all "
                    "make the next answer better.",
                    "The dark bar is the one-line summary: today you find out after discharge; with ClaimCast you "
                    "know before admission and can choose."],
    }),
    ("Slide 8 — What each answer costs", {
        "says": "The inference cost — what it costs to answer one family — measured on the working prototype, and "
                "what that becomes as the number of families grows. Hosting and storage are left out on purpose.",
        "explain": ["<b>₹0 for data</b> — every price list and rule is public government data.",
                    "<b>~5 paise per chat question</b> — the chat assistant runs on Llama 3.3 70B through OpenRouter; "
                    "we measured our own spending.",
                    "<b>≈ ₹0 per bill estimate</b> — the estimator answers in about one millisecond on an ordinary "
                    "processor.",
                    "<b>~5 seconds to retrain</b> — rebuilding the estimator takes about five seconds on a laptop; no "
                    "graphics card needed.",
                    "<b>The table:</b> if each family asks 5 questions and looks at 20 bill estimates, the cost is "
                    "about 22 paise per family whether we serve 1,000 or 10 lakh families a month — it grows in a "
                    "straight line with use and has no big fixed cost. At 10 lakh families a month that is about "
                    "₹2.2 lakh.",
                    "Compare that with the ₹78,400 one family keeps in our example."],
        "numbers": ["Chat: our OpenRouter account's spending rose about US$0.005 over about 11 test questions, "
                    "about US$0.0005 (≈ 4.4 paise) each.",
                    "Bill estimate: the estimator service answered in 0.9–2.7 milliseconds in five timed calls; "
                    "priced generously at 2 ms of Google Cloud Run processor time (US$0.000024 per vCPU-second).",
                    "US$1 is taken as ₹88. Retrain time: 4.6 seconds measured on a MacBook."],
        "abbr": ["<b>Inference</b> — using a trained model to answer a question (as opposed to training it).",
                 "<b>Llama 3.3 70B</b> — an open AI language model from Meta with 70 billion parameters.",
                 "<b>OpenRouter</b> — a service that gives access to many AI models, billed per word processed.",
                 "<b>CPU / vCPU</b> — (virtual) central processing unit, the ordinary processor in a computer.",
                 "<b>GPU</b> — graphics processing unit, specialised hardware often needed by large AI models.",
                 "<b>ms</b> — millisecond, a thousandth of a second. <b>US$</b> — US dollar."],
    }),
    ("Slide 9 — How ClaimCast compares", {
        "says": "Where families get help today, and why none of them does what ClaimCast does.",
        "explain": ["<b>Hospital insurance desk</b> — helps at admission, but after the choice is made, gives a "
                    "spoken estimate, and works for the hospital.",
                    "<b>Policy websites (Policybazaar, Ditto)</b> — help people choose and buy a policy; they are "
                    "not there at the hospital counter.",
                    "<b>Insurer's own app</b> — shows claim status after the claim is filed; it works for the insurer.",
                    "<b>General AI chatbots</b> — can explain wording any time but may guess numbers and do not "
                    "know your case.",
                    "<b>ClaimCast</b> — speaks before admission, at each choice, gives exact rupees plus the rule, "
                    "and works for the family.",
                    "Keep it fair: these descriptions say what each kind of service is for, not criticism of how "
                    "it works inside."],
        "abbr": ["<b>TPA</b> — Third Party Administrator, the company that handles claims for insurers at the "
                 "hospital's insurance desk."],
    }),
    ("Slide 10 — What comes next", {
        "says": "A 3 / 6 / 12-month plan, with a goal and a target for each stage, and what is already built.",
        "explain": ["<b>3 months — prove it helps families:</b> the study with 20 families, more Indian languages "
                    "after Hindi, voice and WhatsApp, the first 50 real bills, proper logins for the team. Target: "
                    "usability score 70+.",
                    "<b>6 months — real prices, real bills:</b> partner hospitals share price lists and bills, read "
                    "the policy formats of the 20 largest insurers, connect to cashless approval, price every "
                    "government treatment package. Target: estimate within 15% of the real bill.",
                    "<b>12 months — ready for real patients:</b> a hospital pilot, a mobile app, privacy under the "
                    "DPDP Act, and linking to national digital health records with consent. Target: 1 lakh "
                    "families a month.",
                    "The bottom bar lists what already works today."],
        "numbers": ["Targets and dates are goals, not commitments."],
        "abbr": ["<b>DPDP Act</b> — Digital Personal Data Protection Act, 2023, India's data privacy law.",
                 "<b>ABDM</b> — Ayushman Bharat Digital Mission, the national programme for digital health records."],
    }),
    ("Slide 11 — Thank you", {
        "says": "The closing line — “The decision, before the bill” — and an invitation for questions.",
        "explain": ["Leave the audience with the one idea: families should know the money before they choose, not "
                    "after.",
                    "The small print is important if asked: these are estimates, not guarantees; ClaimCast gives no "
                    "medical advice; the demo uses made-up patients and hospitals."],
    }),
]

GLOSSARY = [
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
                       "from, and what every short form means. A full glossary is at the end.", SUB)]
    for i, (head, d) in enumerate(SLIDES):
        block = [Paragraph(head, H2), Paragraph("What this slide says", H3), Paragraph(d["says"], BODY),
                 Paragraph("How to explain it", H3), *bullets(d["explain"])]
        if d.get("numbers"):
            block += [Paragraph("Where the numbers come from", H3), *bullets(d["numbers"])]
        if d.get("abbr"):
            block += [Paragraph("Short forms on this slide", H3), *bullets(d["abbr"])]
        story += [KeepTogether(block[:3]), *block[3:], Spacer(1, 12)]
    story += [PageBreak(), Paragraph("Glossary of abbreviations and terms", H2)]
    rows = [[Paragraph("<b>%s</b>" % k, BODY), Paragraph(v, BODY)] for k, v in GLOSSARY]
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
