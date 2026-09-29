# Runbook · Restauração de backup

Não é um botão da Contingência: restaurar é operação de infraestrutura, com o dono do produto avisado.

## Fontes de backup

- **PITR** do Supabase (plano com retenção contínua): primeira opção para qualquer perda recente.
- **`backup.yml`** (GitHub Actions, diário): `pg_dump` do schema `public` para armazenamento externo (`BACKUP_*` nos segredos do repositório).

## Passos

1. Ligue o **modo leitura** (runbook `modo-leitura.md`) e **pause a publicação automática** (`pausar-automatico.md`): nada grava durante a restauração.
2. Identifique o ponto no tempo (auditoria, `pipeline_events`, relato do incidente).
3. PITR: Supabase → Database → Backups → *Point in time* → escolha o instante → restaure num **branch** ou projeto novo primeiro; confira `articles`, `sources`, `audit_log` e `approvals`.
4. `pg_dump`: `pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" backup.dump`, também num ambiente separado primeiro.
5. Aplique as migrations pendentes (`supabase db push` ou o conector da produção, na ordem registrada em `.planning/DECISIONS.md`).
6. Rode `pnpm db:types` e a suíte de integração contra o ambiente restaurado.
7. Troque a produção para o ambiente restaurado (ou restaure em cima, se o dono aprovar), desligue o modo leitura e peça a aprovação para retomar a publicação automática.

## Teste mensal

Restaurar o último `pg_dump` num projeto descartável e rodar `pnpm test`; registrar data e resultado em `docs/reports/` (obrigação de `docs/architecture.md` §9).
