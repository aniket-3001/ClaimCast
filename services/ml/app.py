"""
The cost-model service: POST /forecast, POST /retrain and GET /health.

It holds one artifact in memory -- an XGBoost quantile booster and the figures
around it -- and predicts from it. The service is a separate process because the
plan puts the probabilistic components at the edges of a deterministic core, and
that boundary is worth keeping.

`/retrain` is the self-learning loop. The API calls it with every settled bill it
holds once enough new ones have arrived since the version `/health` reports; the
service rebuilds the booster on the combined pool of published tariffs and those
bills, writes it as a new artifact version, and serves from it. On a platform with
an ephemeral disk a restart returns to the version baked into the image, `/health`
then reports fewer bills trained on than the API holds, and the next outcome
reported triggers the rebuild again -- so the loop repairs itself from the
database rather than from the container.

`/health` reports the model version, the training date and the checksum of every
document the artifact was built from. That is what makes a forecast auditable
after the fact: a figure on a screen can be traced to a version, and a version to
the exact PDFs it came from.
"""

from __future__ import annotations

import threading

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from claimcast_ml import build as build_mod
from claimcast_ml import model as model_mod
from claimcast_ml.forecast import forecast

app = FastAPI(
    title="ClaimCast cost model",
    description=__doc__,
    version="1",
)


class Outcome(BaseModel):
    """
    One forecast this model gave, and the bill that was settled against it.

    Both figures are as they stood when the forecast was made. There is nothing
    here that says whose admission it was, and nothing that could: the caller
    sends two integers per row because two integers are all the correction needs.
    """

    p50: int = Field(ge=0)
    actual: int = Field(ge=0)
    #: When the bill was reported, ISO 8601. Bills the current booster was
    #: already trained on are recognised by it and not applied a second time.
    at: str | None = None


class ForecastRequestCore(BaseModel):
    """Mirrors `ForecastRequestSchema` in packages/contracts."""

    procedureId: str
    cityTier: str = Field(pattern="^[XYZ]$")
    nabh: bool
    roomClass: str
    days: int = Field(ge=0, le=365)
    icuDays: int = Field(ge=0, le=365)
    #: Which hospital the admission is at. Logged with the outcome; the booster
    #: does not read it, because no public source prices a named hospital.
    hospitalId: str | None = None


class ForecastRequest(ForecastRequestCore):
    #: Settled bills, newest first, capped by the caller. Absent from a caller
    #: that has none, which is the shape this service shipped with.
    observed: list[Outcome] = Field(default_factory=list, max_length=500)


class SettledBill(BaseModel):
    """One settled bill as training data: the request it was forecast for, and what it came to."""

    request: ForecastRequestCore
    actual: int = Field(gt=0)
    at: str | None = None


class RetrainRequest(BaseModel):
    outcomes: list[SettledBill] = Field(max_length=100_000)


@app.get("/health")
def health() -> dict:
    m = model_mod.load()
    b = m.raw.get("booster", {})
    return {
        "status": "ok",
        "modelVersion": m.version,
        "trainedOn": m.trained_on,
        "surveyPeriod": m.raw["surveyPeriod"],
        "model": b.get("library", "survey band") + (" " + b["objective"] if b else ""),
        "trainingRows": b.get("trainingRows"),
        "outcomesTrainedOn": (m.raw.get("outcomes") or {}).get("n", 0),
        "multiplier": m.multiplier,
        "heldOutCoverage": b.get("heldOutCoverage", m.coverage),
        "sources": {
            name: {"id": s["id"], "checksum": s["checksum"], "supplies": s["supplies"]}
            for name, s in m.raw["sources"].items()
        },
    }


@app.post("/forecast")
def post_forecast(req: ForecastRequest) -> JSONResponse:
    m = model_mod.load()
    try:
        f = forecast(
            m,
            req.procedureId,
            req.cityTier,
            req.nabh,
            req.roomClass,
            req.days,
            req.icuDays,
            [(o.p50, o.actual, o.at) for o in req.observed],
        )
    except KeyError as exc:
        # An unknown procedure, or one with no ailment coding. Both are refusals
        # to guess rather than failures, so they are 422 and carry the reason.
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except SystemExit as exc:
        # `tariff.anchor_for` raises when no scheme publishes a rate. There is
        # deliberately no estimate without a published anchor, so this is a 422
        # with the explanation rather than a number the caller cannot check.
        raise HTTPException(status_code=422, detail=str(exc)) from None

    return JSONResponse({
        "p10": f.p10,
        "p50": f.p50,
        "p90": f.p90,
        "anchor": f.anchor,
        "split": f.split,
        "calibration": f.calibration,
        "modelVersion": f.model_version,
        "trainedOn": f.trained_on,
        "basis": f.basis,
        "caveats": f.caveats,
    })


#: One retrain at a time. A second request while one runs is answered 409 rather
#: than queued: the caller retries on the next outcome, with the fuller pool.
_retraining = threading.Lock()


@app.post("/retrain")
def post_retrain(req: RetrainRequest) -> JSONResponse:
    if not _retraining.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="a retrain is already running")
    try:
        before = model_mod.load()
        outcomes = build_mod.outcomes_from_json([o.model_dump() for o in req.outcomes])
        artifact, fitted = build_mod.build(outcomes)
        out = build_mod.write(artifact, fitted)
        model_mod.load.cache_clear()
        after = model_mod.load()
        if after.version != artifact["modelVersion"]:
            raise HTTPException(
                status_code=500,
                detail="wrote " + str(out) + " but the service loaded " + after.version,
            )
    finally:
        _retraining.release()

    rows = artifact["booster"]["trainingRows"]
    return JSONResponse({
        "previousVersion": before.version,
        "modelVersion": after.version,
        "outcomesTrainedOn": rows["outcomes"],
        "outcomesDropped": rows["outcomesDropped"],
        "tariffRows": rows["tariff"],
        "heldOutCoverage": artifact["booster"]["heldOutCoverage"],
    })
