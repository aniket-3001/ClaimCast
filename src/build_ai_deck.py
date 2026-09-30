# -*- coding: utf-8 -*-
"""
ClaimCast — The AI Inside: a ten-slide companion deck on the same PCC 2026
template as the main pitch deck, going deep on exactly one question a judge
reading the main deck would ask next: where is the AI, what does it see, what
does it give back, and what stops it from being trusted blindly.

Self-contained on purpose: it does not import build_pitch.py, which runs its
own slide-building code at import time and would rebuild that deck as a side
effect. The small drawing kit below is duplicated from it deliberately, so the
two decks share a look without sharing an import.

Five slides carry real, click-triggered PowerPoint entrance animations (not a
simulation of one) — the family-journey map, the end-to-end architecture, and
the three pipeline deep-dives — built directly as OOXML timing trees, since
python-pptx has no animation API. That construction was tested in isolation
first: schema-validated (scripts/office/validate.py), round-tripped through
python-pptx, and rendered through LibreOffice, before being used here. Every
slide also carries a plain fade transition.

Every figure is read from the code or a source already cited in the main
deck; none is invented for this one.

    python src/build_ai_deck.py   ->   presentation deck/ClaimCast - The AI Inside.pptx
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deckkit import ROOT, SRC  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.chart.data import CategoryChartData  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION  # noqa: E402
from pptx.enum.shapes import MSO_SHAPE  # noqa: E402
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402
from lxml import etree  # noqa: E402

OUT = os.path.join(ROOT, "presentation deck", "ClaimCast - The AI Inside.pptx")

# ── Palette and type — identical to the main deck, on purpose ────────────
BLUE = RGBColor(0x00, 0x5E, 0xB8)
DEEP = RGBColor(0x00, 0x3F, 0x7D)
PALE = RGBColor(0xE8, 0xF1, 0xFA)
SOFT = RGBColor(0xC4, 0xDC, 0xEF)
INK = RGBColor(0x14, 0x18, 0x1C)
BODY = RGBColor(0x2B, 0x31, 0x38)
MUTE = RGBColor(0x5F, 0x68, 0x72)
RED = RGBColor(0xC8, 0x10, 0x2E)
GREEN = RGBColor(0x00, 0x7A, 0x4D)
PALE_GREEN = RGBColor(0xE5, 0xF3, 0xEC)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
HAIR = RGBColor(0xD9, 0xDE, 0xE4)
CARD = RGBColor(0xF4, 0xF7, 0xFA)
AMBER = RGBColor(0xB2, 0x6B, 0x00)
HEAD, TXT = "Rockwell", "Arial"
W, H = 13.333, 7.5


# ── Small drawing kit — same shapes as the main deck ──────────────────────
def box(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None, dash=None):
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
        s.line.width = Pt(1.25 if dash else 1)
        if dash:
            ln = s.line._get_or_add_ln()
            pd = etree.SubElement(ln, "{http://schemas.openxmlformats.org/drawingml/2006/main}prstDash")
            pd.set("val", dash)
    s.shadow.inherit = False
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    return s


def card(slide, x, y, w, h, fill=CARD, line=HAIR, dash=None):
    return box(slide, x, y, w, h, fill, line, MSO_SHAPE.ROUNDED_RECTANGLE, 0.08, dash=dash)


def say(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP):
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
    say(slide, 0.6, 0.38, 12.1, 0.62, [P((text, 28, True, INK, False, HEAD))])
    if sub:
        say(slide, 0.6, 1.0, 12.1, 0.36, [P((sub, 13.5, False, MUTE))])


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
    say(slide, 0.6, 7.02, 9, 0.25,
        [P(("ClaimCast · The AI Inside  ·  Team Rocket, IIIT-Delhi  ·  Precision Care Challenge 2026", 9, False, MUTE))])
    say(slide, 11.73, 7.02, 1.0, 0.25, [P((str(n), 10, True, BLUE), align=PP_ALIGN.RIGHT)])


def bullets(slide, x, y, w, h, items, size=13, color=BODY, gap=7, mk=BLUE):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.line_spacing = 1.15
        head, rest = it if isinstance(it, tuple) else (None, it)
        r0 = p.add_run()
        r0.text = "•  "
        r0.font.name, r0.font.size, r0.font.bold = TXT, Pt(size), True
        r0.font.color.rgb = mk
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


def arrow(slide, x, y, w=0.22, h=0.26, shape=MSO_SHAPE.RIGHT_ARROW, fill=SOFT):
    a = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    a.fill.solid()
    a.fill.fore_color.rgb = fill
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def chip(slide, x, y, w, h, text, fill, color=WHITE, size=10.5, bold=True, align=PP_ALIGN.CENTER):
    c = box(slide, x, y, w, h, fill, None, MSO_SHAPE.ROUNDED_RECTANGLE, 0.28)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = Inches(0.06)
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.name, r.font.size, r.font.bold = TXT, Pt(size), bold
    r.font.color.rgb = color
    return c


def badge(slide, x, y, text, ink=GREEN, fill=PALE_GREEN):
    """A small pill flagging something as checked by code, not by the model."""
    w = 0.12 + 0.082 * len(text)
    c = chip(slide, x, y, w, 0.26, text, fill, ink, 8.5, True)
    return c


# ── Real PowerPoint animation, built directly ─────────────────────────────
# python-pptx has no animation API, so this writes the OOXML timing tree by
# hand. Tested in isolation before use here: schema-validated, round-tripped
# through python-pptx, and rendered through LibreOffice with no error.
_NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


def _qn(tag):
    pfx, local = tag.split(":")
    return "{%s}%s" % (_NS[pfx], local)


def animate_appear(slide, shapes):
    """Each shape in `shapes` appears on its own mouse click, in order —
    PowerPoint's standard 'Appear' entrance, click-triggered."""
    if not shapes:
        return
    sld = slide._element
    timing = etree.SubElement(sld, _qn("p:timing"))
    tnLst = etree.SubElement(timing, _qn("p:tnLst"))
    par0 = etree.SubElement(tnLst, _qn("p:par"))
    cTn0 = etree.SubElement(par0, _qn("p:cTn"))
    cTn0.set("id", "1")
    cTn0.set("dur", "indefinite")
    cTn0.set("restart", "never")
    cTn0.set("nodeType", "tmRoot")
    childTnLst0 = etree.SubElement(cTn0, _qn("p:childTnLst"))
    seq = etree.SubElement(childTnLst0, _qn("p:seq"))
    seq.set("concurrent", "1")
    seq.set("nextAc", "seek")
    cTnSeq = etree.SubElement(seq, _qn("p:cTn"))
    cTnSeq.set("id", "2")
    cTnSeq.set("dur", "indefinite")
    cTnSeq.set("nodeType", "mainSeq")
    childTnLstSeq = etree.SubElement(cTnSeq, _qn("p:childTnLst"))

    nid = [3]

    def nxt():
        v = nid[0]
        nid[0] += 1
        return str(v)

    for shape in shapes:
        par = etree.SubElement(childTnLstSeq, _qn("p:par"))
        cTn = etree.SubElement(par, _qn("p:cTn"))
        cTn.set("id", nxt())
        cTn.set("fill", "hold")
        stCondLst = etree.SubElement(cTn, _qn("p:stCondLst"))
        etree.SubElement(stCondLst, _qn("p:cond")).set("delay", "indefinite")
        childTnLst = etree.SubElement(cTn, _qn("p:childTnLst"))

        par2 = etree.SubElement(childTnLst, _qn("p:par"))
        cTn2 = etree.SubElement(par2, _qn("p:cTn"))
        cTn2.set("id", nxt())
        cTn2.set("fill", "hold")
        stCondLst2 = etree.SubElement(cTn2, _qn("p:stCondLst"))
        etree.SubElement(stCondLst2, _qn("p:cond")).set("delay", "0")
        childTnLst2 = etree.SubElement(cTn2, _qn("p:childTnLst"))

        set_el = etree.SubElement(childTnLst2, _qn("p:set"))
        cBhvr = etree.SubElement(set_el, _qn("p:cBhvr"))
        cTn3 = etree.SubElement(cBhvr, _qn("p:cTn"))
        cTn3.set("id", nxt())
        cTn3.set("dur", "1")
        cTn3.set("fill", "hold")
        stCondLst3 = etree.SubElement(cTn3, _qn("p:stCondLst"))
        etree.SubElement(stCondLst3, _qn("p:cond")).set("delay", "0")
        tgtEl = etree.SubElement(cBhvr, _qn("p:tgtEl"))
        etree.SubElement(tgtEl, _qn("p:spTgt")).set("spid", str(shape.shape_id))
        attrNameLst = etree.SubElement(cBhvr, _qn("p:attrNameLst"))
        an = etree.SubElement(attrNameLst, _qn("p:attrName"))
        an.text = "style.visibility"
        to_el = etree.SubElement(set_el, _qn("p:to"))
        etree.SubElement(to_el, _qn("p:strVal")).set("val", "visible")


