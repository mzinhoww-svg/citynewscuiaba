# Coletor de eventos da Agenda (AGE-T1, R37)

A Agenda da home e de `/agenda` nunca fica vazia: um coletor lê eventos de Cuiabá e Várzea Grande
na internet, aprova pelas checagens e publica; se ainda houver poucos eventos próximos, a tela
mostra "Datas e eventos recorrentes de Cuiabá".

## Fluxo

`src/lib/agenda/collect.ts`, por fonte ativa de `sources.ts`:

1. `robots.txt` da origem (token `CityNewsBot`); bloqueado ou indisponível, a fonte é pulada.
2. Baixa a página/feed (limite de 60 pedidos por hora por fonte, SSRF bloqueado).
3. Extrai (`extract/`): `jsonld` (schema.org `Event` e subtipos, `ItemList`, `@graph`), `ical`
   (VEVENT), `rss` (data de evento no texto da chamada, nunca a data de publicação) e `sympla`
   (lista embutida da página de busca).
4. Normaliza (`normalize.ts`): título limpo por `sanitizeExternalText`, data/hora em
   America/Cuiabá, local, bairro da lista curada, preço (ou "não informado"), categoria, link do
   original e **descrição própria de até 2 frases** (nenhum texto da fonte é copiado).
5. Aprova (`approve.ts`): data futura (até 1 ano), local conhecido, sem palavrão, link `https`
   sem encurtador/IP/credenciais. Fora de Cuiabá/VG, online, sem horário ou sem link: recusado.
6. Remove repetidos (`dedupe.ts`): título + dia + local, dentro da coleta e contra eventos já no
   ar sem origem de coleta.
7. Grava (`src/lib/db/agenda-store.ts`) em `event_listings` por `dedupe_key` (idempotente),
   com `confirmed_at` (aprovação automática), `source_url`, `source_id`, `age_rating = 'consulte'`
   e `price_unknown` quando a fonte não informa o preço (nunca vira "Gratuito").

## Execução

- Rota `POST /api/ingest/agenda` (`Authorization: Bearer ${CRON_SECRET}`); `?dry=1` ensaia,
  `?force=1` ignora o intervalo mínimo de 5 h.
- Agenda: `pg_cron` a cada 6 h (migration 0053, mesmo molde do tick: precisa de pg_cron, pg_net e
  dos segredos `app_url`/`cron_secret` no Vault) e o watchdog do GitHub (a cada 15 min, a rota
  se limita sozinha).
- Manual em produção: `scripts/ops/collect-agenda.ts` (veja o cabeçalho do arquivo).

```bash
APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... node --no-warnings scripts/ops/collect-agenda.ts --dry
APP_URL=... CRON_SECRET=... node --no-warnings scripts/ops/collect-agenda.ts --force
```

## Fontes

`src/lib/agenda/sources.ts`. Hoje: Sympla (Cuiabá, páginas 1 e 2; Várzea Grande), com `robots.txt`
liberando a busca. Para incluir outra: confira robots e termos, anote em `note`, escolha o `kind`
(`jsonld`, `ical`, `rss`) e informe `origin` (`official` para órgãos públicos). Prefeitura de
Cuiabá e Secretaria de Cultura do Estado não publicam feed, iCal nem dados estruturados de
eventos hoje (verificado em 2026-10-03), e o `robots.txt` da prefeitura bloqueia vários robôs:
entram assim que houver um formato estável. Eventbrite foi descartado: a listagem por cidade
traz eventos de outras cidades/online e só a data, sem horário.

Em teste e no e2e (`CRAWLER_FIXTURES=1`), `FIXTURE_AGENDA_SOURCES` usa só sites fictícios
`*.example` (`tests/fixtures`).

## Datas recorrentes (fallback)

`src/lib/agenda/recurring.ts`: só datas com fonte verificável (feriados nacionais pela legislação,
aniversário de Cuiabá em 8 de abril, Festa de São Benedito na primeira semana de julho). O Festival
de Pesca não entra: as edições variam de data e cidade e não há fonte fixa para Cuiabá.
Aparece na home quando há menos de 3 eventos nos próximos 14 dias e em `/agenda` (sem filtros) pelo
mesmo critério.
