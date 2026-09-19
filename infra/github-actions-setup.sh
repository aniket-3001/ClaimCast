#!/usr/bin/env bash
#
# Lets GitHub Actions deploy this project, without giving GitHub a key.
#
# Run once, from a shell already logged in as the project owner:
#
#     bash infra/github-actions-setup.sh
#
# Safe to run again. Every step either creates the thing or says it is already
# there, and the role bindings are idempotent by construction.
#
# ---------------------------------------------------------------------------
# Why there is no JSON key in this file
#
# The obvious way to do this is `gcloud iam service-accounts keys create` and
# paste the JSON into a GitHub secret. That key never expires, it is readable
# by anyone who can edit the repository's settings or persuade a workflow to
# print it, and nothing in Google will tell you when it leaks.
#
# Workload Identity Federation replaces it with a question. GitHub mints a
# short-lived OIDC token for each workflow run, describing which repository,
# which ref and which workflow it came from. Google is configured below to
# accept such a token -- but only from this repository -- and to swap it for a
# credential that lasts about an hour. There is nothing to leak, nothing to
# rotate, and a fork of the repository cannot use it.
#
# What the deploy identity can do is listed step by step below, and each grant
# is there because a specific line of .github/workflows/main.yml needs it.
# ---------------------------------------------------------------------------

set -euo pipefail

PROJECT=claimcast-2026
PROJECT_NUMBER=166020697175
REGION=us-central1
REPO=aniket-3001/ClaimCast

DEPLOYER=claimcast-deployer@$PROJECT.iam.gserviceaccount.com
POOL=github
PROVIDER=github-oidc

say() { printf '\n== %s\n' "$1"; }

say "APIs"
# sts and iamcredentials are what the token exchange itself runs on; without
# them the auth step fails with a permission error that does not mention them.
gcloud services enable \
  sts.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iap.googleapis.com \
  --project=$PROJECT

say "The deploy identity"
gcloud iam service-accounts create claimcast-deployer \
  --display-name="GitHub Actions deployer" \
  --description="Used only by .github/workflows/main.yml, via Workload Identity Federation. No key exists for it." \
  --project=$PROJECT 2>/dev/null || echo "   already exists"

say "What it may do"
# run.admin: create a new revision of claimcast-api and claimcast-ml.
# artifactregistry.writer: push the two images it just built.
# iap.tunnelResourceAccessor + compute.viewer: open the tunnel to the database
#   VM, which has no public address. compute.viewer is the read needed to find
#   the instance; the tunnel grant is what permits the connection.
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iap.tunnelResourceAccessor \
  roles/compute.viewer
do
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$DEPLOYER" --role="$ROLE" \
    --condition=None --quiet >/dev/null
  echo "   $ROLE"
done

# Deploying a revision means running it *as* the service's own identity, and
# Google treats that as impersonation. Granted on the two runtime accounts
# individually rather than project-wide, so the deployer cannot act as any
# other service account in the project.
say "Permission to deploy as the services' own identities"
for SA in claimcast-api@$PROJECT.iam.gserviceaccount.com claimcast-ml@$PROJECT.iam.gserviceaccount.com; do
  gcloud iam service-accounts add-iam-policy-binding "$SA" \
    --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser \
    --project=$PROJECT --quiet >/dev/null
  echo "   $SA"
done

# The migration step reads the database URL out of Secret Manager rather than
# keeping a second copy as a GitHub secret. Scoped to that one secret.
say "Read access to the database URL, and nothing else in Secret Manager"
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:$DEPLOYER" --role=roles/secretmanager.secretAccessor \
  --project=$PROJECT --quiet >/dev/null
echo "   DATABASE_URL"

say "The identity pool"
gcloud iam workload-identity-pools create $POOL \
  --location=global --display-name="GitHub" \
  --description="Accepts OIDC tokens from GitHub Actions." \
  --project=$PROJECT 2>/dev/null || echo "   already exists"

say "The GitHub provider"
# The attribute condition is the security boundary, and it is not optional:
# without it, a workflow in *any* GitHub repository on earth could present a
# token and be believed. Google refuses to create a github.com provider with no
# condition for exactly this reason.
gcloud iam workload-identity-pools providers create-oidc $PROVIDER \
  --location=global --workload-identity-pool=$POOL \
  --display-name="GitHub Actions" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO'" \
  --project=$PROJECT 2>/dev/null || echo "   already exists"

say "Letting this repository, and only this repository, act as the deployer"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" \
  --project=$PROJECT --quiet >/dev/null
echo "   $REPO"

cat <<EOF

Done. The workflow needs no GitHub secrets -- the two values it authenticates
with are already written into .github/workflows/main.yml, and neither is
confidential:

  workload_identity_provider: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
  service_account:            $DEPLOYER

Two things GitHub still needs doing by hand, in the repository's settings:

  1. Settings > Actions > General > Workflow permissions -- leave as read-only.
     The workflow asks for what it needs per job.

  2. Settings > Environments > New environment, named "production". The deploy
     job names it, so it will run without one, but creating it is what lets you
     add a required reviewer later -- a human click between a push to main and
     a live deploy, which is worth having in the week of a demo.

To check the grants took, without deploying anything:

  gcloud iam service-accounts get-iam-policy $DEPLOYER --project=$PROJECT
EOF