def add_fade_transition(slide, speed="med"):
    """A plain fade between slides. Cheap, reliable motion on every slide."""
    sld = slide._element
    cSld = sld.find(_qn("p:cSld"))
    clrMapOvr = sld.find(_qn("p:clrMapOvr"))
    anchor_el = clrMapOvr if clrMapOvr is not None else cSld
    transition = etree.Element(_qn("p:transition"))
    transition.set("spd", speed)
    etree.SubElement(transition, _qn("p:fade"))
    anchor_el.addnext(transition)


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


def new_slide(n, transition=True):
    s = prs.slides.add_slide(BLANK)
    footer(s, n)
    if transition:
        add_fade_transition(s)
    return s


# ═══════════════════════════════════════════════════════════════ 1 · TITLE
s1 = prs.slides[0]
band = box(s1, 0, 0, W, 4.1, BLUE)
s1.shapes._spTree.remove(band._element)
s1.shapes._spTree.insert(2, band._element)
t = s1.shapes.title
t.left, t.top, t.width, t.height = Inches(0.9), Inches(0.55), Inches(11.53), Inches(0.34)
tf = t.text_frame
tf.clear()
r = tf.paragraphs[0].add_run()
r.text = "PRECISION CARE CHALLENGE 2026   ·   GE HEALTHCARE"
r.font.name, r.font.size, r.font.bold, r.font.color.rgb = TXT, Pt(11), True, SOFT
tf.paragraphs[0].alignment = PP_ALIGN.CENTER
sub = [p for p in s1.placeholders if p.placeholder_format.idx == 1][0]
sub.left, sub.top, sub.width, sub.height = Inches(0.9), Inches(1.18), Inches(11.53), Inches(1.3)
tf = sub.text_frame
tf.clear()
r = tf.paragraphs[0].add_run()
r.text = "ClaimCast"
r.font.name, r.font.size, r.font.bold, r.font.color.rgb = HEAD, Pt(68), True, WHITE
tf.paragraphs[0].alignment = PP_ALIGN.CENTER
chip(s1, 5.42, 2.5, 2.5, 0.34, "THE AI INSIDE", DEEP, SOFT, 11.5)
say(s1, 1.4, 3.05, 10.53, 0.85, [
    P(("Where language models read, where they answer, and what stops either from ", 17, False, SOFT),
      ("deciding a rupee", 17, True, WHITE), (".", 17, False, SOFT), align=PP_ALIGN.CENTER, line=1.25)])
