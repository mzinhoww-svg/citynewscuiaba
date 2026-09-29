# Runbook: restaurar o banco a partir do backup

Cobre a perda ou corrupção do banco de produção. Há duas fontes, nesta ordem de preferência:

1. **PITR do Supabase** (plano pago): restauração para um instante, pelo painel do Supabase (Database > Backups > Point in time).
2. **Backup diário do GitHub Actions** (`.github/workflows/backup.yml`): `pg_dump` em formato custom, guardado como artifact por **7 dias**, cifrado com `gpg` (AES-256) usando o secret `BACKUP_PASSPHRASE`. Roda às 03h17 em Cuiabá (06:17 UTC); também pode ser disparado manualmente (Actions > Backup do banco > Run workflow).

## Quem pode

Quem tem acesso ao repositório (para baixar o artifact), à senha `BACKUP_PASSPHRASE` (gerenciador de segredos da equipe, nunca no repositório) e à `SUPABASE_DB_URL` de destino. Combine com um admin do Estúdio.

## Antes de restaurar

1. Ative o **modo leitura** ([modo-leitura](modo-leitura.md)) e **pause a publicação automática** se o banco ainda responder.
2. Anote a hora do incidente. Decida se restaura sobre um projeto novo (recomendado) ou sobre o atual.
3. Pause o agendamento: no banco, `select cron.unschedule(jobid) from cron.job;` (anote antes com `select * from cron.job;`), e desative o workflow `cron-watchdog` no GitHub.

## Passo a passo (backup do GitHub)

1. GitHub > Actions > **Backup do banco** > a execução mais recente e boa > baixe o artifact `citynews-prod-AAAAMMDDTHHMMZ.dump.gpg`.
2. Decifre:
   ```bash
   gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
     -o citynews.dump -d citynews-prod-AAAAMMDDTHHMMZ.dump.gpg
   ```
   (Se o repositório é privado e não havia senha, o arquivo termina em `.dump` e não precisa decifrar.)
3. Confira o conteúdo: `pg_restore --list citynews.dump | head`. Use o `pg_restore` da mesma major do banco (17).
4. Restaure num projeto Supabase **novo e vazio** (as extensões `pgmq`, `pg_cron`, `pg_net`, `vector`, `unaccent` precisam estar habilitadas antes):
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -d "$SUPABASE_DB_URL_DESTINO" citynews.dump
   ```
   O dump cobre os schemas `public`, `auth` e `storage` (dados de usuários incluídos; por isso o arquivo é cifrado).
5. Reaplique o que não está no dump: migrations pendentes posteriores ao backup (`supabase db push`), agendamento (`select schedule_pipeline_cron();`) e o segredo do cron no Vault.
6. Aponte a aplicação: variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` na Vercel e faça um novo deploy.
7. Objetos de Storage (imagens) não vêm no `pg_dump`; as cópias voltam a ser geradas ou reprocessadas pelo pipeline, e as políticas de imagem seguem valendo.

## Como verificar

- `select count(*) from articles where status in ('published','updated');` compatível com o esperado.
- `select max(started_at) from ingest_runs;`: o último ciclo antes do incidente.
- `select key, enabled from feature_flags;`: confira `read_only` e `auto_publish` (o dump traz o estado da hora do backup; ajuste em **Contingência**).
- Portal: home, uma matéria, `/pergunte` e a busca. Estúdio: login de admin e fila.
- Pergunte-se o que se perdeu: tudo depois do horário do backup (até 24 h no pior caso). Leia `audit_log` e os e-mails de notificação para reconstruir decisões humanas.

## Depois

1. Reative o agendamento e o `cron-watchdog`; rode **Executar agora** (Control Center) e acompanhe um ciclo.
2. Desative o modo leitura; retome a publicação automática só depois de conferir uma ou duas decisões.
3. Registre o incidente e o tempo de recuperação em `.planning/BLOCKERS.md` ou na ata do plantão.

## Teste mensal

Uma vez por mês, faça os passos 1 a 3 e a restauração em um projeto de teste (nunca no de produção), confira as contagens acima e descarte o projeto. Registre a data e o resultado.

## Como reverter

A restauração num projeto novo não altera o atual: para voltar atrás, aponte de novo as variáveis para o projeto anterior. Restaurar **sobre** o projeto atual (`--clean`) é destrutivo; só com o modo leitura ligado e um dump novo tirado antes (`workflow_dispatch`).
