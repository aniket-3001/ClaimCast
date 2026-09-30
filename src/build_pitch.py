# -*- coding: utf-8 -*-
"""
The ClaimCast pitch deck: fourteen slides on the official PCC 2026 template,
in the look of the Phase 1 deck (GE blue, Rockwell headings, big numbers).

Plain language throughout. Every figure is either from a public source the
project already cites, measured on the running prototype, or labelled as an
example case from the prototype's own synthetic data.

    python src/build_pitch.py   ->   presentation deck/ClaimCast - Pitch Deck.pptx
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deckkit import ROOT, SRC  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.chart.data import CategoryChartData  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE  # noqa: E402
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402

OUT = os.path.join(ROOT, "presentation deck", "ClaimCast - Pitch Deck.pptx")

# ── Palette and type, after the Phase 1 deck ─────────────────────────────
BLUE = RGBColor(0x00, 0x5E, 0xB8)
DEEP = RGBColor(0x00, 0x3F, 0x7D)
PALE = RGBColor(0xE8, 0xF1, 0xFA)
SOFT = RGBColor(0xC4, 0xDC, 0xEF)
INK = RGBColor(0x14, 0x18, 0x1C)
BODY = RGBColor(0x2B, 0x31, 0x38)
MUTE = RGBColor(0x5F, 0x68, 0x72)
RED = RGBColor(0xC8, 0x10, 0x2E)
GREEN = RGBColor(0x00, 0x7A, 0x4D)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
HAIR = RGBColor(0xD9, 0xDE, 0xE4)
CARD = RGBColor(0xF4, 0xF7, 0xFA)
AMBER = RGBColor(0xB2, 0x6B, 0x00)
HEAD, TXT = "Rockwell", "Arial"
W, H = 13.333, 7.5


# ── Small drawing kit ────────────────────────────────────────────────────
def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    s.shadow.inherit = False
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    return s


def card(slide, x, y, w, h, fill=CARD, line=HAIR):
    return box(slide, x, y, w, h, fill, line, MSO_SHAPE.ROUNDED_RECTANGLE, 0.06)


def say(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP):
    """paras: list of (runs, opts); runs: list of (text, size, bold, color[, italic, font])."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, (runs, o) in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = o.get("align", PP_ALIGN.LEFT)
        p.space_after = Pt(o.get("sa", 0))
        p.space_before = Pt(o.get("sb", 0))
        if "line" in o:
            p.line_spacing = o["line"]
        for r in runs:
            t, size, bold, color = r[0], r[1], r[2], r[3]
            italic = r[4] if len(r) > 4 else False
            font = r[5] if len(r) > 5 else TXT
            run = p.add_run()
            run.text = t
            f = run.font
            f.name, f.size, f.bold, f.italic = font, Pt(size), bold, italic
            f.color.rgb = color
    return tb


def P(*runs, **o):
    return (list(runs), o)


def title(slide, text, sub=None):
    say(slide, 0.6, 0.38, 12.1, 0.62, [P((text, 30, True, INK, False, HEAD))])
    if sub:
        say(slide, 0.6, 1.04, 12.1, 0.36, [P((sub, 14, False, MUTE))])


def dot(slide, x, y, n, d=0.46, fill=BLUE, color=WHITE, size=15):
    c = box(slide, x, y, d, d, fill, None, MSO_SHAPE.OVAL)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    r.font.name, r.font.size, r.font.bold = HEAD, Pt(size), True
    r.font.color.rgb = color
    return c


def footer(slide, n):
    say(slide, 0.6, 7.02, 8, 0.25, [P(("ClaimCast  ·  Team Rocket, IIIT-Delhi  ·  Precision Care Challenge 2026", 9, False, MUTE))])
    say(slide, 11.73, 7.02, 1.0, 0.25, [P((str(n), 10, True, BLUE), align=PP_ALIGN.RIGHT)])


def bullets(slide, x, y, w, h, items, size=13, color=BODY, gap=7):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.line_spacing = 1.12
        head, rest = it if isinstance(it, tuple) else (None, it)
        r0 = p.add_run()
        r0.text = "•  "
        r0.font.name, r0.font.size, r0.font.bold = TXT, Pt(size), True
        r0.font.color.rgb = BLUE
        if head:
            r = p.add_run()
            r.text = head + " "
            r.font.name, r.font.size, r.font.bold = TXT, Pt(size), True
            r.font.color.rgb = INK
        r = p.add_run()
        r.text = rest
        r.font.name, r.font.size = TXT, Pt(size)
        r.font.color.rgb = color
    return tb


def inr(rupees):
    s = str(int(round(rupees)))
    if len(s) <= 3:
        return "₹" + s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return "₹" + ",".join(groups + [tail])


# ── Open the template: keep the title slide and the master, drop the rest ─
prs = Presentation(SRC)
ids = prs.slides._sldIdLst
for sid in list(ids)[1:]:
    prs.part.drop_rel(sid.rId)
    ids.remove(sid)
for sh in list(prs.slide_master.shapes):
    if sh.name in ("TextBox 7", "Date Placeholder 3", "Footer Placeholder 4"):
        sh._element.getparent().remove(sh._element)
for lay in prs.slide_layouts:
    for sh in list(lay.shapes):
        if sh.name.startswith(("Date Placeholder", "Footer Placeholder")):
            sh._element.getparent().remove(sh._element)
BLANK = next(l for l in prs.slide_layouts if l.name == "Blank")


def new_slide(n):
    s = prs.slides.add_slide(BLANK)
    footer(s, n)
    return s


# ═══════════════════════════════════════════════════════════════ 1 · TITLE
s1 = prs.slides[0]
band = box(s1, 0, 0, W, 4.1, BLUE)
s1.shapes._spTree.remove(band._element)
s1.shapes._spTree.insert(2, band._element)
t = s1.shapes.title
t.left, t.top, t.width, t.height = Inches(0.9), Inches(0.62), Inches(11.53), Inches(0.34)
tf = t.text_frame
tf.clear()
r = tf.paragraphs[0].add_run()
r.text = "PRECISION CARE CHALLENGE 2026   ·   GE HEALTHCARE"
r.font.name, r.font.size, r.font.bold, r.font.color.rgb = TXT, Pt(11), True, SOFT
tf.paragraphs[0].alignment = PP_ALIGN.CENTER
sub = [p for p in s1.placeholders if p.placeholder_format.idx == 1][0]
sub.left, sub.top, sub.width, sub.height = Inches(0.9), Inches(1.3), Inches(11.53), Inches(1.3)
tf = sub.text_frame
tf.clear()
r = tf.paragraphs[0].add_run()
r.text = "ClaimCast"
r.font.name, r.font.size, r.font.bold, r.font.color.rgb = HEAD, Pt(76), True, WHITE
tf.paragraphs[0].alignment = PP_ALIGN.CENTER
say(s1, 1.4, 2.95, 10.53, 0.9, [
    P(("Know what your hospital bill will cost you — ", 20, False, SOFT),
      ("before", 20, True, WHITE), (" you are admitted, not ", 20, False, SOFT),
      ("after", 20, True, WHITE), (" you are discharged.", 20, False, SOFT), align=PP_ALIGN.CENTER, line=1.2)])