say(s1, 0.9, 4.55, 11.53, 0.34, [
    P(("COMPANION DECK", 11, True, RED), ("   ·   architecture, the three AI pipelines, and how every answer "
                                          "is checked", 12, False, BODY),
      align=PP_ALIGN.CENTER)])
say(s1, 0.9, 5.5, 11.53, 1.0, [
    P(("Team Rocket", 26, True, INK, False, HEAD), align=PP_ALIGN.CENTER, sa=6),
    P(("Indraprastha Institute of Information Technology, Delhi (IIIT-Delhi)", 12.5, False, BODY), align=PP_ALIGN.CENTER)])
s1.notes_slide.notes_text_frame.text = (
    "This is the companion deck: it assumes the audience has seen (or will see) the main ClaimCast pitch, and "
    "goes deep on one question from it -- 'where's the AI, and why should I trust it?' No claim here repeats a "
    "number from the main deck without being re-derived from the code in this same session.")

# ═══════════════════════════════════════════════════════ 2 · THE ONE RULE
s = new_slide(2)
title(s, "One rule decides everything on this page")
card(s, 0.6, 1.35, 12.13, 1.35, DEEP, None)
say(s, 0.95, 1.35, 11.4, 1.35, [
    P(("Language models read documents and explain figures.", 22, True, WHITE, False, HEAD), sa=2, line=1.15),
    P(("They never compute a rupee.", 22, True, SOFT, False, HEAD), line=1.15)],
    anchor=MSO_ANCHOR.MIDDLE)

colw = 5.75
card(s, 0.6, 3.0, colw, 3.35)
say(s, 0.9, 3.2, colw - 0.6, 0.32, [P(("WHERE AI IS USED — three tasks, nowhere else", 11.5, True, BLUE))])
for i, (h, b) in enumerate([
        ("Reading your policy PDF", "proposes 17 details, each quoted to a page — nothing prices until you confirm it."),
        ("Ask ClaimCast (chat)", "explains the figures the engine already worked out — never a new one."),
        ("Reading a health report", "proposes a diagnosis, tests and a treatment, each quoted — same gate."),
]):
    y = 3.68 + i * 0.85
    dot(s, 0.9, y, i + 1, 0.38, BLUE, WHITE, 12)
    say(s, 1.4, y - 0.03, colw - 0.9, 0.8, [P((h + "  ", 13, True, INK), (b, 11.5, False, BODY), line=1.22)])

card(s, 6.78, 3.0, colw, 3.35, WHITE, GREEN, dash="dash")
say(s, 7.08, 3.2, colw - 0.6, 0.32, [P(("NEVER AI — deterministic, checked by tests", 11.5, True, GREEN))])
bullets(s, 7.08, 3.62, colw - 0.55, 2.6, [
    ("The money engine —", "IRDAI and policy rules, the same code in the browser and on the server."),
    ("The bill-range model —", "XGBoost, fitted on tariffs and settled bills, not a language model."),
    ("Matching a scan to its CGHS code —", "fixed word-overlap rules, even inside the health-report pipeline."),
    ("Voice in and read-aloud —", "the browser's own speech engine, no call leaves the device."),
], size=11.5, gap=9, mk=GREEN)

card(s, 0.6, 6.4, 12.13, 0.78, PALE, None)
say(s, 0.9, 6.4, 11.55, 0.78, [P(
    ("The check: ", 11.5, True, BLUE),
    ("every ₹ figure a model's answer contains is looked for, after the fact, in what the engine actually "
     "computed or a quote actually verified. One that is not found is shown on screen as unsupported.",
     11.5, False, INK), line=1.2)], anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "This is the frame for the whole deck. The right column's four items are the ones the main deck's slide 6 "
    "labels 'Not AI, on purpose'; CGHS matching is called out specifically because it sits inside an otherwise "
    "AI-heavy pipeline (health.ts: bestMatch/matchTests, a coverage-scored word match, never asked of a model)."
)

