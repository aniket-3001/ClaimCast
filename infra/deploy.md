# Deploying ClaimCast

**Live:** <https://claimcast-api-166020697175.us-central1.run.app>

Everything is in one Google Cloud project, `claimcast-2026`, in `us-central1`.

| Piece | Where | Why there |
|---|---|---|
| Web bundle + API | One Cloud Run service, `claimcast-api` | Same image, same process, same origin. No second thing to deploy and no cross-origin cookie to get wrong. |
| ML service | Cloud Run, `claimcast-ml`, **private** | Only the API calls it, so it does not need to be on the internet. |
| Postgres | Postgres 16 in Docker on an always-free `e2-micro` | Cloud SQL has no free tier. |

The one expected non-zero cost is Artifact Registry: the free tier is 0.5 GB and
these images are larger, so about **₹9–15 a month**. Everything else is inside an
always-free allowance. A budget alert named *ClaimCast guard* fires at 50%, 90%
and 100% of ₹200.

## Why not the obvious things

**Not `asia-south1`.** The always-free `e2-micro` exists only in `us-central1`,
`us-west1` and `us-east1`. The database has to be next to the services, so the
region followed the free VM rather than the other way round. Mumbai would have
been about 150 ms closer and would have cost roughly ₹800 a month.

**Not Cloud SQL.** No free tier at any size. Its smallest instance is around
₹800 a month, every month, for a database that sits idle between demos.

**Not a Serverless VPC Access connector.** A connector is billed per hour
whether or not anything crosses it — roughly ₹430 a month. **Direct VPC egress**
does the same job for this, and is free. It is the `--network`/`--subnet`/
`--vpc-egress` flags on the API deploy below.

**No external IP on the VM.** An attached external IPv4 address is charged even
while idle, about ₹300 a month. One is attached for the first boot, so the
machine can reach the Docker registry and apt, and detached afterwards. After
that the machine is reached over IAP when a person needs a shell or a tunnel.

**One `e2-micro` is free per billing account**, not per project. Before creating
this one every project on the account was scanned for an existing one; there was
none.

## The sequence

It is written out in order because the order matters — several steps fail with
confusing errors if run early.

### 0. Billing

```bash
gcloud billing projects link claimcast-2026 --billing-account=<ACCOUNT>
```

Nothing below works without this, including things that look unrelated to money.
Free-tier resources still require a project with billing enabled.

### 1. APIs

```bash
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  compute.googleapis.com iap.googleapis.com billingbudgets.googleapis.com \
  aiplatform.googleapis.com \
  --project=claimcast-2026
```

### 2. Artifact Registry

```bash
gcloud artifacts repositories create claimcast \
  --repository-format=docker --location=us-central1 --project=claimcast-2026
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 3. The database VM

`infra/db-startup.sh` is the startup script; read it before running it, it
explains its own choices. The password goes in as instance metadata rather than
in the script, and the script deliberately has no `set -x` — startup output goes
to the serial console, which anyone with viewer on the project can read.

```bash
gcloud compute instances create claimcast-db \
  --project=claimcast-2026 --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --metadata-from-file=startup-script=infra/db-startup.sh \
  --metadata=pgpassword="$PGPASS"
```

30 GB of `pd-standard` is the free allowance exactly; a larger disk or a
`pd-balanced` one is billed.

Firewall — three rules, none of them open to the internet:

```bash
# IAP's range, for ssh and for tunnelling psql from a laptop.
gcloud compute firewall-rules create claimcast-iap-ssh \
  --allow=tcp:22 --source-ranges=35.235.240.0/20
gcloud compute firewall-rules create claimcast-pg-iap \
  --allow=tcp:5432 --source-ranges=35.235.240.0/20
# Cloud Run, over Direct VPC egress.
gcloud compute firewall-rules create claimcast-pg-internal \
  --allow=tcp:5432 --source-ranges=10.128.0.0/9
```

Then detach the external IP, once the startup script has finished (the machine
writes `/var/log/claimcast-startup.done`):

```bash
gcloud compute instances delete-access-config claimcast-db \
  --zone=us-central1-a --access-config-name="external-nat"
```

### 4. Secrets

Four values the services need and the repository must never contain. Generate
the two keys fresh for production — the ones in the local `.env` are development
keys and have been on a laptop.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # DOCUMENT_ENCRYPTION_KEY
```

Secret Manager rather than `--set-env-vars`, because environment variables set on
a service are readable by anyone who can describe it, and one of these decrypts
other people's policy schedules.

```bash
for s in SESSION_SECRET DOCUMENT_ENCRYPTION_KEY GROQ_API_KEY DATABASE_URL; do
  gcloud secrets create $s --replication-policy=automatic
done
# then, for each, piping the value in rather than passing it as an argument —
# an argument lands in the shell history:
printf %s "$VALUE" | gcloud secrets versions add SESSION_SECRET --data-file=-
```

