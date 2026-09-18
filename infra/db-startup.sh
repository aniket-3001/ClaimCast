#!/bin/bash
# Postgres on the always-free e2-micro. Runs once, on first boot.
#
# Why a VM and not Cloud SQL: Cloud SQL has no free tier at all -- the smallest
# instance is about Rs 800 a month, every month, for a database that spends the
# year idle between demos. The e2-micro is free indefinitely in us-central1,
# us-west1 and us-east1, and one is free per billing account, which is why this
# is the only VM the account runs.
#
# Why Docker rather than apt: Debian 12 ships Postgres 15 and development runs
# 16. The gap is very unlikely to matter for this schema, but "very unlikely to
# matter" is not a thing to discover from a migration failing at 2am before a
# demo. The image pins the same major version the migrations were written on.
#
# The machine has 1 GB of RAM and a shared core. Postgres defaults assume more,
# so the settings below are deliberately small, and swap exists so that a burst
# degrades into slowness rather than into the OOM killer taking the database.
#
# No `set -x`. The trace would expand $PGPASS on both the line that fetches it
# and the `docker run` that uses it, and the startup script's output goes to the
# serial console, which is readable by anyone with viewer on the project and is
# retained in Cloud Logging. A database password is not worth a verbose log.
set -euo pipefail

PGPASS="$(curl -fsH 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/pgpassword)"

# Swap first: if the rest of this script is what runs the machine out of memory,
# it should be slow, not dead.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends docker.io
systemctl enable --now docker

mkdir -p /var/lib/pgdata

# --restart always, because the point of this machine is that it is there when
# the demo starts. A reboot that leaves the database down is the same outage as
# no database at all.
docker rm -f claimcast-db 2>/dev/null || true
docker run -d --name claimcast-db --restart always \
  -p 5432:5432 \
  -v /var/lib/pgdata:/var/lib/postgresql/data \
  -e POSTGRES_USER=claimcast \
  -e POSTGRES_PASSWORD="$PGPASS" \
  -e POSTGRES_DB=claimcast \
  --shm-size=128m \
  postgres:16-alpine \
  -c shared_buffers=128MB \
  -c max_connections=40 \
  -c work_mem=4MB \
  -c maintenance_work_mem=32MB

echo "claimcast db startup complete" > /var/log/claimcast-startup.done
