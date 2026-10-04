/**
 * Busca de logotipos das fontes sob demanda (LOGO-T1, R27). Chama a rota autenticada do portal,
 * em lotes, até não sobrar fonte na vez: `POST ${APP_URL}/api/ingest/source-logos?force=1&limit=N`.
 * A rota procura o logotipo no site oficial da fonte (apple-touch-icon, ícone, manifest, JSON-LD,
 * perfis oficiais), baixa, valida (PNG/WebP quadrado, até 200 KB, ≥ 96 px; converte ICO/JPEG),
 * grava no bucket `source-logos` e atualiza a fonte. Logotipo enviado por uma pessoa nunca é trocado.
 *
 * Uso (Node 22.18 ou mais novo, sem dependências):
 *
 *   APP_URL=https://citynewscuiaba.vercel.app CRON_SECRET=... \
 *     node --no-warnings scripts/ops/sync-source-logos.ts --dry     # ensaio: mostra o que seria gravado
 *
 *   APP_URL=... CRON_SECRET=... node --no-warnings scripts/ops/sync-source-logos.ts
 *   APP_URL=... CRON_SECRET=... node --no-warnings scripts/ops/sync-source-logos.ts --id <uuid-da-fonte>
 *
 * Opções: `--limit N` (fontes por chamada, 1 a 8, padrão 3), `--max-calls N` (padrão 60). O ensaio (`--dry`) percorre a fila inteira sem gravar.
 * O segredo só vem do ambiente; nunca o coloque em arquivo versionado.
 *
 * Saída: uma linha por fonte e, no fim, a lista de fontes sem logotipo possível (para o dono
 * enviar o arquivo pelo Painel de Fontes). Código de saída 1 se a chamada falhar.
 */
export {};

const base = process.env.APP_URL?.replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!base || !secret) {
  console.error("Defina APP_URL e CRON_SECRET no ambiente.");
  process.exit(1);
}
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dry = flag("--dry");
const id = value("--id");
const limit = value("--limit") ?? "3";
const maxCalls = Number(value("--max-calls") ?? "60");

interface Item {
  id: string;
  slug: string;
  name: string;
  outcome: "found" | "none" | "robots" | "unreachable" | "error" | "skipped_manual";
  origin?: string;
  kind?: string;
  detail?: string;
}
interface Reply {
  status: string;
  reason?: string;
  processed?: Item[];
  pending?: number;
}

let skip = 0;
const missing: Item[] = [];
const found: Item[] = [];
const seen = new Set<string>();

async function call(): Promise<Reply> {
  const qs = new URLSearchParams({ force: "1", limit });
  if (dry) qs.set("dry", "1");
  if (id) qs.set("id", id);
  if (dry && skip > 0) qs.set("skip", String(skip));
  const res = await fetch(`${base}/api/ingest/source-logos?${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`.trim());
  return (await res.json()) as Reply;
}

try {
  for (let n = 1; n <= maxCalls; n++) {
    const reply = await call();
    const items = reply.processed ?? [];
    for (const it of items) {
      const label =
        it.outcome === "found"
          ? `${it.kind} ${it.origin}`
          : [it.outcome, it.detail].filter(Boolean).join(" ");
      console.log(`${it.slug.padEnd(32)} ${it.outcome === "found" ? "OK " : "-- "}${label}`);
      if (it.outcome === "found") found.push(it);
      else if (it.outcome !== "skipped_manual") missing.push(it);
    }
    if (id) break;
    // Ensaio não registra tentativa: anda na fila com `skip` em vez de repetir as mesmas fontes.
    if (dry) {
      skip += items.length;
      if (items.length === 0 || (reply.pending ?? 0) === 0) break;
      continue;
    }
    const fresh = items.filter((it) => !seen.has(it.id));
    for (const it of items) seen.add(it.id);
    if (items.length === 0 || fresh.length === 0 || (reply.pending ?? 0) === 0) break;
    console.log(`… faltam ${reply.pending} na vez (chamada ${n})`);
  }
} catch (e) {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log(`\n${found.length} logotipo(s) ${dry ? "encontrado(s) no ensaio" : "gravado(s)"}.`);
if (missing.length > 0) {
  console.log(`${missing.length} fonte(s) sem logotipo possível (envie o arquivo pelo Painel):`);
  for (const it of missing) {
    console.log(`  - ${it.name} (${it.slug}): ${it.outcome}${it.detail ? ` · ${it.detail}` : ""}`);
  }
}