`DATABASE_URL` points at the VM's **internal** address:
`postgresql://claimcast:<pass>@10.128.0.2:5432/claimcast`.

**Something must be configured for upload to work.** With no provider at all
the server answers 503 and the intake screen offers the by-hand path instead,
which is a working demo missing one feature rather than a broken one.

The provider this deployment uses is **Vertex**, which is not in the list above
because it is not a secret. Vertex reaches Gemini through Google Cloud rather
than through AI Studio, so it authenticates with the service account and bills
to this project — no API key to store, rotate or leak, and it is covered by the
credit the project already has. It is turned on with one environment variable,
`VERTEX_PROJECT`, and one IAM grant in step 6.

The AI Studio API is a different billing arrangement and Cloud credit does not
fund it: on this account every model there answers 429 "prepayment credits are
depleted". `GEMINI_API_KEY` is therefore deliberately not set anywhere.

`GROQ_API_KEY` stays in Secret Manager as the fallback, and is worth keeping for
a reason beyond redundancy: on the mockup schedule Groq reads the same sixteen
values correctly in about 4 seconds against Gemini Pro's 26, and quotes one more
span verbatim. `EXTRACTION_PROVIDER=groq` pins it, which is the flag to reach for
if a live upload in front of a panel needs to be quick rather than thorough.

### 5. Migrations and seed, over an IAP tunnel

From a laptop, not from a container. Migrating from a starting container races
every other instance starting at the same moment and hands the schema to
whichever image is newest; doing it by hand is a person deciding, which is what a
schema change is.

```bash
gcloud compute start-iap-tunnel claimcast-db 5432 \
  --local-host-port=localhost:5433 --zone=us-central1-a   # leave running

DATABASE_URL="postgresql://claimcast:<pass>@localhost:5433/claimcast" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
DATABASE_URL="postgresql://claimcast:<pass>@localhost:5433/claimcast" \
  npm run db:seed
DATABASE_URL="postgresql://claimcast:<pass>@localhost:5433/claimcast" \
  npm run db:verify --workspace @claimcast/api
```

`db:verify` must print *"database agrees with the fixtures, figure for figure"*.
A seeded database that adjudicates differently from the fixtures is the one
failure that would not be visible on screen.

The seed takes minutes over a tunnel rather than seconds locally. That is why the
transaction carries an explicit ten-minute timeout — Prisma's default is five
seconds and the failure it produces reads like a Prisma bug.

### 6. Service accounts

One per service, each with only what it needs, rather than the default compute
account which can do rather a lot.

```bash
gcloud iam service-accounts create claimcast-api
gcloud iam service-accounts create claimcast-ml
```

- `roles/secretmanager.secretAccessor` on **each of the four secrets** for
  `claimcast-api@` — granted per secret, not project-wide.
- `roles/run.invoker` on `claimcast-ml` for `claimcast-api@`.
- `roles/aiplatform.user` for `claimcast-api@`, which is the whole of what the
  Vertex extraction path needs. The token comes from the metadata server at
  request time and is cached until a minute before it expires.
- `roles/compute.networkUser` for `claimcast-api@` **and** for the Cloud Run
  service agent
  `service-<PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com`.
  Direct VPC egress needs the second one, and the error when it is missing is a
  database connection failure, which points somewhere else entirely.

**This grant is not instant.** Two API revisions failed with `P1001` after the
grant was made and a later one succeeded with no code change. If a deploy fails
that way, wait and redeploy before changing anything.

### 7. The images

```bash
R=us-central1-docker.pkg.dev/claimcast-2026/claimcast

docker build -f infra/api.Dockerfile -t $R/api:v4 .
docker build -f infra/ml.Dockerfile  -t $R/ml:v1  .
docker push $R/api:v4
docker push $R/ml:v1
```

Tagged with a number, never `latest`. A running service should name the exact
image it is running, so that "roll back" is a deploy of the previous tag rather
than an archaeology problem.

The API image builds the web bundle too — see the comment in `api.Dockerfile`.

### 8. The services

ML first, because the API needs its URL.

```bash
gcloud run deploy claimcast-ml \
  --image $R/ml:v1 --region us-central1 \
  --no-allow-unauthenticated \
  --service-account claimcast-ml@claimcast-2026.iam.gserviceaccount.com \
  --port 8000 --memory 1Gi --cpu 1 --max-instances 2

ML_URL=$(gcloud run services describe claimcast-ml --region us-central1 --format='value(status.url)')

gcloud run deploy claimcast-api \
  --image $R/api:v4 --region us-central1 \
  --allow-unauthenticated \
  --service-account claimcast-api@claimcast-2026.iam.gserviceaccount.com \
  --memory 1Gi --cpu 1 --max-instances 3 --min-instances 0 \
  --concurrency 40 --timeout 120 \
  --network=default --subnet=default --vpc-egress=private-ranges-only \
  --set-env-vars "NODE_ENV=production,ML_SERVICE_URL=$ML_URL,VERTEX_PROJECT=claimcast-2026" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,DOCUMENT_ENCRYPTION_KEY=DOCUMENT_ENCRYPTION_KEY:latest,GROQ_API_KEY=GROQ_API_KEY:latest"
```

