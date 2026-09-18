# Deploying ClaimCast

Four pieces, three places, no monthly bill.

| Piece | Where | Why there |
|---|---|---|
| Web bundle | Firebase Hosting | Static files on a CDN. Free, no instance to wake. |
| API | Cloud Run, `asia-south1` | Free tier is generous and a cold start is a container start, not a VM wake. |
| ML service | Cloud Run, `asia-south1` | Same. |
| Postgres | Neon, free tier | Google has no always-free managed Postgres. Cloud SQL is a 30-day trial. |

**Nothing here costs money at demo volume**, and none of it is provisioned yet.
Every command below is one a person runs deliberately; nothing deploys itself.

## What the free tier actually is

Cloud Run's always-free allowance is **240,000 vCPU-seconds, 450,000 GiB-seconds
and 2 million requests per month**, and it does not expire. A demo that serves a
few hundred requests does not come close. Neon's free tier gives 0.5 GB of
storage, which the reference data uses a fraction of.

**Cold start.** With no always-on instance, an idle service starts a container
when the next request arrives. The API image measures **about 2.2 seconds** from
`docker run` to a served response on a laptop, and Cloud Run is not slower than
a laptop. That is a pause, not a failure — which is the whole reason this is not
on Render, whose free tier suspends the machine and takes around 50 seconds to
wake it. Fifty seconds in front of a panel is a dead demo; two is a page loading.

If cold start still matters on the day, `--min-instances=1` removes it entirely
and is a one-word change to the deploy command below. It costs roughly $5–10 a
month and is **not** covered by the free tier, so it is a decision, not a default.
The $300/90-day trial credit would cover it; taking the trial requires a card and
a temporary authorisation hold, and Google does not charge automatically when it
ends — the account stops until someone manually activates it.

## 1. The database

Make a project at neon.tech, take the pooled connection string, and run the
migrations **from a laptop**, not from a container:

```bash
DATABASE_URL="postgresql://…neon.tech/claimcast?sslmode=require" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

DATABASE_URL="postgresql://…neon.tech/claimcast?sslmode=require" \
  npm run db:seed
```

Migrating from a starting container races every other instance starting at the
same moment and hands the schema to whichever image is newest. Doing it by hand
is a person deciding, which is what a schema change is.

## 2. Secrets

Three values the services need and the repository must never contain. Generate
the two keys fresh for production — the ones in the local `.env` are development
keys and have been on a laptop.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # DOCUMENT_ENCRYPTION_KEY
```

Put them in Secret Manager rather than in `--set-env-vars`, because environment
variables set on a service are readable by anyone who can describe it, and one of
these decrypts other people's policy schedules:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

for s in SESSION_SECRET DOCUMENT_ENCRYPTION_KEY ANTHROPIC_API_KEY DATABASE_URL; do
  gcloud secrets create $s --replication-policy=automatic
done
# then, for each, piping the value in rather than passing it as an argument —
# an argument lands in the shell history:
printf %s "$VALUE" | gcloud secrets versions add SESSION_SECRET --data-file=-
```

**`ANTHROPIC_API_KEY` is what makes upload work.** Without it the server answers
503 and the intake screen offers the by-hand path instead, which is a working
demo missing one feature rather than a broken one.

## 3. The images

```bash
gcloud artifacts repositories create claimcast --repository-format=docker --location=asia-south1
gcloud auth configure-docker asia-south1-docker.pkg.dev

R=asia-south1-docker.pkg.dev/$PROJECT/claimcast

docker build -f infra/api.Dockerfile -t $R/api:1 .
docker build -f infra/ml.Dockerfile  -t $R/ml:1  .
docker push $R/api:1
docker push $R/ml:1
```

Tagged with a number, never `latest`. A running service should name the exact
image it is running, so that "roll back" is a deploy of the previous tag rather
than an archaeology problem.

## 4. The services

ML first, because the API needs its URL.

```bash
gcloud run deploy claimcast-ml \
  --image $R/ml:1 --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --max-instances 3

ML_URL=$(gcloud run services describe claimcast-ml --region asia-south1 --format='value(status.url)')

gcloud run deploy claimcast-api \
  --image $R/api:1 --region asia-south1 \
  --allow-unauthenticated \
  --memory 512Mi --cpu 1 --max-instances 3 \
  --set-env-vars "NODE_ENV=production,ML_SERVICE_URL=$ML_URL,WEB_ORIGIN=https://<project>.web.app" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest,DOCUMENT_ENCRYPTION_KEY=DOCUMENT_ENCRYPTION_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"
```

`--max-instances 3` is a cost ceiling, not a capacity plan. The free tier is
generous but not infinite, and a runaway loop against a public endpoint should
hit a wall rather than a bill.

`WEB_ORIGIN` must be the exact origin the browser loads, with no trailing slash.
The session cookie only crosses origins because CORS names this one; get it
wrong and every request creates a new anonymous session, which looks like data
loss rather than like a configuration error.

**`--allow-unauthenticated` is right here** and is worth saying out loud: it means
Cloud Run does not check IAM, not that the application does not check anything.
Ownership is enforced in the application, by the session layer.

## 5. The web app

```bash
VITE_API_URL=$(gcloud run services describe claimcast-api --region asia-south1 --format='value(status.url)') \
  npm run build --workspace @claimcast/web

npx firebase-tools deploy --only hosting
```

`VITE_API_URL` is baked into the bundle at build time, so the build has to happen
after the API exists. Rebuild and redeploy the web app whenever the API's URL
changes.

## 6. Check it from a browser that has never seen it

Not curl, and not the browser that has been open all week. A private window, on
the public URL:

- the reference data loads and the database tab has rows with sources
- upload `presentation deck/mockup documents/policy-schedule.pdf`, confirm the
  fields, and check the quotes are the ones on the page
- walk the tree; the government fork appears at 72
- open the working; every figure matches the local run
- reload on the journey screen — it must not 404 (that is the hosting rewrite)
- in a second private window, open a case id from the first: **404**

## What is deliberately absent

- **No CI.** Deploys are three commands run by a person who then checks the page.
  A pipeline that deploys on push is the wrong thing to build the week before a
  demo.
- **No custom domain.** `*.web.app` and `*.run.app` are both HTTPS and both fine.
- **No CSP.** Noted in `hosting.md`; it needs writing against the built bundle.
- **No log sink or alerting.** Cloud Run keeps logs for 30 days by default, and
  there is nobody on call.
