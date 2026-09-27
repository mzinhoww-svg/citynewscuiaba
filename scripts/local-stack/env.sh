# shellcheck shell=bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$ROOT/.local"
BIN="$LOCAL/bin"
PGDATA="${CN_PGDATA:-$LOCAL/pg}"
PGBIN="/usr/lib/postgresql/16/bin"
PGPORT=54322
REST_PORT=54330
AUTH_PORT=54331
PROXY_PORT=54321
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
DB_URL="postgresql://postgres:postgres@127.0.0.1:$PGPORT/postgres"
POSTGREST_VERSION=12.2.3
AUTH_VERSION=2.197.0
mkdir -p "$LOCAL/logs" "$BIN"
