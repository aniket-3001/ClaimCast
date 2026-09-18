# The cost model service.
#
# The artifact is baked into the image rather than mounted, so that a running
# container's answers cannot change underneath it: an image is a version of the
# model, and `/health` reports which. Retraining means building an image, which
# is the point -- a figure shown to someone stays traceable to the documents it
# came from.
#
# Built from the repository root:
#   docker build -f infra/ml.Dockerfile -t claimcast-ml .

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    CLAIMCAST_ARTIFACTS=/app/artifacts

WORKDIR /app

COPY services/ml/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ml/app.py ./app.py
COPY services/ml/claimcast_ml ./claimcast_ml
COPY services/ml/artifacts ./artifacts

# The artifact carries a snapshot of every file a forecast reads -- the ETL output,
# the procedure list and the two code maps -- so the repository is not copied and
# not needed. That claim is checked by forecasting here rather than by asserting it
# in a comment, which is what the previous version of this file did while the
# container returned a 500 on its first real request. A missing artifact, a missing
# snapshot or a broken contract fails the build instead of the demo.
RUN python -c "\
import app, json; \
from claimcast_ml.forecast import forecast; \
m = app.model_mod.load(); \
f = forecast(m, 'p-tkr', 'X', True, 'semi_private', 6, 0); \
assert f.p10 < f.p50 < f.p90 and sum(f.split.values()) == f.p50; \
print('artifact', m.version, 'forecasts p50 Rs', f.p50 // 100)"

# Not root: this process takes uploads from the API and has no reason to own the
# filesystem it runs on.
RUN useradd --create-home --uid 10001 claimcast && chown -R claimcast /app
USER claimcast

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
