# shellcheck shell=bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL="$ROOT/.local"
BIN="$LOCAL/bin"
PGDATA="${CN_PGDATA:-$LOCAL/pg}"
PGBIN="/usr/lib/postgresql/16/bin"
# Várias pilhas no mesmo container (worktrees em paralelo): .local/offset desloca as portas.
if [ -z "${CN_STACK_OFFSET:-}" ] && [ -f "$LOCAL/offset" ]; then CN_STACK_OFFSET="$(cat "$LOCAL/offset")"; fi
OFFSET="${CN_STACK_OFFSET:-0}"
PGPORT=$((54322 + OFFSET))
REST_PORT=$((54330 + OFFSET))
AUTH_PORT=$((54331 + OFFSET))
PROXY_PORT=$((54321 + OFFSET))
APP_PORT=$((3000 + OFFSET))
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
DB_URL="postgresql://postgres:postgres@127.0.0.1:$PGPORT/postgres"
POSTGREST_VERSION=12.2.3
AUTH_VERSION=2.197.0
mkdir -p "$LOCAL/logs" "$BIN"
