#!/usr/bin/env bash
# Sobe a pilha Supabase local sem Docker (A-017). Idempotente.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/env.sh"
[ -x "$BIN/postgrest" ] && [ -x "$BIN/auth" ] || bash "$HERE/setup.sh"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  [ "$(id -u)" = 0 ] && chown -R postgres:postgres "$PGDATA"
  echo postgres >"$LOCAL/.pwfile"
  chmod 644 "$LOCAL/.pwfile"
  as_pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --pwfile="$LOCAL/.pwfile" -A scram-sha-256 --locale=C.UTF-8 -E UTF8 >/dev/null
  cat >>"$PGDATA/postgresql.conf" <<CONF
port = $PGPORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '/tmp'
shared_preload_libraries = 'pg_cron'
cron.database_name = 'postgres'
timezone = 'UTC'
max_connections = 200
CONF
fi
if ! as_pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  touch "$LOCAL/logs/postgres.log"
  [ "$(id -u)" = 0 ] && chown postgres "$LOCAL/logs/postgres.log"
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOCAL/logs/postgres.log" -w start >/dev/null
fi
export PGPASSWORD=postgres
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$HERE/bootstrap.sql" >/dev/null
eval "$(node "$HERE/jwt.mjs" "$JWT_SECRET")"

start_bg() { # nome, comando...
  local name=$1
  shift
  if [ -f "$LOCAL/$name.pid" ] && kill -0 "$(cat "$LOCAL/$name.pid")" 2>/dev/null; then return; fi
  nohup "$@" >"$LOCAL/logs/$name.log" 2>&1 &
  echo $! >"$LOCAL/$name.pid"
}
wait_port() {
  for _ in $(seq 1 60); do
    (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
    sleep 0.5
  done
  echo "porta $1 não subiu (veja .local/logs)"
  return 1
}

# Auth: roda as próprias migrations no schema auth
cd "$LOCAL/auth"
start_bg auth env \
  GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth \
  DATABASE_URL="postgresql://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres?search_path=auth" \
  GOTRUE_API_HOST=127.0.0.1 PORT=$AUTH_PORT API_EXTERNAL_URL="http://127.0.0.1:$PROXY_PORT/auth/v1" \
  GOTRUE_SITE_URL="${APP_URL:-http://localhost:3000}" GOTRUE_URI_ALLOW_LIST="http://localhost:3000/**,http://127.0.0.1:3000/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_SMTP_ADMIN_EMAIL=admin@citynews.local GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 \
  GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn \
  "$BIN/auth"
cd "$ROOT"
wait_port $AUTH_PORT
psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$HERE/post-auth.sql" >/dev/null

cat >"$LOCAL/postgrest.conf" <<CONF
db-uri = "postgresql://authenticator:postgres@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
db-channel-enabled = true
db-pool = 20
CONF
start_bg postgrest "$BIN/postgrest" "$LOCAL/postgrest.conf"
start_bg proxy node "$HERE/proxy.mjs" $PROXY_PORT $REST_PORT $AUTH_PORT
wait_port $REST_PORT
wait_port $PROXY_PORT

cat >"$LOCAL/stack.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$PROXY_PORT
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_DB_URL=$DB_URL
SUPABASE_JWT_SECRET=$JWT_SECRET
ENV
if [ ! -f "$ROOT/.env.local" ]; then
  {
    cat "$LOCAL/stack.env"
    echo "APP_URL=http://localhost:3000"
    echo "CRON_SECRET=local-cron-secret-local-cron-secret"
    echo "AI_PROVIDER=fake"
  } >"$ROOT/.env.local"
fi
echo "pilha local no ar: supabase http://127.0.0.1:$PROXY_PORT · db $DB_URL"
