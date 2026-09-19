"""
The cost-model service: POST /forecast and GET /health.

It holds one artifact in memory and does arithmetic on it. There is no inference
loop and nothing to warm up, so a cold start is a JSON read; the service is a
separate process because the plan puts the probabilistic components at the edges
of a deterministic core, and that boundary is worth keeping even when the
probabilistic component turns out to be small.

`/health` reports the model version, the training date and the checksum of every
document the artifact was built from. That is what makes a forecast auditable
after the fact: a figure on a screen can be traced to a version, and a version to
the exact PDFs it came from.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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


class ForecastRequest(BaseModel):
    """Mirrors `ForecastRequestSchema` in packages/contracts."""

    procedureId: str
    cityTier: str = Field(pattern="^[XYZ]$")
    nabh: bool
    roomClass: str
    days: int = Field(ge=0, le=365)
    icuDays: int = Field(ge=0, le=365)
    #: Settled bills, newest first, capped by the caller. Absent from a caller
    #: that has none, which is the shape this service shipped with.
    observed: list[Outcome] = Field(default_factory=list, max_length=500)


@app.get("/health")
def health() -> dict:
    m = model_mod.load()
    return {
        "status": "ok",
        "modelVersion": m.version,
        "trainedOn": m.trained_on,
        "surveyPeriod": m.raw["surveyPeriod"],
        "multiplier": m.multiplier,
        "heldOutCoverage": m.coverage,
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
            [(o.p50, o.actual) for o in req.observed],
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
