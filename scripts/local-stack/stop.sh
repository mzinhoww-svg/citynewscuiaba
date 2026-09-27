#!/usr/bin/env bash
# Derruba a pilha local (A-017).
set -uo pipefail
source "$(dirname "$0")/env.sh"
for n in proxy postgrest auth; do
  pidfile="${LOCAL:?}/${n:?}.pid"
  if [ -f "$pidfile" ]; then
    kill "$(cat "$pidfile")" 2>/dev/null
    rm -f -- "$pidfile"
  fi
done
if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast; else "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast; fi