# ═══════════════════════════════════ 3 · WHERE AI TOUCHES THE JOURNEY (ANIMATED)
s = new_slide(3)
title(s, "Three doors into the family's journey", "Everywhere else — choosing a hospital, a room, a scheme — is priced by the engine, untouched by AI.")
spine_y = 4.35
box(s, 0.9, spine_y - 0.02, 11.5, 0.04, HAIR)
anim3 = []
stops = [
    ("1", "Start → Your insurance", "Upload the policy PDF.", "Gemini 2.5 Pro reads it"),
    ("2", "Start → Your health", "Upload the report or a photo.", "Llama 3.3 70B reads it"),
    ("3", "Any tab → Ask ClaimCast", "Type or speak a question.", "Llama 3.3 70B answers"),
]
for i, (n, where, what, who) in enumerate(stops):
    x = 1.5 + i * 3.9
    stem = box(s, x + 1.63, spine_y - 0.85, 0.04, 0.85, SOFT)
    d = dot(s, x + 1.4, spine_y - 0.25, n, 0.5, BLUE, WHITE, 16)
    c = card(s, x, 1.55, 3.5, 2.55)
    tb = say(s, x + 0.28, 1.8, 2.95, 2.1, [
        P((where, 14.5, True, INK, False, HEAD), sa=6, line=1.15),
        P((what, 11.5, False, BODY), sa=10, line=1.25)],
        anchor=MSO_ANCHOR.TOP)
    tag = chip(s, x + 0.28, 3.65, 2.95, 0.32, who.upper(), DEEP, SOFT, 9.5)
    anim3 += [c, stem, d, tb, tag]
card(s, 0.6, 5.15, 12.13, 1.35, PALE_GREEN, None)
say(s, 0.9, 5.15, 11.55, 1.35, [P(
    ("Nowhere else. ", 12.5, True, GREEN),
    ("The path, the working, every hospital, room and implant comparison, every government scheme, the bill "
     "range — all the same deterministic engine, whichever of these three doors was or was not opened. An AI "
     "reading fails closed: no extraction, no answer, no report — none of it ever substitutes for the engine's "
     "own arithmetic.", 12.5, False, INK), line=1.32)], anchor=MSO_ANCHOR.MIDDLE)
animate_appear(s, anim3)
s.notes_slide.notes_text_frame.text = (
    "Click through the three stops. Each is a literal upload button or chat box in the running prototype -- "
    "Intake.tsx's Your insurance and Your health steps, and ChatDock.tsx, reachable from every family tab."
)

# ═══════════════════════════════════ 4 · ARCHITECTURE, END TO END (ANIMATED)
s = new_slide(4)
title(s, "The architecture, end to end", "One request in, one of two kinds of answer out: worked by the engine, or read and then checked.")
anim4 = []
cx = W / 2


def node(x, y, w, h, head, sub=None, fill=WHITE, line=HAIR, ink=INK, dash=None, hsize=12.5):
    b = card(s, x, y, w, h, fill, line, dash=dash)
    paras = [P((head, hsize, True, ink), align=PP_ALIGN.CENTER, line=1.1)]
    if sub:
        paras.append(P((sub, 9.5, False, ink if fill != WHITE else MUTE), align=PP_ALIGN.CENTER, sa=0, line=1.15))
    txt = say(s, x + 0.1, y, w - 0.2, h, paras, anchor=MSO_ANCHOR.MIDDLE)
    return b, txt


b, t_ = node(cx - 1.7, 1.42, 3.4, 0.56, "Browser  ·  React", "the family's screen", DEEP, None, WHITE, hsize=12.5)
anim4 += [b, t_]
a1 = arrow(s, cx - 0.11, 2.0, 0.22, 0.26, MSO_SHAPE.DOWN_ARROW, SOFT)
anim4.append(a1)
b, t_ = node(cx - 1.7, 2.3, 3.4, 0.56, "API  ·  Fastify", "one request per screen", DEEP, None, WHITE, hsize=12.5)
anim4 += [b, t_]

lx, rx, colw2 = 1.0, 7.4, 4.95
a2 = arrow(s, lx + colw2 / 2 - 0.11, 2.92, 0.22, 0.24, MSO_SHAPE.DOWN_ARROW, SOFT)
a3 = arrow(s, rx + colw2 / 2 - 0.11, 2.92, 0.22, 0.24, MSO_SHAPE.DOWN_ARROW, SOFT)
anim4 += [a2, a3]

b, t_ = node(lx, 3.2, colw2, 1.15, "Money engine", "deterministic — IRDAI + policy rules, same\ncode in the browser and on the server",
             WHITE, GREEN, GREEN, dash="dash", hsize=13)
anim4 += [b, t_]

