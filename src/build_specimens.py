# -*- coding: utf-8 -*-
"""
Specimen documents for demonstrating ClaimCast, in one PDF:

  - five private health insurance policies on one identical template, one per
    insurer the prototype knows (so an uploaded policy lands on the right
    cashless network), one of them a family floater;
  - a one-page summary of the government's Vay Vandana cover for a person
    aged 70+;
  - two X-ray bill summaries on one identical hospital template.

Everything is synthetic and marked SPECIMEN. No real insurer, hospital,
patient or government document is reproduced; the scheme page states the
published terms of Ayushman Bharat PM-JAY Vay Vandana and says it is not a
government document.

The policies are worded so that ClaimCast's policy reader can find every
detail it reads (sum insured, room and ICU limits, proportionate deduction,
co-payment, implant sub-limit, pre/post-hospitalisation days, day care,
waiting periods, exclusions) as a plain sentence beside a clause number.

    python src/build_specimens.py
      ->  presentation deck/mockup documents/ClaimCast - Specimen Documents.pdf
      ->  presentation deck/mockup documents/specimens/*.pdf  (each document alone, for uploading)

Needs Google Chrome (headless print) and PyMuPDF (to split the pages).
"""
import html
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deckkit import ROOT  # noqa: E402

OUT_DIR = os.path.join(ROOT, "presentation deck", "mockup documents")
OUT = os.path.join(OUT_DIR, "ClaimCast - Specimen Documents.pdf")
SPLIT = os.path.join(OUT_DIR, "specimens")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

e = html.escape


def inr(rupees):
    s = str(int(rupees))
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


