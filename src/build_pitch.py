# -*- coding: utf-8 -*-
"""
The ClaimCast pitch deck: eleven slides on the official PCC 2026 template,
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
    ("Tell us", "Your insurance plan, the treatment and the hospital. Upload your policy PDF if you have it — we read it, you check it."),
    ("See every choice", "Which hospital, which room, which implant, cashless or refund. Each choice shows exactly what you would pay."),
    ("Understand the bill", "Every rupee your insurance will not pay, line by line, with the policy rule that causes it."),
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
    P(("just by knowing the room limit before choosing a bed. A chat assistant answers any question about it, "
       "in plain words.", 12.5, False, WHITE), line=1.25)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "The example is the prototype's reference admission (synthetic data). The ₹78,400 comes from the engine: "
    "₹1,26,900 minus ₹48,500. The chat assistant only repeats figures the engine calculated.")

# ═══════════════════════════════════════════════════════════════ 4 · TWO SIDES
s = new_slide(4)
title(s, "Two sides of ClaimCast", "What families see, and how ClaimCast remembers and keeps learning.")
card(s, 0.6, 1.75, 5.7, 4.95, PALE, None)
say(s, 0.9, 1.95, 5.2, 0.4, [P(("FOR FAMILIES", 11, True, BLUE))])
say(s, 0.9, 2.3, 5.2, 0.5, [P(("Patient / Caregiver", 22, True, INK, False, HEAD))])
bullets(s, 0.9, 3.0, 5.2, 3.6, [
    ("Start", "— about you and your insurance, in simple questions."),
    ("The path", "— every choice, and what it costs you."),
    ("The working", "— your bill line by line, each cut explained."),
    ("Ask ClaimCast", "— a chat assistant for any question about the bill."),
    ("Save my session", "— keeps your details and questions for next time."),
], size=15, gap=15)
arr = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(6.45), Inches(3.75), Inches(0.5), Inches(0.5))
arr.fill.solid()
arr.fill.fore_color.rgb = SOFT
arr.line.fill.background()
box(s, 7.1, 1.75, 5.63, 4.95, BLUE, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.06)
say(s, 7.4, 1.95, 5.1, 0.4, [P(("FOR THE CLAIMCAST TEAM", 11, True, SOFT))])
say(s, 7.4, 2.3, 5.1, 0.5, [P(("Memory and self-learning", 22, True, WHITE, False, HEAD))])
for i, (h, b) in enumerate([
        ("Every saved session", "is kept: who, which hospital, what they pay, what they asked."),
        ("The chat assistant remembers", "how past questions were answered, and explains better each time."),
        ("The bill estimator retrains itself", "after every 10 real bills families share."),
        ("Misread policy details", "are counted, so the next family is warned to double-check them.")]):
    y = 3.0 + i * 0.9
    dot(s, 7.4, y, i + 1, 0.4, WHITE, BLUE, 13)
    say(s, 7.95, y - 0.02, 4.6, 0.8, [P((h + " ", 13, True, WHITE), (b, 12.5, False, SOFT), line=1.25)])
s.notes_slide.notes_text_frame.text = (
    "Login shows two choices: Patient/Caregiver and ClaimCast team. No password in the demo. The chat "
    "assistant's model is not retrained; it improves by recalling similar saved conversations. The bill "
    "estimator (an XGBoost model) is genuinely retrained on shared bills.")

# ═══════════════════════════════════════════════════════════════ 5 · USER STUDY
s = new_slide(5)
title(s, "User study: is it easy, open to everyone, and useful?")
cols = [
    ("USABILITY", "Can a stressed caregiver use it in minutes?", [
        "The answer comes first: “As things stand, you pay ₹…” is the first thing on the page.",
        "Insurance words replaced: “Illness began before the policy?” instead of “pre-existing condition”.",
        "One question per screen section; every choice shows its rupee effect.",
    ]),
    ("ACCESSIBILITY", "Can everyone read and trust it?", [
        "High-contrast colours and large figures; fixed labels that ran into each other.",
        "Works without uploading anything — the policy PDF is optional.",
        "Next: Hindi and regional languages, voice questions, screen-reader checks.",
    ]),
    ("PURPOSE", "Does it change a decision?", [
        "Each choice shows how much it saves or costs, e.g. ₹78,400 for the right room.",
        "The assistant only speaks about money and sends medical questions to the doctor.",
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
                                ("3 tasks", "find what you pay · find a cheaper choice · ask the assistant"),
                                ("≥ 70", "target usability score (SUS, out of 100)")]):
    x = 3.7 + i * 3.05
    say(s, x, 5.52, 2.9, 0.5, [P((big, 22, True, WHITE, False, HEAD))])
    say(s, x, 6.02, 2.85, 0.65, [P((cap, 11, False, SOFT), line=1.2)])
s.notes_slide.notes_text_frame.text = (
    "Honest status: the three columns are what we checked and changed in our own design review. No study with "
    "real families has been run yet; the blue box is the plan. Replace it with results once sessions are done.")

# ═══════════════════════════════════════════════════════════════ 6 · ECONOMIC GROUPS
nss = json.load(open(os.path.join(ROOT, "etl", "out", "nsso-75-health.json"), encoding="utf-8"))
cpi = json.load(open(os.path.join(ROOT, "etl", "out", "cpi-health.json"), encoding="utf-8"))
k = float(cpi["factor"])
q = {(r["quintile"], r["sector"]): r for r in nss["byQuintile"]}
labels = ["Poorest 20%", "Next 20%", "Middle 20%", "Next 20%", "Richest 20%"]
urban = [round(q[(f"q{i}", "urban")]["private"] / 100 * k) for i in range(1, 6)]
rural = [round(q[(f"q{i}", "rural")]["private"] / 100 * k) for i in range(1, 6)]
pub = nss["byHospitalType"]["public"]["combined"]
pvt = nss["byHospitalType"]["private"]["combined"]

s = new_slide(6)
title(s, "Who it helps: every income group", "Average spent per stay in a private hospital, by household income (today’s rupees)")
cd = CategoryChartData()
cd.categories = labels
cd.add_series("Cities", urban)
cd.add_series("Villages", rural)
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.5), Inches(1.5), Inches(6.4), Inches(4.4), cd)
ch = gf.chart
ch.has_legend = True
ch.legend.position = XL_LEGEND_POSITION.TOP
ch.legend.include_in_layout = False
ch.legend.font.size, ch.legend.font.name = Pt(11), TXT
ch.plots[0].gap_width = 60
for ser, col in zip(ch.series, (BLUE, SOFT)):
    ser.format.fill.solid()
    ser.format.fill.fore_color.rgb = col
ch.plots[0].has_data_labels = True
dl = ch.plots[0].data_labels
dl.number_format, dl.number_format_is_linked = '"₹"#,##0', False
dl.position = XL_LABEL_POSITION.OUTSIDE_END
dl.font.size, dl.font.name, dl.font.color.rgb = Pt(9), TXT, BODY
ch.value_axis.visible = False
ch.value_axis.has_major_gridlines = False
ch.category_axis.tick_labels.font.size = Pt(10.5)
ch.category_axis.tick_labels.font.name = TXT
ch.category_axis.format.line.color.rgb = HAIR
say(s, 0.6, 6.0, 6.3, 0.7, [P((
    f"A private hospital stay costs about {pvt / pub:.0f}× a government one. Source: NSS 75th round (2017–18, "
    f"{nss['surveyPeriod']['households']:,} households), adjusted to Dec 2025 prices with the CPI health index.",
    9.5, False, MUTE), line=1.25)])
groups = [
    ("Lower income", "Checks if an Ayushman Bharat (PM-JAY) card — or age 70+ — makes the stay free at this hospital."),
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

# ═══════════════════════════════════════════════════════════════ 7 · NOVELTY
s = new_slide(7)
title(s, "What is new about ClaimCast")
news = [
    ("Before, not after", "Insurers calculate after discharge. ClaimCast does the same calculation before admission, while the family can still choose."),
    ("Prices the decision", "Other tools explain policy wording. ClaimCast puts a rupee figure on each choice: hospital, room, implant, claim type."),
    ("Shows its working", "Every rupee not paid points to the policy rule behind it. The assistant never makes up a number."),
    ("Learns from every family", "Saved sessions become memory. Shared bills retrain the bill estimator. Fixed policy details make the next reading safer."),
]
for i, (h, b) in enumerate(news):
    x = 0.6 + (i % 2) * 6.15
    y = 1.35 + (i // 2) * 2.1
    card(s, x, y, 5.95, 1.9)
    dot(s, x + 0.3, y + 0.3, i + 1, 0.52, BLUE, WHITE, 16)
    say(s, x + 1.05, y + 0.3, 4.65, 0.45, [P((h, 18, True, INK, False, HEAD))])
    say(s, x + 1.05, y + 0.8, 4.65, 1.05, [P((b, 12.5, False, BODY), line=1.28)])
box(s, 0.6, 5.7, 12.13, 1.05, INK, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.1)
say(s, 0.9, 5.7, 11.6, 1.05, [P(("Today:  ", 15, True, SOFT), ("find out after discharge, from a letter.     ", 15, False, WHITE),
                              ("With ClaimCast:  ", 15, True, SOFT), ("know before admission, and choose.", 15, True, WHITE),
                              align=PP_ALIGN.CENTER)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = "Retrieval to simulation: existing tools retrieve wording; ClaimCast simulates the claim."

# ═══════════════════════════════════════════════════════════════ 8 · COST
s = new_slide(8)
title(s, "What ClaimCast costs to run", "Measured on the working prototype")
stats = [
    ("₹0", "for data", "Every price list and rule comes from public government sources."),
    ("₹9–15", "a month to host", "Runs on Google Cloud free tiers; a ₹200 budget alert guards it."),
    ("~5 paise", "per chat question", "Llama 3.3 70B through OpenRouter — measured on our own usage."),
    ("~5 sec", "to retrain the estimator", "On a normal laptop. No GPU or special hardware needed."),
]
for i, (big, unit, why) in enumerate(stats):
    x = 0.6 + i * 3.08
    card(s, x, 1.55, 2.88, 2.75)
    say(s, x + 0.25, 1.8, 2.5, 0.75, [P((big, 34, True, BLUE, False, HEAD))])
    say(s, x + 0.25, 2.55, 2.5, 0.35, [P((unit, 13, True, INK))])
    say(s, x + 0.25, 2.95, 2.45, 1.25, [P((why, 11.5, False, BODY), line=1.25)])
box(s, 0.6, 4.65, 12.13, 2.1, GREEN, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.06)
say(s, 0.95, 4.85, 5.5, 1.7, [
    P(("Under ₹1", 44, True, WHITE, False, HEAD), sa=2),
    P(("to serve one family’s whole session, including five chat questions.", 13.5, False, WHITE), line=1.25)],
    anchor=MSO_ANCHOR.MIDDLE)
box(s, 6.75, 5.0, 0.015, 1.4, WHITE)
say(s, 7.1, 4.85, 5.4, 1.7, [
    P(("₹78,400", 44, True, WHITE, False, HEAD), sa=2),
    P(("saved in our example admission by choosing the right room.", 13.5, False, WHITE), line=1.25)],
    anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "Hosting: infra/deploy.md (Cloud Run + always-free e2-micro Postgres; Artifact Registry ~₹9–15/month). "
    "Chat: OpenRouter usage rose about $0.005 over ~11 test calls, under 5 paise each. Retrain: the full "
    "artifact build ran in 4.6 s on a MacBook. The ₹78,400 is the prototype's example case.")

# ═══════════════════════════════════════════════════════════════ 9 · COMPETITORS
s = new_slide(9)
title(s, "How ClaimCast compares")
rows = [
    ("", "When it helps", "What you get", "Whose side"),
    ("Hospital insurance desk", "At admission, after you choose", "A spoken estimate", "The hospital"),
    ("Policy websites (Policybazaar, Ditto)", "When buying a policy", "Help choosing a plan", "People buying a policy"),
    ("Insurer’s own app", "After the claim is filed", "Claim status", "The insurer"),
    ("General AI chatbots", "Any time", "Explanations, but may guess numbers", "No one in particular"),
    ("ClaimCast", "Before admission, at each choice", "Exact rupees + the rule behind them", "The family"),
]
tbl = s.shapes.add_table(len(rows), 4, Inches(0.6), Inches(1.35), Inches(12.13), Inches(4.9)).table
widths = [3.3, 3.0, 3.35, 2.48]
for j, wd in enumerate(widths):
    tbl.columns[j].width = Inches(wd)
for i, row in enumerate(rows):
    tbl.rows[i].height = Inches(0.78 if i else 0.55)
    for j, val in enumerate(row):
        cell = tbl.cell(i, j)
        cell.fill.solid()
        last = i == len(rows) - 1
        cell.fill.fore_color.rgb = BLUE if last else (INK if i == 0 else (WHITE if i % 2 else CARD))
        cell.margin_left = cell.margin_right = Inches(0.18)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf = cell.text_frame
        tf.clear()
        r = tf.paragraphs[0].add_run()
        r.text = val
        r.font.name = HEAD if j == 0 and i else TXT
        r.font.size = Pt(12 if i == 0 else 13)
        r.font.bold = i == 0 or j == 0 or last
        r.font.color.rgb = WHITE if (i == 0 or last) else (INK if j == 0 else BODY)
say(s, 0.6, 6.45, 12.1, 0.4, [P(("Only ClaimCast speaks before the decision, puts a price on each choice, and works for the family.",
                                  13, True, BLUE))])
s.notes_slide.notes_text_frame.text = (
    "Competitor descriptions are deliberately general: what each kind of service is for, not claims about "
    "their internals.")

# ═══════════════════════════════════════════════════════════════ 10 · FUTURE
s = new_slide(10)
title(s, "What comes next")
phases = [
    ("Next 3 months", ["Study with 20 real families", "Hindi and regional languages", "Ask by voice or WhatsApp"]),
    ("Next 6 months", ["Partner hospitals share real prices and bills", "The estimator learns from real bills",
                       "Connect to insurers’ cashless approval"]),
    ("Next 12 months", ["Pilot at a hospital admission desk", "Mobile app for families",
                        "Strong privacy, consent and security for real data"]),
]
for i, (when, items) in enumerate(phases):
    x = 0.6 + i * 4.15
    card(s, x, 1.45, 3.85, 3.95)
    dot(s, x + 0.3, 1.72, i + 1, 0.52)
    say(s, x + 0.98, 1.8, 2.8, 0.45, [P((when, 18, True, INK, False, HEAD))])
    bullets(s, x + 0.3, 2.6, 3.3, 2.7, items, size=14, gap=12)
card(s, 0.6, 5.75, 12.13, 1.0, PALE, None)
say(s, 0.9, 5.75, 11.6, 1.0, [P(("Already in place: ", 13, True, BLUE),
                              ("all 1,949 government treatment prices are loaded, the estimator retrains itself, "
                               "and the chat assistant learns from every saved session.", 13, False, INK),
                              line=1.25)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = "Roadmap dates are targets, not commitments."

# ═══════════════════════════════════════════════════════════════ 11 · THANK YOU
s = new_slide(11)
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