# The AI-providers box has one more line than node() lays out for, so its
# text is placed explicitly here rather than through node()'s own centred
# subtitle, which would otherwise sit on top of the chain below it.
b = card(s, rx, 3.2, colw2, 1.15, BLUE, None)
h1 = say(s, rx + 0.1, 3.32, colw2 - 0.2, 0.32, [P(("AI providers", 13, True, WHITE), align=PP_ALIGN.CENTER)])
h2 = say(s, rx + 0.1, 3.64, colw2 - 0.2, 0.26, [P(("whichever key is set, first wins", 10, False, SOFT), align=PP_ALIGN.CENTER)])
chain = say(s, rx + 0.15, 3.95, colw2 - 0.3, 0.34, [P((
    "Vertex Gemini 2.5 Pro → Gemini (AI Studio) → Claude → Groq → OpenRouter Llama 3.3",
    9, False, SOFT), align=PP_ALIGN.CENTER, line=1.15)])
anim4 += [b, h1, h2, chain]

a4 = arrow(s, rx + colw2 / 2 - 0.11, 4.4, 0.22, 0.22, MSO_SHAPE.DOWN_ARROW, SOFT)
anim4.append(a4)
b, t_ = node(rx, 4.65, colw2, 0.55, "Verification", "every quote searched in the document's own bytes", WHITE, GREEN, GREEN, dash="dash", hsize=12)
anim4 += [b, t_]

a5 = arrow(s, rx + colw2 / 2 - 0.11, 5.24, 0.22, 0.2, MSO_SHAPE.DOWN_ARROW, SOFT)
anim4.append(a5)
b, t_ = node(rx, 5.47, colw2, 0.55, "The family confirms", "field by field, beside the line it came from", DEEP, None, WHITE, hsize=12)
anim4 += [b, t_]

a6 = arrow(s, lx + colw2 / 2 - 0.11, 4.4, 0.22, 1.75, MSO_SHAPE.DOWN_ARROW, SOFT)
anim4.append(a6)
lbl = say(s, lx + 0.55, 5.05, colw2 - 0.6, 0.6, [P(("nothing to read or verify —", 9.5, False, MUTE, True), sa=1, line=1.2),
                                                  P(("priced the same way either time", 9.5, False, MUTE, True), line=1.2)])
anim4.append(lbl)

b, t_ = node(1.0, 6.2, 11.35, 0.5, "Priced by the engine, and saved  ·  PostgreSQL", None, PALE, None, DEEP, hsize=12.5)
anim4 += [b, t_]
animate_appear(s, anim4)
s.notes_slide.notes_text_frame.text = (
    "Provider order is models.ts's chosen(): Vertex (VERTEX_PROJECT) > Gemini AI Studio (GEMINI_API_KEY) > "
    "Anthropic (ANTHROPIC_API_KEY) > Groq (GROQ_API_KEY) > OpenRouter (OPENROUTER_API_KEY) -- the first key "
    "present wins, EXTRACTION_PROVIDER can force one. Ask ClaimCast's chat() overrides this: OpenRouter first "
    "whenever its key is set, since Llama 3.3 70B is the one the chat is priced and tuned against; the deck's "
    "chain shown here is the policy- and report-reading order. The dashed green boxes are the 'checked by code' "
    "steps: verification re-derives nothing an AI said, it only looks for it in bytes the model did not write."
)

# ═══════════════════════════════ 5 · PIPELINE — READING YOUR POLICY (ANIMATED)
s = new_slide(5)
title(s, "Pipeline: reading your policy PDF", "extract.ts / models.ts — six steps from a file to a priced admission.")


def flow(steps, y0=1.55, h=1.55, top_labels=True):
    n = len(steps)
    gap = 0.28
    w = (12.13 - gap * (n - 1)) / n
    anim = []
    for i, st in enumerate(steps):
        x = 0.6 + i * (w + gap)
        checked = st.get("checked")
        fillc = st.get("fill", WHITE)
        linec = GREEN if checked else HAIR
        dashv = "dash" if checked else None
        c = card(s, x, y0, w, h, fillc, linec, dash=dashv)
        d = dot(s, x + 0.18, y0 + 0.18, i + 1, 0.36, st.get("dotfill", BLUE), WHITE, 12)
        paras = [P((st["h"], 12, True, INK), sa=5, line=1.12), P((st["b"], 10, False, BODY), line=1.28)]
        tb = say(s, x + 0.18, y0 + 0.62, w - 0.34, h - 0.7, paras)
        anim += [c, d, tb]
        badges = []
        if checked:
            bd = badge(s, x + 0.18, y0 + h - 0.36, checked, GREEN, PALE_GREEN)
            badges.append(bd)
        anim += badges
        if i < n - 1:
            ar = arrow(s, x + w + 0.02, y0 + h / 2 - 0.13, gap - 0.04, 0.26)
            anim.append(ar)
    return anim