say(s1, 0.9, 4.55, 11.53, 0.34, [
    P(("TRACK: HOSPITALITY", 11, True, RED), ("   ·   Holistic Optimization System for Policy-Integrated "
                                              "Admission & Treatment Intelligence", 12, False, BODY),
      align=PP_ALIGN.CENTER)])
say(s1, 0.9, 5.45, 11.53, 1.0, [
    P(("Team Rocket", 28, True, INK, False, HEAD), align=PP_ALIGN.CENTER, sa=6),
    P(("Indraprastha Institute of Information Technology, Delhi (IIIT-Delhi)", 13, False, BODY), align=PP_ALIGN.CENTER)])
s1.notes_slide.notes_text_frame.text = (
    "ClaimCast tells a family, before a hospital admission, how much of the bill their health insurance "
    "will not pay, why, and which choices would change it.")

# ═══════════════════════════════════════════════════════════════ 2 · PROBLEM
s = new_slide(2)
box(s, 0, 0, 4.7, H, BLUE)
say(s, 0.6, 0.62, 3.6, 0.3, [P(("THE PROBLEM", 11, True, SOFT))])
say(s, 0.6, 1.05, 3.65, 3.2, [P((
    "The costliest health decision a family makes is taken in minutes, at a hospital counter, "
    "by someone who has never read their insurance policy.", 21, True, WHITE, False, HEAD), line=1.2)])
say(s, 0.6, 4.75, 3.65, 1.8, [P((
    "Insurers work out what they will pay only after discharge. By then the room, the implant and the "
    "hospital have already been chosen — and cannot be changed.", 13, False, SOFT), line=1.35)])

say(s, 5.3, 0.62, 7.4, 0.3, [P(("THE ROOM-RENT TRAP", 11, True, RED))])
say(s, 5.3, 0.95, 3.3, 1.35, [P(("50%", 96, True, RED, False, HEAD))])
say(s, 8.55, 1.3, 4.2, 0.9, [P(("of a bill can be refused", 22, True, INK, False, HEAD), line=1.1)])
say(s, 5.3, 2.45, 7.4, 1.0, [P(
    ("A policy pays up to ₹5,000 a day for the room. The family takes a ₹10,000 room. Now the surgeon, "
     "theatre and nursing charges are also cut by half — not just the room.", 14, False, BODY), line=1.35)])
box(s, 5.3, 3.65, 7.4, 0.012, HAIR)
for i, (big, cap, src) in enumerate([
        ("₹39,085", "average paid from pocket per cancer hospital stay", "Front. Public Health, 2023 · 12,148 patients"),
        ("₹3.31 L", "paid from pocket per cancer patient in a year", "same study · medicines 45%, tests 36%")]):
    x = 5.3 + i * 3.8
    say(s, x, 3.9, 3.6, 0.6, [P((big, 32, True, BLUE, False, HEAD))])
    say(s, x, 4.55, 3.5, 0.7, [P((cap, 13, False, INK), line=1.2)])
    say(s, x, 5.2, 3.5, 0.3, [P((src, 9.5, False, MUTE))])
