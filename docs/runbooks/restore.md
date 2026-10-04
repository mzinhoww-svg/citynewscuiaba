# Runbook · Restauração de backup

Não é um botão da Contingência: restaurar é operação de infraestrutura, com o dono do produto avisado.

## Fontes de backup

- **Backup do plano do Supabase** (diário no plano free; PITR só em plano pago): primeira opção para perda recente.
- **`backup.yml`** (GitHub Actions, diário às 06:17 UTC): `pg_dump` em formato custom dos schemas `public`, `auth` e `storage` (só metadados do Storage, não os arquivos), guardado como **artifact do GitHub por 7 dias**. Em repositório público o arquivo sai cifrado com gpg (`.dump.gpg`, senha no secret `BACKUP_PASSPHRASE`); sem `SUPABASE_DB_URL` o backup não roda e o workflow só avisa.
- Os arquivos do bucket `media` não entram no dump. Imagens de reprodução podem ser recoletadas da fonte; banners e logos precisam de cópia própria (lacuna registrada na auditoria 360, `docs/audit/AUDIT-REPORT.md`).

## Passos

1. Ligue o **modo leitura** (runbook `modo-leitura.md`) e **pause a publicação automática** (`pausar-automatico.md`): nada grava durante a restauração.
2. Identifique o ponto no tempo (auditoria, `pipeline_events`, relato do incidente).
3. PITR: Supabase → Database → Backups → *Point in time* → escolha o instante → restaure num **branch** ou projeto novo primeiro; confira `articles`, `sources`, `audit_log` e `approvals`.
4. `pg_dump`: baixe o artifact da execução desejada (Actions → Backup do banco). Se for `.gpg`, decifre com `gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -o backup.dump -d citynews-prod-<data>.dump.gpg`. Depois `pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" backup.dump`, também num ambiente separado primeiro. O artifact vence em 7 dias: copie para fora antes se o incidente puder durar mais.
5. Aplique as migrations pendentes (`supabase db push` ou o conector da produção, na ordem registrada em `.planning/DECISIONS.md`).
6. Rode `pnpm db:types` e a suíte de integração contra o ambiente restaurado.
7. Troque a produção para o ambiente restaurado (ou restaure em cima, se o dono aprovar), desligue o modo leitura e religue a publicação automática na Contingência (ação direta do admin, auditada, A-125).

## Teste mensal

Restaurar o último `pg_dump` num projeto descartável e rodar `pnpm test`; registrar data e resultado em `docs/reports/` (obrigação de `docs/architecture.md` §9).