# ── The five policies ────────────────────────────────────────────────────────
# One insurer each, from the five the prototype's hospitals hold cashless
# agreements with. Every figure below is what the policy reader should read.
POLICIES = [
    {
        "file": "1-sanrakshan-suraksha-plus",
        "insurer": "Sanrakshan General",
        "company": "Sanrakshan General Insurance Company Limited",
        "code": "SSP",
        "product": "Suraksha Plus",
        "type": "Individual",
        "number": "SSP-2026-104511",
        "holder": ("Ravi Kumar", 40, "Male"),
        "members": [("Ravi Kumar", "Self", 40, "12-Mar-1986", "None")],
        "si": 300000,
        "premium": 9840,
        "period": "01-Apr-2026 to 31-Mar-2027",
        "since": "01-Apr-2023",
        "room": "Room rent is payable up to ₹3,000 per day.",
        "room_short": "₹3,000 per day",
        "icu": "ICU charges are payable up to ₹6,000 per day.",
        "icu_short": "₹6,000 per day",
        "prop": True,
        "copay": "A co-payment of 10% applies to every admissible claim.",
        "copay_short": "10% of every claim",
        "implant": "Implants and prosthetics are payable up to ₹50,000 per policy year.",
        "implant_short": "₹50,000 per year",
        "pre": 30, "post": 60,
        "daycare": True,
        "ped": 36, "morat": 60,
        "extra": [("Ambulance", "Up to ₹2,000 per hospitalisation"), ("Cumulative bonus", "10% per claim-free year, up to 50%")],
    },
    {
        "file": "2-nivaran-arogya-gold",
        "insurer": "Nivaran Insurance",
        "company": "Nivaran Insurance Company Limited",
        "code": "NAG",
        "product": "Arogya Gold",
        "type": "Individual",
        "number": "NAG-2026-220874",
        "holder": ("Priya Nair", 35, "Female"),
        "members": [("Priya Nair", "Self", 35, "02-Aug-1991", "None")],
        "si": 1000000,
        "premium": 14320,
        "period": "15-Jan-2026 to 14-Jan-2027",
        "since": "15-Jan-2022",
        "room": "Room rent is payable up to 1% of the sum insured per day.",
        "room_short": "1% of sum insured per day (₹10,000)",
        "icu": "ICU charges are payable up to 2% of the sum insured per day.",
        "icu_short": "2% of sum insured per day (₹20,000)",
        "prop": True,
        "copay": "No co-payment applies.",
        "copay_short": "None",
        "implant": "Implants are payable in full, with no separate sub-limit.",
        "implant_short": "No sub-limit",
        "pre": 60, "post": 90,
        "daycare": True,
        "ped": 24, "morat": 60,
        "extra": [("Ambulance", "Up to ₹3,000 per hospitalisation"), ("Health check-up", "Once a year, up to ₹2,500")],
    },
    {
        "file": "3-vaayu-complete",
        "insurer": "Vaayu Health",
        "company": "Vaayu Health Insurance Limited",
        "code": "VHC",
        "product": "Vaayu Complete",
        "type": "Individual",
        "number": "VHC-2026-031907",
        "holder": ("Arjun Mehta", 29, "Male"),
        "members": [("Arjun Mehta", "Self", 29, "19-Nov-1996", "None")],
        "si": 750000,
        "premium": 11260,
        "period": "01-Jul-2026 to 30-Jun-2027",
        "since": "01-Jul-2026",
        "room": "Room rent has no limit: any room category may be chosen.",
        "room_short": "No limit — any room",
        "icu": "ICU charges are payable in full, with no daily limit.",
        "icu_short": "No limit",
        "prop": False,
        "copay": "No co-payment applies.",
        "copay_short": "None",
        "implant": "Implants and prosthetics are payable up to ₹2,00,000 per policy year.",
        "implant_short": "₹2,00,000 per year",
        "pre": 60, "post": 180,
        "daycare": True,
        "ped": 36, "morat": 60,
        "extra": [("Ambulance", "Actual cost, up to ₹5,000"), ("Restore benefit", "Sum insured restored once a year after it is used up")],
    },
    {
        "file": "4-setu-senior-shield",
        "insurer": "Setu Assurance",
        "company": "Setu Assurance Company Limited",
        "code": "SSS",
        "product": "Senior Shield 60+",
        "type": "Individual (senior citizen)",
        "number": "SSS-2026-008836",
        "holder": ("Sita Kumar", 68, "Female"),
        "members": [("Sita Kumar", "Self", 68, "07-May-1958", "Hypertension, Type 2 diabetes")],
        "si": 500000,
        "premium": 32450,
        "period": "01-Oct-2025 to 30-Sep-2026",
        "since": "01-Oct-2024",
        "room": "Room rent is payable up to ₹4,000 per day.",
        "room_short": "₹4,000 per day",
        "icu": "ICU charges are payable up to ₹8,000 per day.",
        "icu_short": "₹8,000 per day",
        "prop": True,
        "copay": "A co-payment of 20% applies to every admissible claim.",
        "copay_short": "20% of every claim",
        "implant": "Implants and prosthetics are payable up to ₹75,000 per policy year.",
        "implant_short": "₹75,000 per year",
        "pre": 30, "post": 60,
        "daycare": True,
        "ped": 12, "morat": 60,
        "extra": [("Ambulance", "Up to ₹2,000 per hospitalisation"), ("Domiciliary care", "Up to 10% of the sum insured")],
    },
    {
        "file": "5-prabha-parivar-floater",
        "insurer": "Prabha Life",
        "company": "Prabha Life and General Insurance Limited",
        "code": "PPF",
        "product": "Parivar Floater",
        "type": "Family floater (5 members)",
        "number": "PPF-2026-517240",
        "holder": ("Meena Sharma", 42, "Female"),
        "members": [
            ("Meena Sharma", "Self", 42, "23-Jan-1984", "None"),
            ("Rajesh Sharma", "Husband", 45, "09-Sep-1981", "Asthma"),
            ("Aarav Sharma", "Son", 14, "30-Jun-2012", "None"),
            ("Isha Sharma", "Daughter", 10, "11-Dec-2015", "None"),
            ("Savitri Sharma", "Mother-in-law", 71, "04-Feb-1955", "Osteoarthritis (knees)"),
        ],
        "si": 1500000,
        "premium": 48900,
        "period": "01-May-2026 to 30-Apr-2027",
        "since": "01-May-2020",
        "room": "Room rent is payable up to ₹7,500 per day.",
        "room_short": "₹7,500 per day",
        "icu": "ICU charges are payable up to ₹15,000 per day.",
        "icu_short": "₹15,000 per day",
        "prop": True,
        "copay": "No co-payment applies, except 20% for insured members aged 61 and above.",
        "copay_short": "None (20% for members aged 61+)",
        "implant": "Implants and prosthetics are payable up to ₹1,50,000 per policy year.",
        "implant_short": "₹1,50,000 per year",
        "pre": 60, "post": 90,
        "daycare": True,
        "ped": 36, "morat": 60,
        "extra": [("Floater", "The whole sum insured is shared by all five members"),
                  ("Maternity", "Up to ₹50,000 after 24 months of cover")],
    },
]

