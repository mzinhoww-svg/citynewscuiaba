#!/usr/bin/env bash
# Instala dependências da pilha local (A-017). Idempotente.
set -euo pipefail
source "$(dirname "$0")/env.sh"
if [ ! -x "$PGBIN/postgres" ] || [ ! -f /usr/share/postgresql/16/extension/vector.control ] || [ ! -f /usr/share/postgresql/16/extension/pg_cron.control ]; then
  echo "Instalando Postgres 16, pgvector e pg_cron (apt)"
  apt-get install -y -q postgresql-16 postgresql-16-pgvector postgresql-16-cron
fi
if [ ! -x "$BIN/postgrest" ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/v$POSTGREST_VERSION/postgrest-v$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar -xJ -C "$BIN"
fi
if [ ! -x "$BIN/auth" ]; then
  mkdir -p "$LOCAL/auth"
  curl -sSL "https://github.com/supabase/auth/releases/download/v$AUTH_VERSION/auth-v$AUTH_VERSION-x86.tar.gz" | tar -xz -C "$LOCAL/auth"
  ln -sf "$LOCAL/auth/auth" "$BIN/auth"
fi
echo "ok: $("$BIN/postgrest" --version) · auth $AUTH_VERSION"