card(s, 5.3, 5.75, 7.4, 0.95, PALE, None)
say(s, 5.55, 5.9, 6.9, 0.7, [P(
    ("Surprise bills push families into debt and cause people to stop treatment midway. ", 13, True, INK),
    ("(Lancet Regional Health SE Asia, 2022)", 11, False, MUTE), line=1.3)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "The 50% is the worst case of proportionate deduction under IRDAI circular IRDAI/HLT/REG/CIR/151/06/2020; "
    "how much applies depends on the policy wording. The cancer figures are from Prinja et al., Frontiers in "
    "Public Health 2023. Treatment attrition: CROCODILE study, Lancet Regional Health SE Asia 2022.")

# ═══════════════════════════════════════════════════════════════ 3 · WHAT IT DOES
s = new_slide(3)
title(s, "What ClaimCast does", "The same maths the insurer uses after discharge — done before admission, while choices are still open.")
steps = [
    ("Tell us", "Who the patient is and your family, your insurance (upload the policy PDF: we read it, you check it), any government scheme, and your health report."),
    ("See every choice", "Which hospital, room or implant, cashless or refund, and where to have each scan. Each choice shows what you would pay."),
    ("Understand the bill", "Every rupee your insurance will not pay, line by line, with the rule behind it. Ask anything, typed or spoken, in English or Hindi."),
]
for i, (h, b) in enumerate(steps):
    x = 0.6 + i * 4.15
    card(s, x, 1.75, 3.85, 2.45)
    dot(s, x + 0.3, 2.0, i + 1)
    say(s, x + 0.95, 2.03, 2.8, 0.45, [P((h, 18, True, INK, False, HEAD))])
    say(s, x + 0.3, 2.7, 3.3, 1.4, [P((b, 13, False, BODY), line=1.3)])
say(s, 0.6, 4.55, 6, 0.3, [P(("AN EXAMPLE ADMISSION  ·  spine surgery, 5 nights, ₹5 lakh policy", 11, True, BLUE))])
for i, (room, rate, pays, col) in enumerate([("Private room", "₹10,000 a day", "₹1,26,900", RED),
                                              ("Semi-private room", "₹5,000 a day", "₹48,500", BLUE)]):
    x = 0.6 + i * 3.35
    card(s, x, 4.95, 3.15, 1.75, WHITE, HAIR)
    say(s, x + 0.25, 5.1, 2.8, 0.35, [P((room, 14, True, INK))])
    say(s, x + 0.25, 5.42, 2.8, 0.3, [P((rate, 11.5, False, MUTE))])
    say(s, x + 0.25, 5.78, 2.8, 0.7, [P(("you pay ", 12, False, BODY), (pays, 26, True, col, False, HEAD))])
card(s, 7.5, 4.95, 5.23, 1.75, GREEN, None)
say(s, 7.8, 5.12, 4.7, 1.45, [
    P(("You keep ₹78,400", 28, True, WHITE, False, HEAD), sa=6),
    P(("just by knowing the room limit before choosing a bed, worked out by the same rules the insurer uses.", 12.5, False, WHITE), line=1.25)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "The example is the prototype's reference admission (synthetic data). The ₹78,400 comes from the engine: "
    "₹1,26,900 minus ₹48,500. The chat assistant only repeats figures the engine calculated.")

# ═══════════════════════════════════════════════════════════════ 4 · PIPELINE
def arrow(slide, x, y, w=0.2, h=0.26, shape=MSO_SHAPE.RIGHT_ARROW, fill=SOFT):
    a = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    a.fill.solid()
    a.fill.fore_color.rgb = fill
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def node(slide, x, y, w, h, n, head, body, fill=WHITE, line=HAIR, head_col=INK, body_col=BODY, dot_fill=BLUE, dot_col=WHITE):
    box(slide, x, y, w, h, fill, line, MSO_SHAPE.ROUNDED_RECTANGLE, 0.08)
    dot(slide, x + 0.14, y + 0.14, n, 0.34, dot_fill, dot_col, 11)
    say(slide, x + 0.56, y + 0.13, w - 0.66, 0.4, [P((head, 12, True, head_col))], anchor=MSO_ANCHOR.MIDDLE)
    say(slide, x + 0.16, y + 0.6, w - 0.3, h - 0.66, [P((body, 10, False, body_col), line=1.18)])


s = new_slide(4)
title(s, "How it works: the family’s path and the team’s", "Every box is a screen in the working prototype, in the order it is used.")
say(s, 0.6, 1.47, 6, 0.26, [P(("FAMILY SIDE  ·  Patient / Caregiver", 11, True, BLUE))])
fam = [
    ("Log in", "Choose Patient / Caregiver. English or हिन्दी, light or dark theme."),
    ("Start: 5 steps", "About you + family · Insurance (PDF read, you confirm) · Schemes · Your health · Review"),
    ("Estimate my bill", "Opens the path. With a health report, the plan comes first: cheapest place for scans and surgery."),
    ("The path", "Every choice priced, ‘None’ allowed. The likely bill range; share your final bill here."),
    ("The working", "The bill line by line, the rule behind each cut, and the cheaper options."),
    ("Ask ClaimCast", "Type or speak a question in English or Hindi; answers can be read aloud."),
    ("Save my session", "Each person gets a unique ID. Profile keeps your stays and family."),
]
nw, gap = 1.6, 0.155
for i, (h, b) in enumerate(fam):
    x = 0.6 + i * (nw + gap)
    node(s, x, 1.8, nw, 1.95, i + 1, h, b)
    if i < len(fam) - 1:
        arrow(s, x + nw + 0.005, 2.62, 0.145, 0.24)
arrow(s, 3.0, 3.82, 0.28, 0.3, MSO_SHAPE.DOWN_ARROW)
arrow(s, 11.62, 3.82, 0.28, 0.3, MSO_SHAPE.DOWN_ARROW)
box(s, 0.6, 4.18, 12.13, 0.62, PALE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.2)
say(s, 0.85, 4.18, 11.7, 0.62, [P(("SHARED CORE   ", 11, True, BLUE),
                                  ("money engine with fixed rules  ·  PostgreSQL database  ·  XGBoost bill estimator  ·  "
                                   "AI readers for policies, reports and questions", 12, False, INK), align=PP_ALIGN.CENTER)],
    anchor=MSO_ANCHOR.MIDDLE)
arrow(s, 5.0, 4.87, 0.28, 0.3, MSO_SHAPE.DOWN_ARROW)
arrow(s, 11.0, 4.87, 0.28, 0.3, MSO_SHAPE.DOWN_ARROW)
say(s, 0.6, 5.2, 6, 0.26, [P(("TEAM SIDE  ·  ClaimCast team", 11, True, BLUE))])
team = [
    ("Log in", "Choose ClaimCast team (no password in the demo)."),
    ("Saved sessions", "Search by name, hospital, diagnosis or ID. See people, health report and questions; open it as the family saw it."),
    ("What ClaimCast knows", "Hospitals, treatments, plans, never-covered items and rules, each with its public source."),
    ("What it has learned", "Policy fixes, bills shared, choices, chat memory. The estimator retrains every 10 bills."),
]
tw, tg = 2.87, 0.217
for i, (h, b) in enumerate(team):
    x = 0.6 + i * (tw + tg)
    node(s, x, 5.5, tw, 1.38, i + 1, h, b, DEEP, None, WHITE, SOFT, WHITE, BLUE)
    if i < len(team) - 1:
        arrow(s, x + tw + 0.01, 6.05, 0.2, 0.26)
s.notes_slide.notes_text_frame.text = (
    "Top row: the family's screens in order. Start is a five-step wizard: About you (with family members), "
    "Your insurance (pick a plan or upload the policy PDF, which is read and confirmed field by field), "
    "Government schemes (Ayushman Bharat card, CGHS, ESI), Your health (illness date checked against the policy "
    "start, and the optional health report), Review. Bottom row: the team's side, the admin Database with saved "
    "sessions and the reference data, and the learning page. Both sides share one engine and one database.")

# ═══════════════════════════════════════════════════════════════ 5 · FAMILY + HEALTH REPORT
s = new_slide(5)
title(s, "Built around the whole family", "One profile holds everyone, each with their own ID, and a health report becomes a plan.")
card(s, 0.6, 1.55, 5.95, 5.25)
say(s, 0.9, 1.72, 5.4, 0.3, [P(("FAMILY BRANCH  +  UNIQUE IDs", 11, True, BLUE))])
say(s, 0.9, 2.02, 5.4, 0.45, [P(("Two sons called Ravi are two people", 17, True, INK, False, HEAD))])
rows = [("Who", "Name", "Age", "Unique ID (UUID)"),
        ("You", "Ravi Kumar", "40", "6fc021f8-f023-4d28-…"),
        ("Patient", "Sita Kumar", "68", "e27087d2-3ec2-4513-…"),
        ("Son", "Ravi", "12", "02bc3da4-956e-415f-…"),
        ("Son", "Ravi", "9", "a0ba8257-2790-44dd-…")]
tbl = s.shapes.add_table(len(rows), 4, Inches(0.9), Inches(2.62), Inches(5.35), Inches(1.75)).table
for j, wd in enumerate([0.95, 1.35, 0.6, 2.45]):
    tbl.columns[j].width = Inches(wd)
for i, row in enumerate(rows):
    tbl.rows[i].height = Inches(0.35)
    for j, val in enumerate(row):
        cell = tbl.cell(i, j)
        cell.fill.solid()
        cell.fill.fore_color.rgb = INK if i == 0 else (WHITE if i % 2 else PALE)
        cell.margin_left = cell.margin_right = Inches(0.08)
        cell.margin_top = cell.margin_bottom = Inches(0.02)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.clear()
        r = tf.paragraphs[0].add_run()
        r.text = val
        r.font.name = "Courier New" if (j == 3 and i) else TXT
        r.font.size = Pt(10 if i == 0 else 10.5)
        r.font.bold = i == 0
        r.font.color.rgb = WHITE if i == 0 else INK
bullets(s, 0.9, 4.55, 5.4, 2.2, [
    ("Start asks for", "your name and age, the patient’s, the name on the policy, and any number of husband, wife, children or parents (+ Add)."),
    ("On save,", "the server gives every person a UUID and keeps it on every later save. A copied or repeated ID is replaced, never shared."),
    ("Shown in", "Profile → My family and in the team’s Database, searchable by ID."),
], size=11, gap=5)

box(s, 6.78, 1.55, 5.95, 5.25, PALE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.06)
say(s, 7.08, 1.72, 5.4, 0.3, [P(("HEALTH REPORT  →  PLAN", 11, True, BLUE))])
say(s, 7.08, 2.02, 5.4, 0.45, [P(("Upload the report, see where and what", 17, True, INK, False, HEAD))])
for i, (h, b) in enumerate([
        ("Upload", "a PDF or a photo, or type it. Read once and not kept."),
        ("Read and checked", "Each test, the diagnosis and the surgery are quoted from the report, and each quote is looked for in it."),
        ("Matched to public rates", "Scans to CGHS test codes, surgery to the PM-JAY package. You confirm or fix first."),
        ("A plan on the path", "The cheapest hospital for everything, each scan at every hospital, and who pays: your plan, PM-JAY, CGHS, ESI or you.")]):
    y = 2.6 + i * 0.66
    dot(s, 7.08, y, i + 1, 0.36, BLUE, WHITE, 12)
    say(s, 7.6, y - 0.02, 4.95, 0.62, [P((h + "  ", 11.5, True, INK), (b, 10.5, False, BODY), line=1.15)])
box(s, 7.08, 5.33, 5.37, 1.3, GREEN, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.08)
say(s, 7.3, 5.4, 5.0, 1.18, [
    P(("Example: broken ankle, patient 68, Health Shield Classic", 10.5, True, WHITE), sa=3),
    P(("X-ray, MRI, blood tests, ECG + ankle fixation (ORIF)", 10, False, WHITE), sa=4),
    P(("Navjeevan, Rewa  ", 12, True, WHITE), ("about ₹9,300 in all", 17, True, WHITE, False, HEAD),
      ("   vs ₹53,600 at Meridian, Delhi", 11, False, WHITE))], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "The four IDs are real ones from a test save. The server assigns UUIDs; a session keeps them across saves; "
    "an ID sent from another session or twice in one list is replaced (automated test). Health report: the "
    "report is read in memory and not stored; only what the family confirms is saved with the session. Scan "
    "prices are estimates (about twice the CGHS rate, adjusted per hospital) and are shown as 'about'. The "
    "example is synthetic data: ₹9,300 is the policy's share-out for the family at Navjeevan with scans repaid "
    "as pre-hospitalisation cost.")

# ═══════════════════════════════════════════════════════════════ 6 · LLM ARCHITECTURE
s = new_slide(6)
title(s, "The AI inside: what reads, what answers, what checks", "Language models read and explain. They never work out a rupee.")
cols = [
    ("READING YOUR POLICY PDF", "Gemini 2.5 Pro on Vertex AI", "fallback: Groq gpt-oss-120b · Llama 3.3 70B",
     "the PDF, the passages a TF-IDF search finds for each detail, and past corrections (only if the family agreed)",
     "16 policy details, each with the sentence and page it came from",
     "each quote is searched in the PDF’s own text; the family confirms every detail before it is used"),
    ("ASK CLAIMCAST  (CHAT)", "Llama 3.3 70B via OpenRouter", "English or Hindi answers",
     "the engine’s numbered facts about this stay, health-report facts, policy passages, and 3 similar past answers",
     "a short answer, the facts it used, quotes from the policy",
     "every ₹ figure must match an engine fact or a checked quote; anything else is flagged on screen"),
    ("READING A HEALTH REPORT", "Llama 3.3 70B via OpenRouter", "photos first transcribed by Gemini 2.5 Flash",
     "the report’s text: from the PDF, a photo transcription, or typed",
     "diagnosis, tests, surgery and medicines, each with a quote",
     "quotes checked in the report; tests matched to CGHS codes by fixed rules; family confirms; keyword rules if no model"),
]
for i, (tag, model, sub, gets, gives, check) in enumerate(cols):
    x = 0.6 + i * 4.12
    card(s, x, 1.52, 3.9, 4.35)
    say(s, x + 0.25, 1.68, 3.45, 0.28, [P((tag, 10.5, True, BLUE))])
    box(s, x + 0.25, 2.0, 3.4, 0.62, BLUE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.18)
    say(s, x + 0.35, 2.0, 3.2, 0.62, [P((model, 12.5, True, WHITE), align=PP_ALIGN.CENTER),
                                      P((sub, 9, False, SOFT), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
    for j, (k, v, col) in enumerate([("GETS", gets, INK), ("GIVES BACK", gives, INK), ("CHECKED BY CODE", check, GREEN)]):
        y = 2.8 + j * 1.0
        say(s, x + 0.25, y, 3.45, 0.24, [P((k, 9.5, True, col))])
        say(s, x + 0.25, y + 0.24, 3.45, 0.74, [P((v, 10.5, False, BODY), line=1.15)])
box(s, 0.6, 6.03, 12.13, 0.78, INK, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.12)
say(s, 0.9, 6.03, 11.6, 0.78, [
    P(("Not AI, on purpose:  ", 13, True, SOFT),
      ("the money engine (IRDAI and policy rules, same code in browser and server)  ·  XGBoost bill-range model  ·  "
       "the browser’s own speech for voice in and read-aloud", 12, False, WHITE), align=PP_ALIGN.CENTER, line=1.15)],
    anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Policy reader: the provider is chosen by which key is configured; production uses Gemini 2.5 Pro on Vertex, "
    "with Groq and OpenRouter as fallbacks. Retrieval is TF-IDF over overlapping 700-character chunks, with no "
    "embeddings and no vector store. Chat: Llama 3.3 70B on OpenRouter, temperature 0, JSON output, one retry "
    "on bad JSON. Health reports: the same text model; photos and scanned PDFs are transcribed by Gemini 2.5 "
    "Flash first. Voice uses the Web Speech API (en-IN / hi-IN).")

# ═══════════════════════════════════════════════════════════════ 7 · SELF-LEARNING
s = new_slide(7)
title(s, "Self-learning, checked on the running system", "Four signals. Three change what the next family sees; one is only counted.")
card(s, 0.6, 1.5, 6.35, 5.3)
say(s, 0.88, 1.66, 5.9, 0.28, [P(("1 · FINAL BILLS  →  THE BILL ESTIMATOR", 11, True, BLUE))])
say(s, 0.88, 1.96, 5.9, 0.62, [P(("Live test, 29 Sep 2026: ten ankle-surgery bills reported about 60% above the estimate",
                                  12, True, INK), line=1.15)])
cd = CategoryChartData()
cd.categories = ["Before", "After 5 bills\n(no retrain yet)", "After 10 bills\n(retrained itself)"]
cd.add_series("Middle estimate", (83881, 92336, 92731))
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.75), Inches(2.6), Inches(6.05), Inches(2.95), cd)
ch = gf.chart
ch.has_title = False
ch.has_legend = False
ch.plots[0].gap_width = 70
ser = ch.series[0]
ser.format.fill.solid()
ser.format.fill.fore_color.rgb = BLUE
pt = ser.points[0]
pt.format.fill.solid()
pt.format.fill.fore_color.rgb = SOFT
ch.plots[0].has_data_labels = True
dl = ch.plots[0].data_labels
dl.number_format, dl.number_format_is_linked = '"₹"#,##0', False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size, dl.font.name, dl.font.bold, dl.font.color.rgb = Pt(12), TXT, True, INK
ch.value_axis.visible = False
ch.value_axis.has_major_gridlines = False
ch.value_axis.minimum_scale = 0
ch.value_axis.maximum_scale = 110000
ch.category_axis.tick_labels.font.size = Pt(10)
ch.category_axis.tick_labels.font.name = TXT
ch.category_axis.format.line.color.rgb = HAIR
say(s, 0.88, 5.62, 5.9, 1.1, [P(
    ("Between retrains, every new bill corrects the estimate at once. At 10 new bills the XGBoost model rebuilt "
     "itself as a new version (2026-09-29.1 → .2) with no one pressing a button.", 10.5, False, BODY), line=1.2)])
loops = [
    ("2 · POLICY FIXES  →  THE PDF READER",
     "A detail families often correct gets a warning for the next family (“others often correct this one, 3 of 5 times”). "
     "Corrections they agree to share become worked examples in the next reading."),
    ("3 · SAVED CHATS  →  THE CHAT’S MEMORY",
     "The 3 most similar past answers guide how a new question is explained. Answers with a wrong figure are left out; "
     "figures always come from the new family’s own bill."),
    ("4 · CHOICES ON THE PATH  →  COUNTED",
     "Which hospital or room families pick is counted for the team. It changes no figure and is never linked to a person."),
]
for i, (h, b) in enumerate(loops):
    y = 1.5 + i * 1.5
    card(s, 7.2, y, 5.53, 1.36, WHITE if i < 2 else CARD, HAIR)
    say(s, 7.45, y + 0.12, 5.1, 0.28, [P((h, 10.5, True, BLUE if i < 2 else MUTE))])
    say(s, 7.45, y + 0.42, 5.1, 0.9, [P((b, 10.5, False, BODY), line=1.18)])
box(s, 7.2, 6.0, 5.53, 0.8, PALE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.1)
say(s, 7.4, 6.0, 5.15, 0.8, [P(("What does not learn, by design: ", 10.5, True, INK),
                               ("the AI models’ weights and the money rules. Loops 1–3 are also checked by automated tests "
                                "against a real database.", 10.5, False, BODY), line=1.15)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Loop 1 was tested live on the prototype: forecast midpoint for ankle ORIF, private room, Tier I, 3 nights: "
    "₹83,881 before; ₹92,336 after five settled bills (the live correction from settledBills, no retrain); the "
    "API then triggered POST /retrain on the ML service when ten new bills had arrived, producing artifact "
    "2026-09-29.2 (₹92,731 midpoint). One older bill already in the database made the tenth; the "
    "service dropped one unusable row and trained on nine. The test bills were deleted afterwards. Loop 2: shakyFields needs at least "
    "three observations before warning; promptHints only uses consented corrections. Loop 3: recall() picks the "
    "three most similar remembered answers; answers with unsupported figures are excluded. Checks: learning.check, "
    "sessions.check, chat.check.")

# ═══════════════════════════════════════════════════════════════ 8 · USER STUDY
s = new_slide(8)
title(s, "User study: is it easy, open to everyone, and useful?")
cols = [
    ("USABILITY", "Can a stressed caregiver use it in minutes?", [
        "Start is five short steps, one question at a time, with a Review at the end.",
        "The answer comes first: “As things stand, you pay ₹…”.",
        "Insurance words replaced: “When did this illness begin?” instead of “pre-existing condition”.",
    ]),
    ("ACCESSIBILITY", "Can everyone read, hear and trust it?", [
        "English and Hindi on every page, switched with one button.",
        "Speak a question in Hindi or English; every answer can be read aloud.",
        "High-contrast colours, large figures, light and dark themes.",
    ]),
    ("PURPOSE", "Does it change a decision?", [
        "Each choice shows how much it saves or costs, e.g. ₹78,400 for the right room.",
        "A health report turns into the cheapest place for each scan and the surgery.",
        "Measure next: did the family pick a different room, hospital or scheme?",
    ]),
]
for i, (tag, q, items) in enumerate(cols):
    x = 0.6 + i * 4.15
    card(s, x, 1.3, 3.85, 3.85)
    say(s, x + 0.3, 1.5, 3.3, 0.3, [P((tag, 11, True, BLUE))])
    say(s, x + 0.3, 1.82, 3.3, 0.7, [P((q, 15, True, INK, False, HEAD), line=1.15)])
    bullets(s, x + 0.3, 2.6, 3.3, 2.5, items, size=11.5, gap=6)
box(s, 0.6, 5.35, 12.13, 1.4, BLUE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.08)
say(s, 0.9, 5.5, 2.6, 1.1, [P(("Study with families", 17, True, WHITE, False, HEAD), sa=3),
                            P(("planned · results to be added", 11, False, SOFT, True))], anchor=MSO_ANCHOR.MIDDLE)
for i, (big, cap) in enumerate([("20", "caregivers at a hospital admission desk"),
                                ("3 tasks", "find what you pay · find a cheaper choice · ask a question by voice"),
                                ("≥ 70", "target usability score (SUS, out of 100)")]):
    x = 3.7 + i * 3.05
    say(s, x, 5.52, 2.9, 0.5, [P((big, 22, True, WHITE, False, HEAD))])
    say(s, x, 6.02, 2.85, 0.65, [P((cap, 11, False, SOFT), line=1.2)])
s.notes_slide.notes_text_frame.text = (
    "Honest status: the three columns are what we checked and changed in our own design review. No study with "
    "real families has been run yet; the blue box is the plan. Replace it with results once sessions are done.")

# ═══════════════════════════════════════════════════════════════ 9 · PERSONAS
s = new_slide(9)
title(s, "User personas: who each feature was built for", "Five people the prototype was designed and walked through for.")
personas = [
    ("A", "The chatbox", "Rohit, 34, son",
     "“What if Papa needs two days in ICU?” A question the screen does not show.",
     "Ask ClaimCast answers from the engine’s own figures, remembers the conversation, and says so when it does not know."),
    ("B", "Hindi and voice", "Kamla, 45, domestic worker, cannot read",
     "Needs to ask out loud, in Hindi, and hear the answer.",
     "One tap to हिन्दी, the mic takes her question in Hindi, the answer is read back to her; the Ayushman card is asked about up front."),
    ("C", "Transparency", "Mr Sharma, 58, sure he is being cheated",
     "“Why is this cut? Show me where it says so.”",
     "Every cut names its rule; quotes from his own PDF are checked with page numbers; any AI figure not from the engine is flagged."),
    ("D", "Audio answers", "Arjun, 29, blind",
     "Cannot see the numbers on screen.",
     "Read-aloud on every answer, a Listen button, spoken questions, and live screen-reader updates; rupees are said as words."),
    ("E", "Family analysis", "Meena, 42, family floater plan",
     "Husband, two children and her mother-in-law share one policy.",
     "Every member with their own ID; the patient stays separate from the policyholder; at 71, her mother-in-law’s stay is paid automatically by Vay Vandana."),
]
WHERE = {
    "A": "“Ask ClaimCast” button, on every family tab",
    "B": "हिन्दी button, then the mic in the chat",
    "C": "“The working” tab, and the policy PDF upload",
    "D": "“Read answers aloud” and Listen, in the chat",
    "E": "Start → About you → + Add; “Sum insured used” on the path",
}
pw, pg = 2.33, 0.12
for i, (letter, feat, who, need, how) in enumerate(personas):
    x = 0.6 + i * (pw + pg)
    card(s, x, 1.45, pw, 5.35)
    dot(s, x + 0.2, 1.62, letter, 0.46, BLUE, WHITE, 15)
    say(s, x + 0.78, 1.62, pw - 0.9, 0.46, [P((feat, 13, True, BLUE))], anchor=MSO_ANCHOR.MIDDLE)
    say(s, x + 0.2, 2.25, pw - 0.35, 0.62, [P((who, 12.5, True, INK, False, HEAD), line=1.1)])
    say(s, x + 0.2, 2.95, pw - 0.35, 1.2, [P((need, 10.5, False, MUTE, True), line=1.2)])
    box(s, x + 0.2, 4.12, pw - 0.4, 0.012, HAIR)
    say(s, x + 0.2, 4.22, pw - 0.35, 0.28, [P(("ON CLAIMCAST", 9, True, GREEN))])
    say(s, x + 0.2, 4.5, pw - 0.35, 1.55, [P((how, 10.5, False, BODY), line=1.2)])
    box(s, x + 0.12, 6.02, pw - 0.24, 0.66, PALE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.15)
    say(s, x + 0.22, 6.05, pw - 0.44, 0.6, [P(("WHERE  ", 8.5, True, BLUE), (WHERE[letter], 9.5, False, INK), line=1.1)],
        anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "These are design personas, not study participants. Each maps to a live feature: A, the chat dock with memory; "
    "B, the language toggle plus voice input (hi-IN) and read-aloud; C, clause citations, checked quotes and "
    "flagged unsupported figures; D, speech output, aria-live answers and spoken input; E, the family branch with "
    "UUIDs, the 'sum insured used' control for floater plans, and scheme checks by the patient's age.")

# ═══════════════════════════════════════════════════════════════ 10 · ECONOMIC GROUPS
nss = json.load(open(os.path.join(ROOT, "etl", "out", "nsso-75-health.json"), encoding="utf-8"))
cpi = json.load(open(os.path.join(ROOT, "etl", "out", "cpi-health.json"), encoding="utf-8"))
k = float(cpi["factor"])
q = {(r["quintile"], r["sector"]): r for r in nss["byQuintile"]}
labels = ["Poorest 20%", "Next 20%", "Middle 20%", "Next 20%", "Richest 20%"]
urban = [round(q[(f"q{i}", "urban")]["private"] / 100 * k) for i in range(1, 6)]
rural = [round(q[(f"q{i}", "rural")]["private"] / 100 * k) for i in range(1, 6)]
pub = nss["byHospitalType"]["public"]["combined"]
pvt = nss["byHospitalType"]["private"]["combined"]

s = new_slide(10)
title(s, "Who it helps: every income group", "Average spent per stay in a private hospital, by household income (today’s rupees)")
cd = CategoryChartData()
cd.categories = labels
cd.add_series("Cities", urban)
cd.add_series("Villages", rural)
gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.45), Inches(1.45), Inches(6.55), Inches(4.5), cd)
ch = gf.chart
ch.has_legend = True
ch.legend.position = XL_LEGEND_POSITION.TOP
ch.legend.include_in_layout = False
ch.legend.font.size, ch.legend.font.name = Pt(11), TXT
ch.plots[0].gap_width = 45
ch.plots[0].overlap = -8
for ser, col in zip(ch.series, (BLUE, SOFT)):
    ser.format.fill.solid()
    ser.format.fill.fore_color.rgb = col
ch.plots[0].has_data_labels = True
dl = ch.plots[0].data_labels
dl.number_format, dl.number_format_is_linked = '"₹"#,##0', False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size, dl.font.name, dl.font.color.rgb = Pt(11), TXT, INK
dl.font.bold = True
ch.value_axis.visible = False
ch.value_axis.has_major_gridlines = False
ch.value_axis.maximum_scale = 100000
ch.value_axis.minimum_scale = 0
ch.category_axis.reverse_order = True
ch.category_axis.tick_labels.font.size = Pt(11)
ch.category_axis.tick_labels.font.name = TXT
ch.category_axis.format.line.color.rgb = HAIR
say(s, 0.6, 6.0, 6.3, 0.7, [P((
    f"A private hospital stay costs about {pvt / pub:.0f}× a government one. Source: NSS 75th round (2017–18, "
    f"{nss['surveyPeriod']['households']:,} households), adjusted to Dec 2025 prices with the CPI health index.",
    9.5, False, MUTE), line=1.25)])
groups = [
    ("Lower income", "At 70+, Ayushman Vay Vandana pays automatically — nothing owed. Below that, checks for a PM-JAY card."),
    ("Salaried workers", "Shows when ESI (for wages up to ₹21,000 a month) covers the treatment at no cost."),
    ("Government staff", "Shows the CGHS option for serving and retired central government employees."),
    ("Middle income", "Finds the room, hospital and implant that keep the most money in the family."),
    ("Higher income", "Shows the true cost of premium rooms: a suite here means paying ₹2,39,762 yourself."),
]
for i, (h, b) in enumerate(groups):
    y = 1.5 + i * 1.02
    card(s, 7.25, y, 5.48, 0.9)
    dot(s, 7.45, y + 0.22, i + 1, 0.46)
    say(s, 8.1, y + 0.1, 4.5, 0.75, [P((h + "  ", 13, True, INK), (b, 11.5, False, BODY), line=1.2)],
        anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Chart: NSS 75th round Key Indicators, private-hospital expenditure per hospitalisation by household "
    "consumption quintile, multiplied by the CPI health factor used across the project. The ₹2,39,762 suite "
    "figure is the prototype's example admission (synthetic data).")

# ═══════════════════════════════════════════════════════════════ 11 · NOVELTY + COMPETITORS
s = new_slide(11)
title(s, "What is new, and how it compares")
rows = [
    ("", "When it helps", "What you get", "Whose side"),
    ("Hospital insurance desk", "At admission, after you choose", "A spoken estimate", "The hospital"),
    ("Policy websites", "When buying a policy", "Help choosing a plan", "Buyers"),
    ("Insurer’s own app", "After the claim is filed", "Claim status", "The insurer"),
    ("General AI chatbots", "Any time", "Explanations; may guess numbers", "No one"),
    ("ClaimCast", "Before admission, at each choice", "Exact rupees + the rule behind them", "The family"),
]
tbl = s.shapes.add_table(len(rows), 4, Inches(0.6), Inches(1.35), Inches(7.35), Inches(4.3)).table
for j, wd in enumerate([1.95, 1.95, 2.2, 1.25]):
    tbl.columns[j].width = Inches(wd)
for i, row in enumerate(rows):
    tbl.rows[i].height = Inches(0.7 if i else 0.45)
    for j, val in enumerate(row):
        cell = tbl.cell(i, j)
        cell.fill.solid()
        last = i == len(rows) - 1
        cell.fill.fore_color.rgb = BLUE if last else (INK if i == 0 else (WHITE if i % 2 else CARD))
        cell.margin_left = cell.margin_right = Inches(0.12)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.clear()
        tf.word_wrap = True
        r = tf.paragraphs[0].add_run()
        r.text = val
        r.font.name = HEAD if j == 0 and i else TXT
        r.font.size = Pt(10.5 if i == 0 else 11.5)
        r.font.bold = i == 0 or j == 0 or last
        r.font.color.rgb = WHITE if (i == 0 or last) else (INK if j == 0 else BODY)
news = [
    ("Before, not after", "The insurer’s own maths, done before admission while the family can still choose."),
    ("Prices every decision", "Hospital, room, implant, claim route, and now each scan on a health report."),
    ("Shows its working", "Every rupee not paid points to its rule; the AI never makes up a number."),
    ("For the whole family, in their language", "Family IDs, Hindi, voice in and read-aloud, government schemes checked."),
    ("Learns from use", "Shared bills retrain the estimator; policy fixes warn the next family."),
]
for i, (h, b) in enumerate(news):
    y = 1.35 + i * 0.87
    card(s, 8.2, y, 4.53, 0.78)
    dot(s, 8.35, y + 0.18, i + 1, 0.42, BLUE, WHITE, 13)
    say(s, 8.92, y + 0.07, 3.7, 0.7, [P((h, 11.5, True, INK), sa=1), P((b, 10, False, BODY), line=1.1)],
        anchor=MSO_ANCHOR.MIDDLE)
box(s, 0.6, 5.95, 12.13, 0.8, INK, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.12)
say(s, 0.9, 5.95, 11.6, 0.8, [P(("Today:  ", 15, True, SOFT), ("find out after discharge, from a letter.     ", 15, False, WHITE),
                              ("With ClaimCast:  ", 15, True, SOFT), ("know before admission, and choose.", 15, True, WHITE),
                              align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Competitor descriptions are deliberately general: what each kind of service is for, not claims about their "
    "internals. Policy websites means comparison and advice sites such as Policybazaar or Ditto.")

# ═══════════════════════════════════════════════════════════════ 12 · COST
# Inference only, as measured. Chat: ~$0.0005 a question on OpenRouter (Llama
# 3.3 70B). Health report: $0.00041 per PDF/typed read and $0.00086 per photo,
# measured as the OpenRouter usage delta over three reads each. A bill estimate
# is ~1 ms of CPU at Cloud Run's $0.000024 per vCPU-second.
USD = 88                      # rupees per US dollar, assumed
CHAT_Q = 0.0005 * USD         # rupees per chat question
REPORT = 0.00086 * USD        # rupees per health report (priced as a photo, the dearer case)
EST = 0.002 * 0.000024 * USD  # rupees per bill estimate (2 ms, generous)
Q_PER_FAMILY, R_PER_FAMILY, EST_PER_FAMILY = 5, 1, 20

s = new_slide(12)
title(s, "What each answer costs", "Inference only — the cost of answering a family, measured on the working prototype")
stats = [
    ("₹0", "for data", "Every price list and rule comes from public government sources."),
    ("~4 paise", "per chat question", "Llama 3.3 70B through OpenRouter, measured on our own usage."),
    ("4–8 paise", "per health report", "4 for a PDF or typed report, 8 for a photo (read by Gemini Flash first). Measured."),
    ("≈ ₹0", "per bill estimate", "The estimator answers in about 1 millisecond on an ordinary CPU."),
]
for i, (big, unit, why) in enumerate(stats):
    x = 0.6 + i * 3.08
    card(s, x, 1.5, 2.88, 2.15)
    say(s, x + 0.25, 1.68, 2.5, 0.7, [P((big, 30, True, BLUE, False, HEAD))])
    say(s, x + 0.25, 2.38, 2.5, 0.35, [P((unit, 13, True, INK))])
    say(s, x + 0.25, 2.75, 2.45, 0.85, [P((why, 11, False, BODY), line=1.2)])

say(s, 0.6, 3.9, 8.3, 0.35, [P(("IF WE SCALE UP  ·  per family: 5 questions, 1 health report (photo), 20 bill estimates", 11, True, BLUE))])
rows = [("Families a month", "Chat questions", "Chat cost", "Reports", "Total a month", "Per family")]
for fam, label, questions in ((1_000, "1,000", "5,000"), (1_00_000, "1 lakh", "5 lakh"), (10_00_000, "10 lakh", "50 lakh")):
    chat = fam * Q_PER_FAMILY * CHAT_Q
    rep = fam * R_PER_FAMILY * REPORT
    est = fam * EST_PER_FAMILY * EST
    rows.append((label, questions, inr(chat), inr(rep), inr(chat + rep + est), f"{(chat + rep + est) / fam * 100:.0f} paise"))
PER_FAMILY = (Q_PER_FAMILY * CHAT_Q + R_PER_FAMILY * REPORT + EST_PER_FAMILY * EST) * 100
tbl = s.shapes.add_table(len(rows), 6, Inches(0.6), Inches(4.3), Inches(8.1), Inches(2.4)).table
for j, wd in enumerate([1.55, 1.4, 1.3, 1.25, 1.45, 1.15]):
    tbl.columns[j].width = Inches(wd)
for i, row in enumerate(rows):
    tbl.rows[i].height = Inches(0.52 if i == 0 else 0.6)
    for j, val in enumerate(row):
        cell = tbl.cell(i, j)
        cell.fill.solid()
        cell.fill.fore_color.rgb = INK if i == 0 else (WHITE if i % 2 else CARD)
        cell.margin_left = cell.margin_right = Inches(0.12)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.clear()
        r = tf.paragraphs[0].add_run()
        r.text = val
        r.font.name, r.font.size = TXT, Pt(11 if i == 0 else 13)
        r.font.bold = i == 0 or j in (0, 4)
        r.font.color.rgb = WHITE if i == 0 else (BLUE if j == 4 else INK)
box(s, 9.0, 3.95, 3.73, 2.75, GREEN, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.06)
say(s, 9.3, 4.15, 3.2, 2.4, [
    P((f"~{PER_FAMILY:.0f} paise", 36, True, WHITE, False, HEAD), sa=4),
    P(("per family, at any size: cost grows in a straight line with use, with no big fixed cost.", 12.5, False, WHITE), line=1.25, sa=8),
    P(("Against ₹78,400 saved in our example admission.", 12, True, WHITE), line=1.2)],
    anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Inference cost only; hosting, storage and staff are not included. Chat: about $0.0005 a question. Health "
    "report: $0.00041 per PDF or typed read and $0.00086 per photo, measured from the OpenRouter usage counter "
    "over three reads each. Bill estimate: 0.9-2.7 ms per answer, priced at 2 ms of Cloud Run CPU. $1 = ₹88. "
    "Retraining the estimator takes seconds on a laptop CPU. The ₹78,400 is the prototype's example case.")

# ═══════════════════════════════════════════════════════════════ 13 · FUTURE
s = new_slide(13)
title(s, "What comes next")
phases = [
    ("Next 3 months", "Prove it helps families", [
        "Study with 20 families at an admission desk, including blind users with a screen reader",
        "Tamil, Bengali and Marathi, with voice in each",
        "WhatsApp: send a voice note or a photo of the report, get a spoken answer",
        "Proper logins and roles for the team side",
    ], "Target: usability score 70+"),
    ("Next 6 months", "Real prices, real bills", [
        "Partner hospitals share price lists and final bills, so scan and bill estimates use real prices",
        "Price all 1,949 PM-JAY packages on the path (15 today)",
        "Family floater: sum insured used by each member counted from their saved stays",
        "Read the policy formats of India’s 20 largest insurers",
    ], "Target: estimate within 15% of the real bill"),
    ("Next 12 months", "Ready for real patients", [
        "Pilot at a hospital admission desk",
        "Link health records through Ayushman Bharat Digital Mission, with consent",
        "Consent, deletion and audit under India’s DPDP Act, 2023",
        "Cashless pre-approval sent straight to the insurer",
    ], "Target: 1 lakh families a month"),
]
for i, (when, goal, items, target) in enumerate(phases):
    x = 0.6 + i * 4.15
    card(s, x, 1.3, 3.85, 4.55)
    dot(s, x + 0.3, 1.52, i + 1, 0.52)
    say(s, x + 0.98, 1.5, 2.8, 0.4, [P((when, 18, True, INK, False, HEAD))])
    say(s, x + 0.98, 1.88, 2.8, 0.3, [P((goal, 11.5, True, BLUE))])
    bullets(s, x + 0.3, 2.42, 3.35, 2.85, items, size=11, gap=6)
    box(s, x + 0.3, 5.28, 3.25, 0.42, PALE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.3)
    say(s, x + 0.3, 5.28, 3.25, 0.42, [P((target, 11, True, BLUE), align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
card(s, 0.6, 6.0, 12.13, 0.85, PALE, None)
say(s, 0.9, 6.0, 11.6, 0.85, [P(("Already in place: ", 12, True, BLUE),
                              ("family profiles with unique IDs · two government schemes applied automatically by age "
                               "(RBSK, Vay Vandana) · health reports turned into a plan · English and Hindi · "
                               "voice questions and read-aloud · estimator trained on 1,949 PM-JAY packages that retrains itself "
                               "· chat memory", 12, False, INK), line=1.2)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Roadmap dates and targets are goals, not commitments. DPDP Act: Digital Personal Data Protection Act, 2023. "
    "ABDM: Ayushman Bharat Digital Mission, the national digital health records programme. The estimator's "
    "training pool is 17,715 tariff rows built from the 1,949 PM-JAY HBP 2022 packages and CGHS rates.")

# ═══════════════════════════════════════════════════════════════ 14 · THANK YOU
s = new_slide(14)
box(s, 0, 0, W, H, BLUE)
say(s, 0.9, 2.1, 11.53, 1.2, [P(("ClaimCast", 72, True, WHITE, False, HEAD), align=PP_ALIGN.CENTER)])
say(s, 0.9, 3.35, 11.53, 0.6, [P(("The decision, before the bill.", 24, False, SOFT, True, HEAD), align=PP_ALIGN.CENTER)])
say(s, 0.9, 4.6, 11.53, 0.5, [P(("Thank you  ·  Questions welcome", 18, True, WHITE), align=PP_ALIGN.CENTER)])
say(s, 0.9, 6.6, 11.53, 0.35, [P(("Estimates, not guarantees  ·  money only, no medical advice  ·  demo uses made-up patients and hospitals",
                                  10.5, False, SOFT), align=PP_ALIGN.CENTER)])
for sh in list(s.shapes):
    if sh.has_text_frame and sh.text_frame.text.startswith("ClaimCast  ·  Team Rocket"):
        sh._element.getparent().remove(sh._element)

prs.save(OUT)
print("wrote", OUT, "·", len(prs.slides), "slides")