EXCLUSIONS = ("Cosmetic or plastic surgery unless needed after an accident; dental treatment unless needing "
              "hospitalisation after an accident; obesity and weight-control treatment; self-inflicted injury; "
              "treatment outside India; experimental or unproven treatment; non-medical items listed in IRDAI "
              "List I.")

CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.45 Georgia, 'Times New Roman', serif; color: #1b2430; }
.page { width: 210mm; height: 297mm; padding: 16mm 17mm 14mm; position: relative; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.mark { position: absolute; top: 118mm; left: 22mm; font: 700 88pt Arial, sans-serif; color: rgba(200, 16, 46, 0.07);
        transform: rotate(-32deg); letter-spacing: 16pt; pointer-events: none; }
.foot { position: absolute; left: 17mm; right: 17mm; bottom: 9mm; display: flex; justify-content: space-between;
        border-top: 1px solid #d8dee6; padding-top: 2.5mm; font: 7.5pt Arial, sans-serif; color: #7a8591; }
.disc { margin-top: 4mm; padding: 3mm 4mm; background: #f4f6f9; border-left: 3px solid #b26b00;
        font: 8pt/1.4 Arial, sans-serif; color: #55606c; }
h1 { font-size: 17pt; margin: 0 0 1mm; color: #0e3a66; }
h2 { font-size: 12pt; margin: 4.5mm 0 1.8mm; color: #0e3a66; }
.small { font: 8.5pt Arial, sans-serif; color: #5f6a76; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { text-align: left; font: 700 7.5pt Arial, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
     color: #3a4654; background: #eef2f6; padding: 1.5mm 2.5mm; border: 1px solid #d8dee6; }
td { padding: 1.35mm 2.5mm; border: 1px solid #d8dee6; vertical-align: top; }
td.c { font: 700 8.5pt 'Courier New', monospace; color: #0e5aa8; width: 14mm; }
.num { text-align: right; font-family: Arial, sans-serif; }
/* insurer template */
.ins-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #0e3a66; padding-bottom: 3mm; }
.ins-name { font: 700 15pt Georgia, serif; color: #0e3a66; letter-spacing: 0.02em; }
.ins-sub { font: 8pt Arial, sans-serif; color: #5f6a76; }
.tag { font: 700 9pt Arial, sans-serif; letter-spacing: 0.12em; color: #0e3a66; text-align: right; white-space: nowrap; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 4mm; border: 1px solid #d8dee6; }
.grid div { padding: 1.5mm 3mm; border-bottom: 1px solid #e6eaef; }
.grid div:nth-child(odd) { border-right: 1px solid #e6eaef; }
.k { display: block; font: 700 7pt Arial, sans-serif; letter-spacing: 0.07em; text-transform: uppercase; color: #7a8591; }
.v { font-size: 10.5pt; }
ol.cl { margin: 0; padding: 0; list-style: none; }
ol.cl li { margin: 0 0 2mm; padding-left: 12mm; text-indent: -12mm; }
ol.cl b.n { display: inline-block; width: 12mm; text-indent: 0; font: 700 9pt 'Courier New', monospace; color: #0e5aa8; }
/* hospital template */
.hos-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #17463a; padding-bottom: 3mm; font-family: Arial, sans-serif; }
.hos-name { font: 700 15pt Arial, sans-serif; color: #17463a; }
.hos .box { margin-top: 4mm; background: #f3f6f4; padding: 3mm 4mm; font-family: Arial, sans-serif; font-size: 9.5pt; }
.hos .box table td { border: 0; padding: 1mm 2mm; }
.hos table { font-family: Arial, sans-serif; }
.hos th { background: #17463a; color: #fff; border-color: #17463a; }
.hos tr.total td { font-weight: 700; border-top: 2px solid #17463a; }
.hos h2 { color: #17463a; font-family: Arial, sans-serif; font-size: 11pt; }
.note { margin-top: 5mm; padding: 3mm 4mm; background: #fdf6e8; border-left: 3px solid #b26b00; font: 8.5pt/1.45 Arial, sans-serif; color: #4d4436; }
/* scheme template */
.gov-head { border: 2px solid #1f4e2c; border-radius: 3mm; padding: 4mm 5mm; display: flex; justify-content: space-between; align-items: center; }
.gov-title { font: 700 15pt Georgia, serif; color: #1f4e2c; }
.gov .grid { border-color: #c9d8cc; }
.gov th { background: #e8f0ea; }
.pill { display: inline-block; padding: 1mm 3mm; border-radius: 3mm; background: #1f4e2c; color: #fff; font: 700 8pt Arial, sans-serif; letter-spacing: 0.08em; }
/* cover */
.cover h1 { font-size: 26pt; margin-top: 30mm; }
.cover li { margin-bottom: 2.5mm; font-size: 11pt; }
"""


def foot(left, n, total):
    return f'<div class="foot"><span>{e(left)}</span><span>Page {n} of {total} · SPECIMEN — synthetic, not a real document</span></div>'


def policy_pages(p):
    name, age, sex = p["holder"]
    mem = "".join(
        f"<tr><td>{e(m[0])}</td><td>{e(m[1])}</td><td class='num'>{m[2]}</td><td>{e(m[3])}</td><td>{e(m[4])}</td></tr>"
        for m in p["members"])
    floater = "floater" in p["type"].lower()
    si_line = (f"{inr(p['si'])} per policy year, shared by all insured members (floater)" if floater
               else f"{inr(p['si'])} per policy year")
    head = (f'<div class="ins-head"><div><div class="ins-name">{e(p["insurer"].upper())}</div>'
            f'<div class="ins-sub">IRDAI Regn No. 000-SYN (synthetic)</div></div>'
            f'<div class="tag">POLICY SCHEDULE<br><span class="small">{e(p["number"])}</span></div></div>')
    benefits = [
        ("Sum insured", si_line, "2.1"),
        ("Room rent limit", p["room_short"], "4.1"),
        ("ICU limit", p["icu_short"], "4.2"),
        ("Proportionate deduction", "Applicable" if p["prop"] else "Not applicable", "4.3"),
        ("Co-payment", p["copay_short"], "6.1"),
        ("Implant sub-limit", p["implant_short"], "4.5"),
        ("Pre / post-hospitalisation", f"{p['pre']} days before / {p['post']} days after", "7.1"),
        ("Day-care procedures", "Covered — no minimum stay applies" if p["daycare"] else "Not covered", "3.3"),
        ("Pre-existing disease waiting period", f"{p['ped']} months", "2.2"),
        ("Moratorium period", f"{p['morat']} months", "2.4"),
    ] + [(k, v, "8." + str(i + 1)) for i, (k, v) in enumerate(p["extra"])]
    rows = "".join(f"<tr><td>{e(a)}</td><td>{e(b)}</td><td class='c'>{c}</td></tr>" for a, b, c in benefits)
    page1 = f"""
<div class="page">{head}
  <h1 style="margin-top:5mm">{e(p['product'])} — Policy Schedule</h1>
  <div class="small">{e(p['type'])} health insurance policy · Form {p['code']}/SCH/2026</div>
  <div class="grid">
    <div><span class="k">Insurer</span><span class="v">{e(p['insurer'])}</span></div>
    <div><span class="k">Product</span><span class="v">{e(p['product'])} ({e(p['type'])})</span></div>
    <div><span class="k">Policy number</span><span class="v">{e(p['number'])}</span></div>
    <div><span class="k">Policyholder</span><span class="v">{e(name)}, {age} years, {sex}</span></div>
    <div><span class="k">Sum insured</span><span class="v">{inr(p['si'])}{' (floater)' if floater else ''}</span></div>
    <div><span class="k">Period of insurance</span><span class="v">{e(p['period'])}</span></div>
    <div><span class="k">Continuously insured since</span><span class="v">{e(p['since'])}</span></div>
    <div><span class="k">Annual premium (incl. GST)</span><span class="v">{inr(p['premium'])}</span></div>
  </div>
  <h2>Insured persons</h2>
  <table><tr><th>Name</th><th>Relationship</th><th>Age</th><th>Date of birth</th><th>Declared pre-existing conditions</th></tr>{mem}</table>
  <h2>Schedule of benefits</h2>
  <table><tr><th>Benefit</th><th>Limit</th><th>Clause</th></tr>{rows}</table>
  <div class="disc">This document is a synthetic specimen created for the ClaimCast prototype (GE HealthCare Precision
  Care Challenge 2026). It is not issued by any real insurer and creates no real coverage or obligation.</div>
  <div class="mark">SPECIMEN</div>
  {{FOOT1}}
</div>"""
    clauses = [
        ("2.1", f"Sum insured. The sum insured is {inr(p['si'])} for the policy year"
                + (", available to all insured members together on a floater basis." if floater else ".")),
        ("2.2", f"Pre-existing diseases. Any condition diagnosed or treated in the 48 months before the policy first "
                f"started is covered only after {p['ped']} months of continuous cover."),
        ("2.4", f"Moratorium. After {p['morat']} months of continuous cover, no claim will be contested except for proven fraud."),
        ("3.1", "Hospitalisation. In-patient treatment is covered when the insured is admitted for at least 24 consecutive hours."),
        ("3.3", "Day care. Listed day-care procedures are covered without the 24-hour minimum stay."
                if p["daycare"] else "Day care. Day-care procedures are not covered."),
        ("4.1", "Room rent. " + p["room"]),
        ("4.2", "Intensive care. " + p["icu"]),
        ("4.3", ("Proportionate deduction. If the room chosen costs more than the room rent limit, all associated "
                 "medical expenses are reduced in the same proportion, except medicines, implants and diagnostics.")
                if p["prop"] else
                "Proportionate deduction. Not applicable: associated medical expenses are never reduced because of the room chosen."),
        ("4.5", "Implants. " + p["implant"]),
        ("6.1", "Co-payment. " + p["copay"]),
        ("7.1", f"Pre- and post-hospitalisation. Medical expenses incurred up to {p['pre']} days before admission and "
                f"up to {p['post']} days after discharge are covered, if the hospitalisation claim is admissible."),
        ("9.1", "Exclusions. " + EXCLUSIONS),
        ("10.1", f"Claims. Cashless: request pre-authorisation through the network hospital's insurance desk. "
                 f"Reimbursement: submit bills within 30 days of discharge to {p['insurer']} Claims, quoting {p['number']}."),
    ]
    items = "".join(f'<li><b class="n">{c}</b>{e(t)}</li>' for c, t in clauses)
    page2 = f"""
<div class="page">{head}
  <h2 style="margin-top:6mm">Policy wording — key clauses</h2>
  <ol class="cl">{items}</ol>
  <h2>Nominee and contact</h2>
  <table><tr><th>Insurer</th><th>Nominee</th><th>Claims helpline</th><th>Grievances</th></tr>
  <tr><td>{e(p['company'])}</td><td>{e(p['members'][1][0] if len(p['members']) > 1 else 'As registered with the insurer')}</td>
      <td>1800-000-0000 (synthetic)</td><td>grievance@example.invalid</td></tr></table>
  <div class="disc">Synthetic specimen for the ClaimCast prototype. Insurer, product and people are made up; the
  wording follows the structure of Indian retail health policies and IRDAI standard terms.</div>
  <div class="mark">SPECIMEN</div>
  {{FOOT2}}
</div>"""
    label = f"{p['product']} · {p['insurer']}"
    return [(page1, label), (page2, label)]


def scheme_page():
    rows = [
        ("Who is eligible", "Every Indian citizen aged 70 or above, whatever their income. Age is the only test."),
        ("Cover", "Up to ₹5,00,000 a year for the family, on top of any PM-JAY cover the family already has; a person "
                  "aged 70+ in a PM-JAY family gets an extra ₹5,00,000 for themselves."),
        ("Premium", "None. The scheme is fully paid for by the government."),
        ("Where", "Cashless at any PM-JAY empanelled hospital, public or private, anywhere in India."),
        ("What is paid", "Fixed package rates from the Health Benefit Package list (1,949 procedures), covering the "
                         "stay, surgery, medicines, tests and implants in the package."),
        ("Before and after", "Tests and medicines up to 3 days before admission and 15 days after discharge."),
        ("Pre-existing illness", "Covered from the first day. No waiting period."),
        ("Other insurance", "A person with private health insurance may also enrol. A person covered by CGHS, ECHS or "
                            "CAPF schemes chooses either that scheme or Vay Vandana."),
        ("Not covered", "Out-patient visits and tests that do not lead to an admission; cosmetic treatment."),
    ]
    trs = "".join(f"<tr><td style='width:44mm'><b>{e(a)}</b></td><td>{e(b)}</td></tr>" for a, b in rows)
    return f"""
<div class="page gov">
  <div class="gov-head"><div><div class="gov-title">Ayushman Vay Vandana — Beneficiary Cover Summary</div>
    <div class="small">Ayushman Bharat PM-JAY, for senior citizens aged 70 and above · summary of published scheme terms</div></div>
    <span class="pill">SPECIMEN</span></div>
  <div class="grid">
    <div><span class="k">Beneficiary</span><span class="v">Savitri Sharma, 71 years, Female</span></div>
    <div><span class="k">Specimen card number</span><span class="v">VV-SPECIMEN-0071-2026</span></div>
    <div><span class="k">Address</span><span class="v">Nashik, Maharashtra</span></div>
    <div><span class="k">Enrolled on</span><span class="v">12-Nov-2025</span></div>
    <div><span class="k">Annual cover</span><span class="v">₹5,00,000 (Vay Vandana top-up)</span></div>
    <div><span class="k">Also covered by</span><span class="v">Prabha Life Parivar Floater (PPF-2026-517240)</span></div>
  </div>
  <h2>What the cover means</h2>
  <table>{trs}</table>
  <h2>How to use it</h2>
  <ol style="margin:0;padding-left:5mm;font-size:10pt">
    <li>At an empanelled hospital, go to the Ayushman Mitra desk with the card and Aadhaar.</li>
    <li>The hospital checks the card and requests approval for the package. No payment is taken for covered care.</li>
    <li>If the stay is not a listed package, or the hospital is not empanelled, the private policy can be used instead.</li>
  </ol>
  <div class="disc">This page is a synthetic specimen prepared for the ClaimCast prototype. It is not a government
  document, card or certificate and cannot be used to obtain treatment. It summarises the publicly announced terms of
  Ayushman Bharat PM-JAY Vay Vandana (2024) for a made-up beneficiary.</div>
  <div class="mark">SPECIMEN</div>
  {{FOOT1}}
</div>"""


BILLS = [
    {
        "hospital": "NAVJEEVAN DISTRICT HOSPITAL",
        "sub": "Rewa, Madhya Pradesh · Department of Radiology · PM-JAY empanelled (synthetic)",
        "invoice": "NDH-RAD-26-04417",
        "patient": "Sita Kumar, 68, Female",
        "uhid": "NDH-2026-771203",
        "date": "22 Sep 2026, 11:40",
        "referred": "Dr A. Mehta, MS (Ortho)",
        "policy": "Senior Shield 60+ — SSS-2026-008836",
        "pay": "Paid by patient (UPI)",
        "study": [("Study", "X-ray, left ankle"), ("Views", "AP and lateral (2 films), digital"),
                  ("Technologist", "R. Tiwari"), ("Reported by", "Dr P. Saxena, MD (Radiodiagnosis)"),
                  ("Findings", "Displaced fractures of the medial and lateral malleoli; ankle mortise widened. "
                               "Soft-tissue swelling. No other bony injury.")],
        "impression": "Bimalleolar fracture, left ankle. Orthopaedic opinion advised.",
        "lines": [("OPD registration", "", 1, 50), ("X-ray ankle, AP and lateral (2 films)", "RI037", 1, 340),
                  ("Radiologist reporting", "", 1, 0), ("Digital images on CD", "", 1, 60)],
        "note": "Tests before a planned admission can be claimed as pre-hospitalisation expenses if the admission is "
                "covered: 30 days under Senior Shield 60+. Keep this bill with the claim.",
    },
    {
        "hospital": "MERIDIAN INSTITUTE OF MEDICAL SCIENCES",
        "sub": "New Delhi · Department of Radiology · NABH accredited, PM-JAY & CGHS empanelled (synthetic)",
        "invoice": "MIMS-RAD-26-19085",
        "patient": "Savitri Sharma, 71, Female",
        "uhid": "MIMS-2026-340566",
        "date": "25 Sep 2026, 09:15",
        "referred": "Dr K. Iyer, MS (Ortho)",
        "policy": "Parivar Floater — PPF-2026-517240 · Vay Vandana VV-SPECIMEN-0071-2026",
        "pay": "Paid by patient (card)",
        "study": [("Study", "X-ray, both knees standing; X-ray, chest"), ("Views", "Knees AP weight-bearing (2 films); chest PA (1 film)"),
                  ("Technologist", "S. Paul"), ("Reported by", "Dr N. Bose, DNB (Radiology)"),
                  ("Findings", "Both knees: joint-space narrowing, medial more than lateral, with marginal osteophytes "
                               "(Kellgren–Lawrence grade 3). Chest: clear lung fields, normal heart size.")],
        "impression": "Bilateral knee osteoarthritis, grade 3. Chest normal. Review with orthopaedics.",
        "lines": [("Consultation, orthopaedics (out-patient)", "CN001", 1, 700),
                  ("X-ray both knees, AP standing (2 films)", "RI037", 1, 760),
                  ("X-ray chest, PA view (1 film)", "RI034", 1, 460), ("Radiologist reporting", "", 1, 0)],
        "note": "Out-patient tests that do not lead to an admission are not covered by the floater policy or by Vay "
                "Vandana. If knee replacement is later advised, tests within 60 days before admission can be "
                "claimed under the floater, or 3 days before under Vay Vandana.",
    },
]


def bill_page(b):
    total = sum(q * r for _, _, q, r in b["lines"])
    rows = "".join(
        f"<tr><td>{e(d)}</td><td class='small'>{e(c)}</td><td class='num'>{q}</td><td class='num'>{r:,}</td>"
        f"<td class='num'>{q * r:,}</td></tr>" for d, c, q, r in b["lines"])
    study = "".join(f"<tr><td style='width:36mm'><b>{e(k)}</b></td><td>{e(v)}</td></tr>" for k, v in b["study"])
    return f"""
<div class="page hos">
  <div class="hos-head"><div><div class="hos-name">{e(b['hospital'])}</div><div class="small">{e(b['sub'])}</div></div>
    <div class="tag" style="color:#17463a">RADIOLOGY BILL SUMMARY<br><span class="small">Invoice {e(b['invoice'])}</span></div></div>
  <div class="box"><table>
    <tr><td class="k" style="width:28mm">Patient</td><td>{e(b['patient'])}</td><td class="k" style="width:26mm">Date</td><td>{e(b['date'])}</td></tr>
    <tr><td class="k">UHID</td><td>{e(b['uhid'])}</td><td class="k">Referred by</td><td>{e(b['referred'])}</td></tr>
    <tr><td class="k">Insurance</td><td colspan="3">{e(b['policy'])}</td></tr>
  </table></div>
  <h2>Investigation details</h2>
  <table>{study}<tr><td><b>Impression</b></td><td><b>{e(b['impression'])}</b></td></tr></table>
  <h2>Charges</h2>
  <table><tr><th>Item</th><th>CGHS code</th><th class="num">Qty</th><th class="num">Rate (₹)</th><th class="num">Amount (₹)</th></tr>
  {rows}<tr class="total"><td colspan="4">Total</td><td class="num">{total:,}</td></tr></table>
  <div class="small" style="margin-top:2mm">Payment: {e(b['pay'])}. Medical services are exempt from GST.</div>
  <div class="note">{e(b['note'])}</div>
  <div class="disc">Synthetic specimen for the ClaimCast prototype. Hospital, staff and patient are made up.</div>
  <div class="mark">SPECIMEN</div>
  {{FOOT1}}
</div>"""


def cover_page(entries):
    items = "".join(f"<li><b>{e(t)}</b> — {e(d)} <span class='small'>(page {pg})</span></li>" for t, d, pg in entries)
    return f"""
<div class="page cover">
  <div class="small" style="letter-spacing:0.1em">CLAIMCAST · GE HEALTHCARE PRECISION CARE CHALLENGE 2026 · TEAM ROCKET, IIIT-DELHI</div>
  <h1>Specimen documents for the ClaimCast demo</h1>
  <p style="font-size:11.5pt;max-width:150mm">Five private health insurance policies on one identical template, a one-page
  government scheme summary for a senior citizen, and two X-ray bill summaries. Upload any policy on
  <i>Start → Your insurance</i>, or a bill on <i>Start → Your health</i>.</p>
  <h2>Contents</h2>
  <ol style="padding-left:5mm">{items}</ol>
  <div class="disc" style="margin-top:12mm">Every insurer, hospital, person, number and card in this pack is synthetic.
  Nothing here is issued by a real insurer, hospital or government body, and none of it creates any cover.</div>
  {{FOOT1}}
</div>"""


def build():
    docs = []  # (file, pages[(html, label)])
    for p in POLICIES:
        docs.append((p["file"], policy_pages(p)))
    docs.append(("6-vay-vandana-summary", [(scheme_page(), "Ayushman Vay Vandana summary")]))
    for i, b in enumerate(BILLS):
        docs.append((f"{7 + i}-xray-bill-{['navjeevan', 'meridian'][i]}", [(bill_page(b), b["hospital"].title().replace(" Of ", " of "))]))

    titles = [f"{p['product']} ({p['insurer']})" for p in POLICIES] + ["Ayushman Vay Vandana", "X-ray bill", "X-ray bill"]
    descs = [f"{p['type']}, {inr(p['si'])}, policyholder {p['holder'][0]}" for p in POLICIES] + [
        "cover summary for Savitri Sharma, 71", "Navjeevan District Hospital, Rewa — Sita Kumar, left ankle",
        "Meridian Institute, New Delhi — Savitri Sharma, knees and chest"]
    pages, entries, ranges, n = [], [], [], 2
    for (f, pg), t, d in zip(docs, titles, descs):
        entries.append((t, d, n))
        ranges.append((f, n, n + len(pg) - 1))
        pages.extend(pg)
        n += len(pg)
    total = len(pages) + 1
    body = [cover_page(entries).replace("{FOOT1}", foot("ClaimCast · Specimen documents", 1, total))]
    for i, (h, label) in enumerate(pages):
        num = i + 2
        body.append(h.replace("{FOOT1}", foot(label, num, total)).replace("{FOOT2}", foot(label, num, total)))
    doc = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{''.join(body)}</body></html>"

    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "specimens.html")
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(doc)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={OUT}",
                    "file://" + src], check=True, capture_output=True)
    shutil.rmtree(tmp)

    import pymupdf
    whole = pymupdf.open(OUT)
    whole.set_metadata({"title": "ClaimCast — Specimen Documents", "author": "Team Rocket, IIIT-Delhi",
                        "subject": "Synthetic specimens for the ClaimCast prototype"})
    whole.save(OUT + ".tmp", garbage=3, deflate=True)
    whole.close()
    os.replace(OUT + ".tmp", OUT)
    whole = pymupdf.open(OUT)
    os.makedirs(SPLIT, exist_ok=True)
    for f, a, z in ranges:
        part = pymupdf.open()
        part.insert_pdf(whole, from_page=a - 1, to_page=z - 1)
        part.save(os.path.join(SPLIT, f + ".pdf"))
    print("wrote", OUT, "·", len(whole), "pages; separate files in", SPLIT)


if __name__ == "__main__":
    build()
