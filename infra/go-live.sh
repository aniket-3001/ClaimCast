#!/usr/bin/env bash
#
# Everything that has to happen once, in one command:
#
#     bash infra/go-live.sh
#
# 1. Sets up the GitHub Actions deploy identity (infra/github-actions-setup.sh).
# 2. Triggers the pipeline on main and waits for it to finish.
# 3. Opens the tunnel to the production database, clears the sixteen seeded
#    admissions, and closes the tunnel again.
# 4. Checks the public API and says what it found.
#
# One terminal, no directory to change into, nothing to leave running in
# another window. Safe to run again if a step fails part-way: every step either
# does the thing or reports that it was already done.

set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT=claimcast-2026
ZONE=us-central1-a
URL=https://claimcast-api-166020697175.us-central1.run.app
TUNNEL_PID=""

step() { printf '\n\n########  %s\n\n' "$1"; }
die()  { printf '\n!!  %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    echo "closed the database tunnel"
  fi
}
trap cleanup EXIT

# -- prerequisites, checked up front so this does not fail half way through --
command -v gcloud >/dev/null || die "gcloud is not on PATH."
command -v gh     >/dev/null || die "the GitHub CLI (gh) is not on PATH."
command -v npm    >/dev/null || die "npm is not on PATH."
gcloud auth print-access-token >/dev/null 2>&1 \
  || die "gcloud is not logged in. Run: gcloud auth login"
gh auth status >/dev/null 2>&1 \
  || die "gh is not logged in. Run: gh auth login"


step "1 of 4 — the GitHub Actions deploy identity"
bash infra/github-actions-setup.sh


step "2 of 4 — deploying main through the pipeline"
# Give Google's token endpoint a moment to see the pool that was just created.
sleep 20
gh workflow run ClaimCast --ref main
echo "waiting for the run to be picked up..."
RUN=""
for _ in $(seq 1 20); do
  sleep 5
  RUN=$(gh run list --workflow=ClaimCast --branch=main --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RUN" ] && break
done
[ -n "$RUN" ] || die "could not find the workflow run. Check: gh run list"
echo "watching run $RUN -- this takes about five minutes"
gh run watch "$RUN" --exit-status --interval 20 \
  || die "the pipeline failed. Read it with: gh run view $RUN --log-failed"


step "3 of 4 — clearing the seeded admissions from the production database"
gcloud compute start-iap-tunnel claimcast-db 5432 \
  --local-host-port=localhost:5433 --zone="$ZONE" --project="$PROJECT" \
  >/dev/null 2>&1 &
TUNNEL_PID=$!
echo "opening the tunnel..."
for _ in $(seq 1 30); do
  (echo > /dev/tcp/127.0.0.1/5433) >/dev/null 2>&1 && break
  sleep 2
done
(echo > /dev/tcp/127.0.0.1/5433) >/dev/null 2>&1 \
  || die "the tunnel did not come up. Check that the claimcast-db VM is running."

# Read from Secret Manager and rewrite the host to point at the tunnel. The
# password is never printed and never written to a file.
DB=$(gcloud secrets versions access latest --secret=DATABASE_URL --project="$PROJECT" \
      | sed 's#@[^/]*/#@localhost:5433/#')
case "$DB" in
  *"@localhost:5433/claimcast"*) ;;
  *) die "the database url did not rewrite to the tunnel; nothing was changed" ;;
esac

npm run db:generate
DATABASE_URL="$DB" npm run db:seed

cleanup
TUNNEL_PID=""


step "4 of 4 — checking the live site"
python infra/smoke_deploy.py "$URL"

LEFT=$(python -c "
import json,urllib.request
o=json.loads(urllib.request.urlopen('$URL/api/reference',timeout=60).read())
print(len(o['admissions']))
")
echo ""
if [ "$LEFT" = "0" ]; then
  echo "Done. The live database holds no seeded admissions."
else
  die "$LEFT admissions are still in the live database."
fi

cat <<EOF

From here on, every push deploys itself. Nothing above needs running again.

  $URL
EOF