`--vpc-egress=private-ranges-only` sends RFC 1918 traffic — the database — into
the VPC and leaves everything else, including the call to Groq, going out the
normal way. `all-traffic` would need a NAT gateway, which is billed.

**No `WEB_ORIGIN` and no `VITE_API_URL`.** The bundle is served by this same
process, so `BASE` in `apps/web/src/api.ts` is `""` and every request is
first-party. Setting `WEB_ORIGIN` is how an operator says the app really is
hosted apart; it also flips the session cookie to `SameSite=None`, which is the
precondition for CSRF, so do not set it casually.

**`--allow-unauthenticated` is right here**, and is worth saying out loud: it
means Cloud Run does not check IAM, not that the application checks nothing.
Ownership is enforced in the application, by the session layer.

`--max-instances 3` is a cost ceiling, not a capacity plan. A runaway loop
against a public endpoint should hit a wall rather than a bill.

The API proves its identity to the private ML service with a token from the
instance metadata server. Nothing is configured for that beyond the
`run.invoker` grant in step 6.

### 9. Budget alert

```bash
gcloud billing budgets create --billing-account=<ACCOUNT> \
  --display-name="ClaimCast guard" --budget-amount=200INR \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
  --filter-projects=projects/<PROJECT_NUMBER>
```

An alert, not a cap — Google does not stop the services when it fires. It is
notice, and nothing more.

## Check it from a browser that has never seen it

Not curl, and not the browser that has been open all week. A private window, on
the public URL:

- the reference data loads and the database tab has rows with sources
- upload `presentation deck/mockup documents/policy-schedule.pdf`, confirm the
  fields, and check the quotes are the ones on the page
- walk the tree; the government fork appears at 72
- open the working; every figure matches the local run
- reload on the journey screen — it must not 404
- in a second private window, open a case id from the first: **404**

## Redeploying

A code change is a new tag and one command:

```bash
docker build -f infra/api.Dockerfile -t $R/api:v7 . && docker push $R/api:v7
gcloud run deploy claimcast-api --image $R/api:v7 --region us-central1
```

Flags already set on the service are kept. Rolling back is the same command with
the previous tag. Tags in use at the time of writing: `api:v7`, `ml:v2`.

**If the change touches `services/ml`, that image has to go too**, and it is easy
to forget because nothing fails loudly when it is missed. The API is the only
caller, the response is parsed with a Zod object rather than a strict one, and a
field the running model does not return is simply dropped on the way through. So
a stale model does not error -- it silently answers the older question, and the
screen shows a forecast that looks fine.

```bash
docker build -f infra/ml.Dockerfile -t $R/ml:v2 . && docker push $R/ml:v2
gcloud run deploy claimcast-ml --image $R/ml:v2 --region us-central1
```

**A migration goes before the API, never after.** The container does not migrate
on boot, for the reason in step 5, so a revision whose code expects a table that
is not there answers 500 on the routes that touch it while the rest of the app
looks healthy. Check first and apply only if something is pending -- over the
same IAP tunnel, from the laptop:

```bash
gcloud compute start-iap-tunnel claimcast-db 5432 \
  --local-host-port=localhost:5433 --zone=us-central1-a    # leave running

DATABASE_URL="postgresql://claimcast:<pass>@localhost:5433/claimcast" \
  npx prisma migrate status --schema apps/api/prisma/schema.prisma
DATABASE_URL="postgresql://claimcast:<pass>@localhost:5433/claimcast" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

The password is in Secret Manager and does not need to be read by eye:
`gcloud secrets versions access latest --secret=DATABASE_URL`.

Order for a change that touches all three: migrate, then `ml`, then `api`. The
model tolerates an older API -- `observed` defaults to empty and the forecast is
the survey estimate untouched -- so `ml` first is safe, and `api` last means the
new code never runs against a database or a model that is behind it.

Then, from the laptop, against the public URL rather than a dev server:

```bash
python infra/smoke_learning.py https://claimcast-api-166020697175.us-central1.run.app
```

It reports a settled bill and asserts the next forecast moved, which is the one
check that cannot pass unless all three pieces are the versions you just shipped.
It leaves one row in `forecast_outcomes` and prints its id.

## What is deliberately absent

- **No CI.** Deploys are two commands run by a person who then checks the page. A
  pipeline that deploys on push is the wrong thing to build before a demo.
- **No custom domain.** `*.run.app` is HTTPS and fine.
- **No log sink or alerting.** Cloud Run keeps logs for 30 days by default, and
  there is nobody on call.
- **No mail service**, which is why `/api/auth/claim` still discloses whether an
  email is registered. Written down in `apps/api/src/session.ts` rather than
  papered over.
