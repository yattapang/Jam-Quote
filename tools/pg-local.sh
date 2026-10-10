#!/bin/sh
# Starts a throwaway local PostgreSQL 16 cluster for the race suite (new-app/CLAUDE.md, "Testing"), creating it
# on first use. Synthetic data only; the cluster lives outside the repository and is safe to delete.
#
# Use:   sh tools/pg-local.sh
# Then:  cd new-app && PRYVIS_PG_URL=postgres://postgres@127.0.0.1:55440/postgres PRYVIS_REQUIRE_PG=1 npm test
#
# Two kinds of machine (M43: this script once assumed only the first):
# - Linux, in a disposable container: PostgreSQL 16's server binaries (Debian/Ubuntu: the postgresql-16 package)
#   and the `postgres` OS user that package creates. Run as root.
# - Windows, from Git Bash: PostgreSQL 16's official Windows binaries zip (EDB's "binaries" download, linked from
#   postgresql.org), unpacked so that $HOME/.pryvis-pg/pgsql/bin/initdb.exe exists — or set PRYVIS_PG_BIN to
#   another bin folder. No service, no administrator, no password: the cluster runs as the signed-in user and
#   listens on 127.0.0.1 only.
set -e
PORT=55440

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    D="$HOME/.pryvis-pg"
    B="${PRYVIS_PG_BIN:-$D/pgsql/bin}"
    EXE=.exe
    AS_POSTGRES=""
    ;;
  *)
    D=/var/tmp/pryvis-pg
    B="${PRYVIS_PG_BIN:-/usr/lib/postgresql/16/bin}"
    EXE=
    AS_POSTGRES=yes
    ;;
esac

# psql from the same bin folder where there is one, so a different client on PATH cannot answer for it.
PSQL="psql"
[ -x "$B/psql$EXE" ] && PSQL="$B/psql$EXE"

if "$PSQL" -h 127.0.0.1 -p $PORT -U postgres -Atc "select 1" >/dev/null 2>&1; then
  echo "pg: already up on $PORT"
  exit 0
fi

if [ ! -x "$B/initdb$EXE" ]; then
  echo "pg: PostgreSQL 16 server binaries not found at $B (see this script's header)" >&2
  exit 1
fi

if [ ! -f "$D/data/PG_VERSION" ]; then
  mkdir -p "$D"
  if [ -n "$AS_POSTGRES" ]; then
    chown postgres "$D"
    su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust >/dev/null"
  else
    "$B/initdb$EXE" -D "$D/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  fi
  echo "pg: created a new cluster in $D/data"
fi

rm -f "$D/data/postmaster.pid"
if [ -n "$AS_POSTGRES" ]; then
  su postgres -c "$B/pg_ctl -D $D/data -o '-p $PORT -k $D -c listen_addresses=127.0.0.1' -l $D/log start" >/dev/null
else
  # Windows has no Unix-domain socket directory to pass (-k); TCP on 127.0.0.1 is all the suite uses.
  "$B/pg_ctl$EXE" -D "$D/data" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$D/log" start >/dev/null
fi
sleep 2
"$PSQL" -h 127.0.0.1 -p $PORT -U postgres -Atc "select 'pg: up on $PORT'"