steps5 = [
    {"h": "1 · Upload", "b": "A PDF policy schedule."},
    {"h": "2 · Retrieve", "b": "TF-IDF finds the likely passage for each detail."},
    {"h": "3 · Read", "b": "Drafts 17 fields, each with a quoted line and page.", "dotfill": DEEP},
    {"h": "4 · Verify", "b": "Every quote searched in the PDF's own text.", "checked": "CHECKED BY CODE"},
    {"h": "5 · Confirm", "b": "The family agrees or fixes each field, beside its quote.", "dotfill": DEEP},
    {"h": "6 · Price", "b": "Only now does the engine read a single figure.", "checked": "ENGINE, NOT AI"},
]
anim5 = flow(steps5, y0=1.6, h=2.0)
card(s, 0.6, 3.85, 12.13, 0.95, PALE, None)
say(s, 0.9, 3.85, 11.55, 0.95, [P(
    ("An unverified quote is not dropped. ", 11.5, True, BLUE),
    ("It is shown on the confirm screen marked “please check this one” — the family sees exactly which figure "
     "a model could not prove against the page, and confirms or corrects it there.", 11.5, False, INK), line=1.3)],
    anchor=MSO_ANCHOR.MIDDLE)
say(s, 0.6, 5.05, 12.13, 1.5, [
    P(("Reused everywhere a report is read: ", 11.5, True, INK), (
        "the same retrieve-then-verify shape (chunkPages/retrieve, then found()) runs for the health-report "
        "pipeline and for “Ask ClaimCast” answering from your uploaded policy — one implementation, checked once.",
        11.5, False, BODY), line=1.3, sa=10),
    P(("Learns between readings: ", 11.5, True, INK), (
        "a detail people often correct earns a warning on the next family's screen, and their corrections — only "
        "if they agreed to share them — become worked examples in the next model call.", 11.5, False, BODY), line=1.3),
])
animate_appear(s, anim5)
s.notes_slide.notes_text_frame.text = (
    "extract.ts: pageText() via pdf.js, retrieval.ts's TF-IDF chunker finds passages per field, models.ts calls "
    "whichever provider chosen() picks, found() checks every span against the document's own text character for "
    "character (whitespace-normalised only). 17 fields: EXTRACTED_FIELDS in contracts, counted directly, 29 Sep "
    "2026. The reader never sees the sum insured or the room limit as ground truth -- it proposes, the family "
    "confirms, and Intake.tsx will not let an unconfirmed figure reach the engine."
)

# ═══════════════════════════════════ 6 · PIPELINE — ASK CLAIMCAST (ANIMATED)
s = new_slide(6)
title(s, "Pipeline: Ask ClaimCast", "chat.ts — an answer is only ever a phrasing of figures the engine already worked out.")
steps6 = [
    {"h": "1 · Ask", "b": "Typed or spoken, English or Hindi."},
    {"h": "2 · Gather", "b": "Engine facts, health facts, policy passages, 3 remembered answers.", "dotfill": GREEN},
    {"h": "3 · Answer", "b": "The model replies in JSON — a phrasing, never a calculation.", "dotfill": DEEP},
    {"h": "4 · Ground", "b": "Every ₹ figure must match a fact or a verified quote.", "checked": "CHECKED BY CODE"},
    {"h": "5 · Show", "b": "A figure that fails is flagged on screen, not hidden.", "checked": "NEVER SILENT"},
]
anim6 = flow(steps6, y0=1.6, h=2.0)
card(s, 0.6, 3.9, 5.9, 1.5)
say(s, 0.9, 4.08, 5.4, 1.2, [
    P(("37", 28, True, BLUE, False, HEAD)),
    P(("engine facts computed for the reference admission — every one numbered, so a model can cite “F12” "
       "instead of copying a sentence back.", 10.5, False, BODY), line=1.25)])
card(s, 6.78, 3.9, 5.95, 1.5)
say(s, 7.08, 4.08, 5.4, 1.2, [
    P(("MEMORY, NOT RETRAINING", 10.5, True, GREEN)),
    P(("The 3 most similar remembered answers guide how a question is explained — no weights move, and an "
       "answer that once contained an unsupported figure is never remembered.", 10.5, False, BODY), line=1.25, sb=3)])
say(s, 0.6, 5.6, 12.13, 1.2, [P(
    ("Grounding, precisely: ", 11.5, True, INK),
    ("groundChat() extracts every ₹ figure in the model's reply with a recogniser for ₹ / Rs. / lakh, and checks "
     "each one against the union of the numbered facts' own amounts and any policy quote already verified. A "
     "figure that matches neither is returned to the screen as unsupported — the answer is still shown, the "
     "figure is still marked.", 11.5, False, BODY), line=1.3)])
animate_appear(s, anim6)
s.notes_slide.notes_text_frame.text = (
    "chat.ts's chat(): OpenRouter (Llama 3.3 70B) whenever OPENROUTER_API_KEY is set, else the same provider "
    "chain as extraction. Facts come from caseFacts() (engine) and careFacts() (health report). recall() in "
    "sessions.ts picks the 3 nearest remembered questions by the same TF-IDF retrieval as the RAG passages. "
    "37 facts and the grounding check are exercised by chat.check.ts on every code change."
)

