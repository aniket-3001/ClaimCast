"""
The XGBoost quantile booster, and the retraining loop around it.

What slide 5 says the cost model is, asserted: a quantile booster that predicts
a range, trained on the published tariffs, able to forecast any package in the
PM-JAY catalogue, and retrained on settled bills so that a forecast moves when
bills say it should -- without any bill being counted twice.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_mod  # noqa: E402
from claimcast_ml import booster, build as build_mod, model as model_mod, tariff  # noqa: E402
from claimcast_ml.forecast import forecast  # noqa: E402

TKR = ("p-tkr", "Y", True, "semi_private", 4, 0)


@pytest.fixture(scope="module")
def m():
    return model_mod.load()


def test_the_shipped_artifact_is_a_quantile_booster(m):
    assert m.booster is not None, "the newest artifact carries no booster; rebuild with training.train"
    b = m.raw["booster"]
    assert b["objective"] == "reg:quantileerror"
    assert b["quantiles"] == [0.1, 0.5, 0.9]
    assert b["library"].startswith("xgboost")
    assert "XGBoost quantile regression" in forecast(m, *TKR).basis


def test_it_is_trained_on_every_priced_catalogue_row(m):
    hbp, cghs, _h, _c = tariff._tables()
    priced = sum(1 for p in hbp["packages"] if p["pricing"]["kind"] != "asPrinted")
    assert priced > 1900, "the PM-JAY catalogue is expected to carry about 1,900 priced packages"
    # Every priced package at each of three tiers, and every CGHS rate at three
    # tiers with and without NABH.
    assert m.raw["booster"]["trainingRows"]["tariff"] >= priced * 3 + len(cghs["rates"]) * 6 - 50


def test_held_out_coverage_is_near_nominal(m):
    for sector, v in m.raw["booster"]["heldOutCoverage"].items():
        assert 0.7 <= v <= 0.9, sector + " held-out p10-p90 coverage is " + format(v, ".2f")


@pytest.mark.parametrize("code", ["SB039A", "SE001A", "MC011A", "SG039C", "SO074A"])
def test_any_catalogue_package_can_be_forecast(m, code):
    f = forecast(m, "hbp:" + code, "X", True, "semi_private", 3, 0)
    assert 0 < f.p10 <= f.p50 <= f.p90
    assert f.anchor["scheme"] == "PMJAY" and f.anchor["code"] == code
    assert sum(f.split.values()) == f.p50


def test_an_unknown_catalogue_code_is_refused(m):
    with pytest.raises((KeyError, SystemExit)):
        forecast(m, "hbp:NOPE999", "X", True, "semi_private", 3, 0)


def _bills(m, factor: float, n: int, at: str) -> list[build_mod.Outcome]:
    f = forecast(m, *TKR)
    return [
        build_mod.Outcome("p-tkr", "Y", True, "semi_private", 4, 0, round(f.p50 * factor), at)
        for _ in range(n)
    ]


def test_retraining_on_settled_bills_moves_the_forecast(m, tmp_path):
    before = forecast(m, *TKR)
    artifact, fitted = build_mod.build(_bills(m, 1.8, 60, "2026-09-28T10:00:00Z"))
    retrained = model_mod.load_from(build_mod.write(artifact, fitted, tmp_path))

    after = forecast(retrained, *TKR)
    assert artifact["booster"]["trainingRows"]["outcomes"] == 60
    assert after.p50 > before.p50 * 1.1, "sixty bills at 1.8x the band did not move it"
    assert after.model_version != before.model_version


def test_one_bill_cannot_visibly_move_a_forecast(m, tmp_path):
    before = forecast(m, *TKR)
    artifact, fitted = build_mod.build(_bills(m, 1.8, 1, "2026-09-28T10:00:00Z"))
    after = forecast(model_mod.load_from(build_mod.write(artifact, fitted, tmp_path)), *TKR)
    assert abs(after.p50 - before.p50) < before.p50 * 0.02


def test_a_bill_already_trained_on_is_not_applied_again(m, tmp_path):
    bills = _bills(m, 1.5, 20, "2026-09-28T10:00:00Z")
    artifact, fitted = build_mod.build(bills)
    retrained = model_mod.load_from(build_mod.write(artifact, fitted, tmp_path))
    assert retrained.outcomes_through == "2026-09-28T10:00:00Z"

    base = forecast(retrained, *TKR)
    seen = [(base.p50, round(base.p50 * 1.5), "2026-09-28T10:00:00Z")] * 20
    again = forecast(retrained, *TKR, seen)
    assert again.calibration["n"] == 0 and again.p50 == base.p50

    newer = [(base.p50, round(base.p50 * 1.5), "2026-09-29T10:00:00Z")] * 20
    assert forecast(retrained, *TKR, newer).calibration["n"] == 20


def test_retrain_endpoint_builds_and_serves_a_new_version(m, tmp_path, monkeypatch):
    # Work on a copy of the artifact directory, so the test never writes into
    # the one the image ships.
    import shutil

    live = build_mod.current()
    shutil.copytree(live, tmp_path / live.name)
    monkeypatch.setattr(build_mod, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(model_mod, "ARTIFACTS", tmp_path)
    model_mod.load.cache_clear()
    try:
        client = TestClient(app_mod.app)
        f = forecast(m, *TKR)
        body = {"outcomes": [
            {
                "request": {"procedureId": "p-tkr", "cityTier": "Y", "nabh": True,
                            "roomClass": "semi_private", "days": 4, "icuDays": 0,
                            "hospitalId": "h-sanjeevan"},
                "actual": round(f.p50 * 1.4),
                "at": "2026-09-28T10:00:00Z",
            }
            for _ in range(12)
        ]}
        res = client.post("/retrain", json=body)
        assert res.status_code == 200, res.text
        out = res.json()
        assert out["outcomesTrainedOn"] == 12
        assert out["modelVersion"] != out["previousVersion"]
        health = client.get("/health").json()
        assert health["modelVersion"] == out["modelVersion"]
        assert health["outcomesTrainedOn"] == 12
        assert health["model"].startswith("xgboost")
    finally:
        model_mod.load.cache_clear()


def test_crossing_heads_are_sorted(m):
    X = booster.encode(
        [booster.Row(10**9, "PMJAY", "ZZ", "Z", False), booster.Row(1, "CGHS", "", "X", True)],
        list(m.vocabulary),
    )
    q = booster.predict(m.booster, X)
    assert (q[:, 0] <= q[:, 1]).all() and (q[:, 1] <= q[:, 2]).all()
