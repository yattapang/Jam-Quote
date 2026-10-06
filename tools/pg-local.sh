#!/bin/sh
# Starts a throwaway local PostgreSQL 16 cluster for the race suite (new-app/CLAUDE.md, "Testing"), creating it
# on first use. Synthetic data only; the cluster lives outside the repository and is safe to delete.
#
# Use:   sh tools/pg-local.sh
# Then:  cd new-app && PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres PRYVIS_REQUIRE_PG=1 npm test
#
# Needs PostgreSQL 16's server binaries (Debian/Ubuntu: the postgresql-16 package) and a `postgres` OS user,
# which that package creates. Run as root in a disposable container, or adjust for your machine.
set -e
D=/var/tmp/pryvis-pg
B=/usr/lib/postgresql/16/bin
PORT=55440

if psql -h 127.0.0.1 -p $PORT -U postgres -Atc "select 1" >/dev/null 2>&1; then
  echo "pg: already up on $PORT"
  exit 0
fi

if [ ! -x "$B/initdb" ]; then
  echo "pg: PostgreSQL 16 server binaries not found at $B (install postgresql-16)" >&2
  exit 1
fi

if [ ! -f "$D/data/PG_VERSION" ]; then
  mkdir -p "$D"
  chown postgres "$D"
  su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust >/dev/null"
  echo "pg: created a new cluster in $D/data"
fi

rm -f "$D/data/postmaster.pid"
su postgres -c "$B/pg_ctl -D $D/data -o '-p $PORT -k $D -c listen_addresses=127.0.0.1' -l $D/log start" >/dev/null
sleep 2
psql -h 127.0.0.1 -p $PORT -U postgres -Atc "select 'pg: up on $PORT'"
