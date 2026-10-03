/**
 * Coleta de eventos da Agenda sob demanda (AGE-T1, R37). Chama a rota autenticada do portal:
 * `POST ${APP_URL}/api/ingest/agenda`, que lê as fontes de `src/lib/agenda/sources.ts` (robots.txt
 * respeitado), aprova pelas checagens e grava em `event_listings`.
 *
 * Uso (Node 22.18 ou mais novo, sem dependências):
 *
 *   APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... \
 *     node --no-warnings scripts/ops/collect-agenda.ts --dry     # ensaio: lista o que seria gravado
 *
 *   APP_URL=... CRON_SECRET=... node --no-warnings scripts/ops/collect-agenda.ts --force
 *                                                  # grava agora (ignora o intervalo de 5 h)
 *
 * Sem opção, grava respeitando o intervalo mínimo (se houve coleta há menos de 5 h, responde
 * "skipped"). Local: `APP_URL=http://localhost:3000` com CRON_SECRET do `.env.local`. O segredo
 * só vem do ambiente; nunca o coloque em arquivo versionado.
 *
 * Saída: um resumo por fonte (encontrados, aprovados, motivos de recusa) e os totais. Código de
 * saída 1 se a chamada falhar ou se nenhuma fonte responder.
 */
export {};

const base = process.env.APP_URL?.replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!base || !secret) {
  console.error("Defina APP_URL e CRON_SECRET no ambiente.");
  process.exit(1);
}
const args = new Set(process.argv.slice(2));
const query = args.has("--dry") ? "?dry=1" : args.has("--force") ? "?force=1" : "";

interface SourceReport {
  id: string;
  name: string;
  status: string;
  detail?: string;
  found: number;
  approved: number;
  rejected: Record<string, number>;
}
interface Report {
  status: string;
  reason?: string;
  sources?: SourceReport[];
  found?: number;
  approved?: number;
  duplicates?: number;
  saved?: number;
  dryRun?: boolean;
  preview?: { title: string; startsAt: string; venue: string; sourceUrl: string }[];
}

const res = await fetch(`${base}/api/ingest/agenda${query}`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(90_000),
});
if (!res.ok) {
  console.error(`Falhou: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const r = (await res.json()) as Report;
if (r.status === "skipped") {
  console.log(`Ignorado (${r.reason}): use --force para coletar agora.`);
  process.exit(0);
}
for (const s of r.sources ?? []) {
  const why = Object.entries(s.rejected)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");
  console.log(
    `${s.status.padEnd(12)} ${s.name}: ${s.found} encontrados, ${s.approved} aprovados${why ? ` (recusados: ${why})` : ""}${s.detail ? ` [${s.detail}]` : ""}`,
  );
}
console.log(
  `Total: ${r.found} encontrados, ${r.approved} aprovados, ${r.duplicates} repetidos, ${r.saved} gravados${r.dryRun ? " (ensaio)" : ""}.`,
);
for (const e of r.preview ?? []) console.log(`  ${e.startsAt}  ${e.title} · ${e.venue}  ${e.sourceUrl}`);
const alive = (r.sources ?? []).some((s) => s.status === "ok");
process.exit(alive ? 0 : 1);
