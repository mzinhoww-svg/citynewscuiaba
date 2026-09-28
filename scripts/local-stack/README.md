# Pilha Supabase local sem Docker (A-017)

Usada quando o container não tem Docker nem Supabase CLI. Emula o suficiente do Supabase para o app e os testes:

| Serviço | Porta | Origem |
|---|---|---|
| Proxy (URL do Supabase) | 54321 | `proxy.mjs` (`/rest/v1` → PostgREST, `/auth/v1` → Auth) |
| Postgres 16 + pgvector + pg_cron | 54322 | apt (`postgresql-16`, `postgresql-16-pgvector`, `postgresql-16-cron`) |
| PostgREST 12 | 54330 | binário oficial |
| Supabase Auth (GoTrue) | 54331 | binário oficial `supabase/auth` |
| Caixa de saída SMTP | 2500 | `smtp-sink.mjs` (grava em `.local/mail/*.eml`; nada é enviado) |

```bash
bash scripts/local-stack/setup.sh   # baixa binários em .local/bin (uma vez)
bash scripts/local-stack/start.sh   # sobe tudo e escreve .local/stack.env e .env.local (se não existir)
pnpm db:reset                       # aplica migrations + seed
bash scripts/local-stack/stop.sh
```

`pgmq` e `pg_net` não existem aqui; as migrations os habilitam só se estiverem disponíveis (no Supabase real e no CI com `supabase start`). Senha local do banco: `postgres` (só local).

## Várias pilhas em paralelo (worktrees)

Grave um deslocamento de portas em `.local/offset` do worktree antes do primeiro `start.sh` (ex.: `mkdir -p .local && echo 100 > .local/offset`). Postgres, PostgREST, Auth, proxy e a porta do app (`3000 + offset`, usada pelo Playwright) se deslocam juntos.
