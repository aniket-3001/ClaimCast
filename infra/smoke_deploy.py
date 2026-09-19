"""
Is the thing that just deployed actually working?

Read-only, deliberately. `smoke_learning.py` is the stronger check -- it reports
a settled bill and proves the next forecast moves -- but it does that by writing
an invented bill into whatever database it is pointed at, and a deployment that
leaves a fabricated admission behind on every push is exactly what this project
stopped shipping. So this one only asks questions. Nothing below creates a row.

That costs something, and it is worth naming: this cannot catch a regression
that only shows up on a write. What it does catch is the failure that actually
happens after a deploy -- a revision that boots but cannot reach the database,
a cost model that is not there, a migration that did not run, a reference
bundle that came up empty -- and it catches it in about a second.

Usage: python infra/smoke_deploy.py [base_url]
"""

import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3101").rstrip("/")
failures = []


def ok(cond, what):
    if not cond:
        failures.append(what)
    print(("  ok   " if cond else "  FAIL ") + what)


def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            ct = r.headers.get("content-type", "")
            if "json" in ct:
                return r.status, (json.loads(raw) if raw else None)
            return r.status, raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "replace")


print("against " + BASE)

# ---------------------------------------------------------------- health --
# The health route counts the reference bundle rather than answering a bare
# `ok`. A revision that cannot reach Postgres still answers 200 here, so the
# counts are the part that matters.
print("\nhealth")
st, health = call("GET", "/api/health")
ok(st == 200, "GET /api/health is 200")
ref = (health or {}).get("reference") if isinstance(health, dict) else None
ok(isinstance(ref, dict), "the health route reports a loaded reference bundle")
if isinstance(ref, dict):
    ok(ref.get("hospitals", 0) > 0, "hospitals: " + str(ref.get("hospitals")))
    ok(ref.get("procedures", 0) > 0, "procedures: " + str(ref.get("procedures")))
    ok(ref.get("policies", 0) > 0, "policies: " + str(ref.get("policies")))
    # Every source carrying a caveat is the honesty invariant, not a defect.
    # If this ever drops below the source count, something shipped a figure
    # with nothing said about where it came from.
    src, cav = ref.get("sources", 0), ref.get("caveatedSources", 0)
    ok(src > 0 and cav == src, "all " + str(src) + " sources carry a caveat (" + str(cav) + ")")

# ------------------------------------------------------------- the index --
# The API serves the built web bundle. A deploy that forgot it answers JSON
# routes perfectly and shows a judge a blank page.
print("\nweb")
st, page = call("GET", "/")
ok(st == 200, "GET / is 200")
ok(isinstance(page, str) and "<div id=\"root\"" in page, "the index carries the app's mount point")

# ---------------------------------------------------------- adjudication --
# The engine, over the server's own copy of the data. No row is written; this
# route computes and returns.
print("\nadjudication")
CASE = {
    "hospitalId": "h-meridian",
    "procedureId": "p-spine-fusion",
    "policyId": "pol-classic",
    "roomClass": "private",
    "route": "cashless",
    "days": 5,
    "icuDays": 0,
    "siUsed": 0,
    "implantId": "imported",
    "admittedInpatient": True,
    "age": 45,
    "hasPmjayCard": False,
    "govtEmployeeOrPensioner": False,
}
st, ev = call("POST", "/api/cases/evaluate", CASE)
ok(st == 200, "POST /api/cases/evaluate is 200")
if st == 200 and isinstance(ev, dict):
    r = ev["result"]
    ok(r["billTotal"] > 0, "the bill came to " + str(r["billTotal"]) + " paise")
    # The one arithmetic identity the whole screen rests on. If this fails, a
    # figure shown to a family does not add up.
    ok(
        r["insurerPays"] + r["patientPays"] == r["billTotal"],
        "insurer + patient = bill (" + str(r["insurerPays"]) + " + " + str(r["patientPays"]) + ")",
    )
    ok(sum(d["amount"] for d in r["deductions"]) == r["deductionTotal"], "deductions sum to the total")
    # Every rupee refused is attributed. An unattributed deduction is the
    # thing the deck promises cannot happen.
    unattributed = [d for d in r["deductions"] if not d.get("clause")]
    ok(not unattributed, str(len(r["deductions"])) + " deductions, every one citing a clause")

# -------------------------------------------------------------- forecast --
# This is the only route that crosses into the Python service, so it is the
# only one that can tell us the cost model came up.
print("\nforecast")
st, fc = call(
    "POST",
    "/api/forecast",
    {"procedureId": "p-tkr", "cityTier": "Y", "nabh": True, "roomClass": "semi_private", "days": 4, "icuDays": 0},
)
ok(st == 200, "POST /api/forecast is 200 (the cost model is reachable)")
if st == 200 and isinstance(fc, dict):
    ok(0 < fc["p10"] <= fc["p50"] <= fc["p90"], "the band is ordered: " + str([fc["p10"], fc["p50"], fc["p90"]]))
    ok(fc["anchor"]["amount"] > 0, "anchored on " + fc["anchor"]["scheme"] + " " + fc["anchor"]["code"])
    ok("calibration" in fc, "the forecast carries a calibration block")
    # `split` is named for shares but carries amounts in paise, and it has to
    # reconcile to p50 exactly: the engine adjudicates by line kind, so a split
    # that does not add up to the total it was split from would deduct against
    # a bill nobody forecast.
    ok(sum(fc["split"].values()) == fc["p50"], "the line-item split reconciles to p50")

# -------------------------------------------------------------- learning --
# Reads the counters. Does not move them.
print("\nlearning")
st, learn = call("GET", "/api/learning")
ok(st == 200, "GET /api/learning is 200")
if st == 200 and isinstance(learn, dict):
    print(
        "       "
        + str(learn["confirmations"])
        + " confirmations, "
        + str(learn["outcomes"])
        + " settled bills, "
        + str(learn["choices"])
        + " branch choices"
    )

# -------------------------------------------------------------- refusals --
# The system is built to refuse rather than guess, and a deploy that quietly
# started guessing would look healthy on every check above.
print("\nrefusals")
st, _ = call("POST", "/api/forecast", {"procedureId": "p-does-not-exist", "cityTier": "Y", "nabh": True, "roomClass": "semi_private", "days": 4, "icuDays": 0})
ok(st in (404, 422), "an unknown procedure is refused, not guessed (" + str(st) + ")")
st, _ = call("POST", "/api/cases/evaluate", {"procedureId": "p-tkr"})
ok(st == 400, "a malformed case is rejected (" + str(st) + ")")

print("")
if failures:
    print(str(len(failures)) + " failed:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)
print("all good")
