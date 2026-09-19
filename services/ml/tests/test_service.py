"""
The HTTP surface: that it answers, that it refuses, and that it stays in contract.

The contract is `ForecastResponseSchema` in packages/contracts, and the two sides
are in different languages, so nothing but a test keeps them agreeing. The field
list here is checked against that file by hand whenever it changes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app  # noqa: E402
from claimcast_ml import model as model_mod, paths  # noqa: E402

#: Every key `ForecastResponseSchema` requires. A response missing one would be
#: rejected by the API's Zod parse, and a response carrying an extra one would be
#: silently stripped -- which is how the caveats nearly got lost.
RESPONSE_KEYS = {
    "p10", "p50", "p90", "anchor", "split", "calibration",
    "modelVersion", "trainedOn", "basis", "caveats",
}
ANCHOR_KEYS = {"scheme", "amount", "sourceId", "code", "detail"}
LINE_KINDS = {
    "room", "associated", "icu", "independent",
    "implant", "outside_window", "non_payable",
}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health_reports_version_and_provenance(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["modelVersion"] and body["trainedOn"]
    assert body["surveyPeriod"] == "2017-07-01 to 2018-06-30"
    # A forecast has to be traceable to the documents behind it, so every source
    # the artifact was built from reports a checksum here.
    assert set(body["sources"]) >= {
        "nsso-75-health.json", "cpi-health.json", "nha-hbp-2022.json", "cghs-rates.json",
    }
    for name, src in body["sources"].items():
        assert src["checksum"], name + " reports no checksum."


def test_forecast_matches_the_contract(client):
    r = client.post("/forecast", json={
        "procedureId": "p-spine-fusion", "cityTier": "X", "nabh": True,
        "roomClass": "semi_private", "days": 5, "icuDays": 0,
    })
    assert r.status_code == 200
    body = r.json()
    assert set(body) == RESPONSE_KEYS
    assert set(body["anchor"]) == ANCHOR_KEYS
    assert set(body["split"]) == LINE_KINDS
    assert body["p10"] < body["p50"] < body["p90"]
    assert sum(body["split"].values()) == body["p50"]
    assert body["anchor"]["scheme"] == "PMJAY"
    assert body["caveats"]


def test_unknown_procedure_is_a_refusal_with_a_reason(client):
    r = client.post("/forecast", json={
        "procedureId": "p-teleportation", "cityTier": "X", "nabh": True,
        "roomClass": "general", "days": 1, "icuDays": 0,
    })
    assert r.status_code == 422
    assert "judgement" in r.json()["detail"]


def test_icu_days_beyond_the_stay_is_a_refusal(client):
    r = client.post("/forecast", json={
        "procedureId": "p-sepsis", "cityTier": "X", "nabh": True,
        "roomClass": "icu", "days": 2, "icuDays": 6,
    })
    assert r.status_code == 422


def test_a_bad_city_tier_never_reaches_the_model(client):
    r = client.post("/forecast", json={
        "procedureId": "p-chole", "cityTier": "Q", "nabh": True,
        "roomClass": "general", "days": 2, "icuDays": 0,
    })
    assert r.status_code == 422


def test_the_artifact_is_self_contained():
    """
    The regression test for a container that built cleanly and served a 500.

    The image copies `services/ml` and nothing else, so anything a forecast reads
    from the repository at request time exists in the build and not in the
    container. `/health` still answered, because loading the artifact touches none
    of it. This asserts what the Dockerfile relies on: that the artifact carries
    every file `paths.SNAPSHOT` names.
    """
    m = model_mod.load()
    data = paths.ARTIFACTS / m.version / "data"
    assert data.is_dir(), (
        "artifact " + m.version + " carries no snapshot. Rebuild it with "
        "`python -m training.train`."
    )
    for relative in paths.SNAPSHOT:
        assert (data / relative).is_file(), relative + " is not in the artifact."
    assert paths.ROOT == data, (
        "the model is reading " + str(paths.ROOT) + " rather than the snapshot at "
        + str(data) + "."
    )


def test_a_forecast_with_no_outcomes_is_the_survey_estimate_untouched(client):
    """
    The default has to be the model as fitted.

    Every deployment starts with nothing reported, and most requests on a live
    one will still carry nothing for that procedure. If an empty list moved a
    figure by even a rupee, the number in the deck would not be the number on
    the screen.
    """
    body = {
        "procedureId": "p-tkr", "cityTier": "Y", "nabh": True,
        "roomClass": "semi_private", "days": 4, "icuDays": 0,
    }
    bare = client.post("/forecast", json=body).json()
    empty = client.post("/forecast", json={**body, "observed": []}).json()

    assert bare["calibration"] == {"n": 0, "factor": 1.0}
    assert (bare["p10"], bare["p50"], bare["p90"]) == (empty["p10"], empty["p50"], empty["p90"])


def test_settled_bills_move_the_next_forecast(client):
    """
    The claim the whole learning story rests on, asserted rather than described.

    Nothing is refitted between these two calls and no artifact is rebuilt -- the
    model version is identical either side -- and yet the second answer is higher,
    because bills came in above the band and the request carried them.
    """
    body = {
        "procedureId": "p-tkr", "cityTier": "Y", "nabh": True,
        "roomClass": "semi_private", "days": 4, "icuDays": 0,
    }
    before = client.post("/forecast", json=body).json()
    high = [{"p50": before["p50"], "actual": round(before["p50"] * 1.5)} for _ in range(10)]
    after = client.post("/forecast", json={**body, "observed": high}).json()

    assert after["calibration"]["n"] == 10
    assert 1.15 < after["calibration"]["factor"] < 1.35
    assert after["p50"] > before["p50"]
    assert after["modelVersion"] == before["modelVersion"]
    assert any("settled bills" in c for c in after["caveats"])

    # And symmetrically downward, so the correction is not a one-way ratchet.
    low = [{"p50": before["p50"], "actual": round(before["p50"] * 0.6)} for _ in range(10)]
    cheaper = client.post("/forecast", json={**body, "observed": low}).json()
    assert cheaper["p50"] < before["p50"]


def test_a_mis_entered_bill_cannot_move_the_forecast(client):
    body = {
        "procedureId": "p-tkr", "cityTier": "Y", "nabh": True,
        "roomClass": "semi_private", "days": 4, "icuDays": 0,
    }
    before = client.post("/forecast", json=body).json()
    # Rupees typed where paise were asked for, which is the mistake this will
    # actually see. It is discarded rather than shrunk, and it is said out loud.
    absurd = [{"p50": before["p50"], "actual": before["p50"] * 100}]
    after = client.post("/forecast", json={**body, "observed": absurd}).json()

    assert after["calibration"] == {"n": 0, "factor": 1.0}
    assert after["p50"] == before["p50"]
    assert any("mis-entered" in c for c in after["caveats"])
