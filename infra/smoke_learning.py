"""
The three loops, over HTTP, against a running API and a running cost model.

Not a unit test. The point is that the effect crosses a process boundary: a bill
reported to the Node API changes what the Python model answers on the next
request, with no restart, no retrain and no redeploy in between.

Usage: python infra/smoke_learning.py [base_url]
"""

import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3101"
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
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode("utf-8", "replace")


CASE = {
    "procedureId": "p-tkr",
    "cityTier": "Y",
    "nabh": True,
    "roomClass": "semi_private",
    "days": 4,
    "icuDays": 0,
}

print("health")
st, body = call("GET", "/api/health")
ok(st == 200, "GET /api/health is 200")

print("\nbefore")
st, before = call("POST", "/api/forecast", CASE)
ok(st == 200, "POST /api/forecast is 200")
ok("calibration" in before, "the forecast carries a calibration block")
base_n = before["calibration"]["n"]
print("       p50 " + str(before["p50"]) + " paise, calibration " + json.dumps(before["calibration"]))

st, learn_before = call("GET", "/api/learning")
ok(st == 200, "GET /api/learning is 200")

print("\nreport a bill 60% above the middle of the band")
actual = round(before["p50"] * 1.6)
st, rep = call(
    "POST",
    "/api/outcomes",
    {
        "request": CASE,
        "p10": before["p10"],
        "p50": before["p50"],
        "p90": before["p90"],
        "anchorTotal": before["anchor"]["amount"],
        "actualTotal": actual,
    },
)
ok(st == 201, "POST /api/outcomes is 201")
# Whether it landed inside is arithmetic, not an assumption: a knee replacement
# has a wide band because the published implant options are far apart, so 1.6x
# the middle can still sit under p90.
inside = before["p10"] <= actual <= before["p90"]
ok(rep and rep.get("within") is inside, "the reported bill was placed on the wrong side of the band")
outcome_id = rep.get("id") if rep else None

print("\nafter")
st, after = call("POST", "/api/forecast", CASE)
ok(st == 200, "POST /api/forecast is still 200")
ok(after["calibration"]["n"] == base_n + 1, "the new bill is counted in the next forecast")
ok(after["calibration"]["factor"] > 1.0, "the correction moved upward")
ok(after["p50"] > before["p50"], "the next forecast is higher than the one that preceded it")
ok(
    after["modelVersion"] == before["modelVersion"],
    "the model version is unchanged -- nothing was retrained",
)
ok(
    any("settled bill" in c for c in after["caveats"]),
    "the forecast says out loud that bills moved it",
)
print("       p50 " + str(after["p50"]) + " paise, calibration " + json.dumps(after["calibration"]))

print("\njourney choice")
st, _ = call("POST", "/api/journey/choice", {"stage": "roomClass", "option": "semi_private"})
ok(st == 204, "POST /api/journey/choice is 204")
st, _ = call("POST", "/api/journey/choice", {"stage": "", "option": "x"})
ok(st == 204, "a malformed choice is still 204 and never an error page")

print("\ncounters")
st, learn_after = call("GET", "/api/learning")
ok(
    learn_after["outcomes"] == learn_before["outcomes"] + 1,
    "the outcome counter moved by one",
)
ok(
    learn_after["choices"] == learn_before["choices"] + 1,
    "the choice counter moved by one, and the malformed one was not counted",
)

print("\nrefusals still refuse")
st, _ = call("POST", "/api/forecast", {**CASE, "procedureId": "p-teleportation"})
ok(st in (400, 422), "an unknown procedure is refused rather than guessed, got " + str(st))
st, _ = call("POST", "/api/outcomes", {"request": CASE, "p10": 1})
ok(st == 400, "a malformed outcome is a 400")

print("")
if outcome_id:
    print("row to clean up: forecast_outcomes " + outcome_id)
if failures:
    print(str(len(failures)) + " FAILED")
    sys.exit(1)
print("end to end: a bill reported to the API changed what the model answered next.")
