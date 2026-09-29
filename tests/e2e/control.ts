import { randomUUID } from "node:crypto";
import { service, tag } from "./studio";

/*
 * Dados próprios dos testes do Control Center (P5-T3): uma fonte pausada automaticamente (o estado
 * que `afterFetch` grava na 3ª falha seguida, R8), uma fonte ativa, um ciclo com eventos por etapa
 * e uma falha em quarentena.
 * Cada chamada usa um marcador único (desktop e mobile rodam em paralelo) e `cleanup` apaga tudo.
 */
export interface ControlFixture {
  mark: string;
  failing: { id: string; slug: string; name: string };
  healthy: { id: string; slug: string; name: string };
  runId: string;
  quarantineId: number;
  itemRef: string;
  eventMessage: string;
  cleanup: () => Promise<void>;
}

function check(r: { error: { message: string } | null }): void {
  if (r.error) throw new Error(r.error.message);
}

function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("sem retorno");
  return r.data;
}

export async function controlFixture(): Promise<ControlFixture> {
  const db = service();
  const mark = tag();
  const source = async (suffix: string, label: string) => {
    const slug = `e2e-ctl-${suffix}-${mark}`;
    const name = `${label} ${mark}`;
    const row = must(
      await db
        .from("sources")
        .insert({
          slug,
          name,
          base_url: `https://${slug}.example`,
          kind: "rss",
          feed_url: `https://${slug}.example/feed`,
          locality: "cuiaba",
          status: "active",
          // Retomar (paused → active) exige termos revisados (painel, 0011).
          terms_reviewed_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );
    return { id: row.id, slug, name };
  };
  const failing = await source("falha", "Fonte instável");
  const healthy = await source("ok", "Fonte estável");

  const failMessage = `HTTP 503 em https://${failing.slug}.example/feed`;
  for (let i = 0; i < 3; i++)
    check(
      await db.from("pipeline_events").insert({
        step: "fetch",
        item_ref: `source:${failing.slug}`,
        level: "error",
        message: failMessage,
        details: { attempt: i + 1 },
      }),
    );
  // Pausa automática do painel de fontes (D-F18): `status`, `status_reason` e contagem na linha.
  check(
    await db
      .from("sources")
      .update({
        status: "paused",
        status_reason: "auto_failures",
        consecutive_failures: 3,
        last_error: failMessage,
      })
      .eq("id", failing.id),
  );

  const runId = randomUUID();
  const itemId = randomUUID();
  const t0 = Date.now() - 20 * 60_000;
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  check(
    await db.from("ingest_runs").insert({
      id: runId,
      // Janela única fora do relógio real (não disputa o tick de outros testes).
      window_start: new Date(
        Date.UTC(2003, 0, 1) + Math.floor(Math.random() * 1e9) * 1000,
      ).toISOString(),
      started_at: at(0),
      stats: { fetch_enqueued: 2 },
    }),
  );
  const eventMessage = `evento de teste ${mark}`;
  const steps: [string, number, "info" | "warn" | "error"][] = [
    ["fetch", 0.5, "info"],
    ["validate", 1, "info"],
    ["extract", 1.5, "info"],
    ["normalize", 2, "info"],
    ["dedupe", 3, "info"],
    ["classify", 4, "warn"],
    ["classify", 6, "error"],
    ["verify", 8, "info"],
    ["summarize", 10, "info"],
  ];
  check(
    await db.from("pipeline_events").insert(
      steps.map(([step, min, level]) => ({
        at: at(min),
        run_id: runId,
        step,
        item_ref: `item:${itemId}`,
        level,
        message: level === "info" ? eventMessage : `falha de teste ${mark} em 198.51.100.7`,
        details: { attempt: 1 },
      })),
    ),
  );
  const q = must(
    await db
      .from("pipeline_quarantine")
      .insert({
        queue: "pipeline",
        msg_id: Math.floor(Math.random() * 1e9),
        dedupe_key: `classify:item:${itemId}`,
        message: { runId, step: "classify", itemRef: `item:${itemId}`, attempt: 4 },
        read_ct: 4,
        error: `transient: tempo esgotado ${mark}`,
      })
      .select("id")
      .single(),
  );

  return {
    mark,
    failing,
    healthy,
    runId,
    quarantineId: q.id,
    itemRef: `item:${itemId}`,
    eventMessage,
    async cleanup() {
      const runs = must(
        await db.from("ingest_runs").select("id").contains("stats", { source: healthy.id }),
      ).map((r) => r.id);
      await db.from("jobs").delete().like("dedupe_key", `%${itemId}%`);
      // Inclui a coleta manual (`fetch:source:<slug>:manual:<runId>`): job órfão de um run
      // apagado faria o drain de outro teste falhar na FK de `pipeline_events.run_id`.
      await db.from("jobs").delete().like("dedupe_key", `%e2e-ctl-%-${mark}%`);
      await db.from("pipeline_quarantine").delete().eq("id", q.id);
      await db.rpc("purge_pipeline_events", {
        p_run_ids: [runId, ...runs],
        p_item_refs: [`source:e2e-ctl-%-${mark}`, `item:${itemId}`],
      });
      await db.from("notifications").delete().like("object_ref", `source:e2e-ctl-%-${mark}`);
      await db
        .from("ingest_runs")
        .delete()
        .in("id", [runId, ...runs]);
      await db.from("sources").delete().in("id", [failing.id, healthy.id]);
    },
  };
}