# ═══════════════════════════════ 7 · PIPELINE — HEALTH REPORT (ANIMATED)
s = new_slide(7)
title(s, "Pipeline: reading a health report", "health.ts — a photo, a PDF or typed text becomes a priced plan.")
steps7 = [
    {"h": "1 · Upload", "b": "PDF, photo, or typed."},
    {"h": "2 · Transcribe", "b": "A photo is read by Gemini 2.5 Flash first.", "dotfill": DEEP},
    {"h": "3 · Read", "b": "Drafts a diagnosis, tests and a treatment, each quoted.", "dotfill": DEEP},
    {"h": "4 · Verify", "b": "Every quote searched in the report's own text.", "checked": "CHECKED BY CODE"},
    {"h": "5 · Match", "b": "Each test matched to a CGHS code by word overlap.", "checked": "NOT AI"},
    {"h": "6 · Confirm", "b": "The family confirms; CGHS and PM-JAY rates apply.", "checked": "ENGINE, NOT AI"},
]
anim7 = flow(steps7, y0=1.6, h=2.0)
card(s, 0.6, 3.9, 12.13, 1.25, PALE_GREEN, None)
say(s, 0.9, 3.9, 11.55, 1.25, [P(
    ("Step 5 is the one worth pausing on. ", 11.5, True, GREEN),
    ("matchTests() scores every CGHS test name against the report's words, weighted by how telling each word "
     "is (rarer words count for more); bestMatch() accepts a match only above a fixed coverage threshold. No "
     "model is ever asked to price a scan or name a code — the same rule a report with no AI configured falls "
     "back to (readByRules(), keyword patterns over the report's lines).", 11.5, False, INK), line=1.32)],
    anchor=MSO_ANCHOR.MIDDLE)
card(s, 0.6, 5.3, 12.13, 0.95)
say(s, 0.9, 5.3, 11.55, 0.95, [P(
    ("Measured cost per read: ", 11.5, True, BLUE),
    ("about 4 paise for a PDF or typed report, about 8 for a photo (the extra step through Gemini Flash) — "
     "from the OpenRouter usage counter over three reads of each, 29 Sep 2026.", 11.5, False, BODY), line=1.3)],
    anchor=MSO_ANCHOR.MIDDLE)
animate_appear(s, anim7)
s.notes_slide.notes_text_frame.text = (
    "health.ts: transcribe() (Gemini 2.5 Flash via OpenRouter) for a photo or a scanned PDF whose text layer is "
    "under 20 characters after whitespace is stripped; readReport() retries once on invalid JSON, then falls "
    "back to readByRules() if no provider is configured or both tries fail. matchTests()/bestMatch(): TF-IDF-"
    "weighted word overlap against the 776 seeded CGHS tests, MIN_COVERAGE = 0.5. health.check.ts fixes 14 "
    "report phrasings to their correct CGHS code as a regression test."
)

# ═══════════════════════════════════════ 8 · WHAT LEARNS, WHAT DOES NOT
s = new_slide(8)
title(s, "What learns, and what doesn't", "Only one part of the system changes its own numbers. The AI is given better context — its weights never move.")
card(s, 0.6, 1.5, 5.85, 4.85)
say(s, 0.9, 1.68, 5.25, 0.3, [P(("RETRAINED", 11.5, True, GREEN))])
say(s, 0.9, 1.98, 5.25, 0.55, [P(("The bill-range model (XGBoost)", 15, True, INK, False, HEAD))])
cd = CategoryChartData()
cd.categories = ["Before", "After 5\nbills", "After 10\n(retrained)"]
cd.add_series("Middle estimate", (83881, 92336, 92731))
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.95), Inches(2.55), Inches(5.15), Inches(2.35), cd)
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
dl.font.size, dl.font.name, dl.font.bold, dl.font.color.rgb = Pt(10.5), TXT, True, INK
ch.value_axis.visible = False
ch.value_axis.has_major_gridlines = False
ch.value_axis.minimum_scale = 0
ch.value_axis.maximum_scale = 108000
ch.category_axis.tick_labels.font.size = Pt(9)
ch.category_axis.tick_labels.font.name = TXT
ch.category_axis.format.line.color.rgb = HAIR
say(s, 0.9, 5.05, 5.25, 1.25, [P(
    ("Live test, 29 Sep 2026: 10 ankle-surgery bills reported ~60% above the estimate. Every bill corrects the "
     "live forecast at once; at 10 new bills the model retrained itself into a new version "
     "(2026-09-29.1 → .2), unattended.", 10, False, BODY), line=1.25)])

card(s, 6.68, 1.5, 6.05, 4.85, WHITE, GREEN, dash="dash")
say(s, 6.98, 1.68, 5.45, 0.3, [P(("NOT RETRAINED", 11.5, True, GREEN))])
say(s, 6.98, 1.98, 5.45, 0.55, [P(("The three AI readers", 15, True, INK, False, HEAD))])
for i, (h, b) in enumerate([
        ("Policy fixes → the PDF reader", "A detail people often correct earns a warning for the next family; corrections "
         "shared by consent become worked examples in the next prompt — the model's weights are untouched."),
        ("Saved chats → the chat's memory", "The 3 most similar remembered answers shape how a new one is explained. An "
         "answer once flagged unsupported is never remembered."),
        ("Everything else", "the reading and answering models are hosted, general-purpose language models. "
         "ClaimCast never fine-tunes or retrains one."),
]):
    y = 2.68 + i * 1.15
    dot(s, 6.98, y, i + 1, 0.34, GREEN, WHITE, 11)
    say(s, 7.44, y - 0.03, 5.15, 1.1, [P((h + "  ", 11.5, True, INK), (b, 10.5, False, BODY), line=1.25)])
s.notes_slide.notes_text_frame.text = (
    "Same live test as the main deck's self-learning slide, re-derived here for this session rather than "
    "copied: reported via /api/outcomes, retrain triggered by maybeRetrain() in server.ts once "
    "RETRAIN_EVERY=10 new settled bills exist, POST /retrain rebuilds the XGBoost booster on the combined "
    "tariff + outcome pool. The test bills were deleted afterwards. The right column is the distinction worth "
    "making to an AI-literate audience: prompt-time context (RAG passages, memory, worked examples) is not the "
    "same thing as training, and ClaimCast only ever does the former to a hosted model."
)

# ═══════════════════════════════════════ 9 · VERIFIED, NOT TRUSTED
s = new_slide(9)
title(s, "Verified, not trusted", "Numbers a judge can re-run, not a promise to take on faith.")
stats = [
    ("17", "policy fields", "each cited to a quote and a page; none used until the family confirms it"),
    ("37", "engine facts", "numbered statements a chat answer may cite — never a number it invents"),
    ("776", "CGHS tests seeded", "the list a health-report scan is matched against, by rule, not by a model"),
    ("100%", "of ₹ figures checked", "in every chat and every extraction, against facts or verified quotes"),
]
for i, (big, unit, why) in enumerate(stats):
    x = 0.6 + i * 3.08
    card(s, x, 1.5, 2.88, 2.15)
    say(s, x + 0.22, 1.68, 2.5, 0.7, [P((big, 28, True, BLUE, False, HEAD))])
    say(s, x + 0.22, 2.35, 2.5, 0.35, [P((unit, 12.5, True, INK))])
    say(s, x + 0.22, 2.72, 2.45, 0.85, [P((why, 10.5, False, BODY), line=1.22)])
card(s, 0.6, 3.95, 12.13, 1.15, PALE, None)
say(s, 0.9, 3.95, 11.55, 1.15, [P(
    ("Checked on every change, automatically: ", 12, True, BLUE),
    ("extract.check.ts proves the mockup policy's own fields are quotable from its own PDF before anything is "
     "asked to find them; chat.check.ts proves an invented figure and a fabricated citation are both caught; "
     "health.check.ts fixes 14 report phrasings to the right CGHS code. None of these three passes by trusting "
     "the model to have got it right.", 12, False, INK), line=1.3)], anchor=MSO_ANCHOR.MIDDLE)
card(s, 0.6, 5.3, 12.13, 1.35, DEEP, None)
say(s, 0.9, 5.3, 11.55, 1.35, [P(
    ("What this buys the family: ", 13, True, SOFT),
    ("a wrong or invented figure does not reach the screen silently. It reaches the screen ", 13, False, WHITE),
    ("named as unsupported", 13, True, WHITE), (", beside the engine's own number, which is always the one "
     "the bill is actually computed from.", 13, False, WHITE), align=PP_ALIGN.LEFT, line=1.3)],
    anchor=MSO_ANCHOR.MIDDLE)
s.notes_slide.notes_text_frame.text = (
    "776: db.diagnosticTest.count(), seeded from the CGHS rate list, verified live this session. 37: "
    "chat.check.ts's own console output, verified live this session, not carried over from an earlier one. "
    "'100% of rupee figures checked' describes the mechanism (every figure is checked, unconditionally), not a "
    "claim that every check passes -- an unsupported one is exactly what the mechanism is for catching."
)

# ═══════════════════════════════════════════════════════ 10 · THANK YOU
s = new_slide(10, transition=True)
box(s, 0, 0, W, H, DEEP)
say(s, 0.9, 2.0, 11.53, 1.2, [P(("ClaimCast", 68, True, WHITE, False, HEAD), align=PP_ALIGN.CENTER)])
say(s, 0.9, 3.2, 11.53, 0.6, [P(("Reads. Explains. Never decides the money.", 22, False, SOFT, True, HEAD), align=PP_ALIGN.CENTER)])
say(s, 0.9, 4.4, 11.53, 0.5, [P(("Thank you  ·  Questions welcome", 17, True, WHITE), align=PP_ALIGN.CENTER)])
say(s, 0.9, 6.6, 11.53, 0.35, [P(("Every figure in this deck was re-derived from the running code on 29–30 Sep 2026, not carried over.",
                                  10, False, SOFT), align=PP_ALIGN.CENTER)])
for sh in list(s.shapes):
    if sh.has_text_frame and sh.text_frame.text.startswith("ClaimCast · The AI Inside"):
        sh._element.getparent().remove(sh._element)

prs.save(OUT)
print("wrote", OUT, "·", len(prs.slides), "slides")
