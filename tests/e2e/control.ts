import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db/types";
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
  /** Teste A/B de pesos (P5-T7) entre rec-v1 e uma versão aprovada própria, com eventos rotulados. */
  experimentId: string;
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

  // P5-T7: versão de pesos aprovada (inativa), teste A/B entre ela e rec-v1, e eventos com o
  // rótulo de cada variante para as métricas do O18 (anon_id próprio, apagado no cleanup).
  const weightsVersion = `rec-e2e-${mark}`;
  check(
    await db.from("rec_weights").insert({
      version: weightsVersion,
      weights: {
        popularity: 0.3,
        individual: 0.25,
        recency: 0.15,
        engagement: 0.1,
        operational: 0.1,
        diversity: 0.1,
      },
      proposed_by: "c1000000-0000-4000-8000-000000000007",
      approved_by: "c1000000-0000-4000-8000-000000000001",
    }),
  );
  const exp = must(
    await db
      .from("rec_experiments")
      .insert({
        name: `Teste ${mark}`,
        variants: [
          { name: "controle", weightsVersion: "rec-v1" },
          { name: "variante-1", weightsVersion },
        ],
        split: [50, 50],
        created_by: "c1000000-0000-4000-8000-000000000007",
      })
      .select("id")
      .single(),
  );
  const expKey = exp.id.replace(/-/g, "").slice(0, 8);
  const anonId = randomUUID();
  const event = (
    algo: string,
    name: string,
    props: Record<string, string | number | boolean>,
    slug: string | null,
  ): Database["public"]["Tables"]["events"]["Insert"] => ({
    name,
    anon_id: anonId,
    at: new Date().toISOString(),
    source_slug: slug,
    session: { id: mark, page: "/fontes", referrer: null, device: "desktop" },
    consent: { version: 1, metrics: true, personalization: true },
    algo_version: algo,
    props,
  });
  const v0 = `rec-v1+${expKey}:0`;
  const v1 = `rec-v1+${expKey}:1`;
  check(
    await db
      .from("events")
      .insert([
        ...Array.from({ length: 10 }, () =>
          event(v0, "source_viewed", { surface: "fontes" }, null),
        ),
        ...Array.from({ length: 10 }, () =>
          event(v1, "source_viewed", { surface: "fontes" }, null),
        ),
        event(
          v0,
          "recommendation_clicked",
          { list: "recommended", reason: "local_popular", position: 1 },
          "folha-do-cerrado",
        ),
        event(
          v1,
          "recommendation_clicked",
          { list: "recommended", reason: "diversity", position: 2 },
          "mt-agora",
        ),
        event(
          v1,
          "recommendation_clicked",
          { list: "popular", reason: "regional_popular", position: 1 },
          "diario-da-baixada",
        ),
        event(
          v1,
          "recommendation_dismissed",
          { list: "recommended", reason: "diversity", dismissReason: "already_know" },
          "mt-agora",
        ),
      ]),
  );

  return {
    mark,
    failing,
    healthy,
    runId,
    quarantineId: q.id,
    itemRef: `item:${itemId}`,
    eventMessage,
    experimentId: exp.id,
    async cleanup() {
      await db.from("events").delete().eq("anon_id", anonId);
      await db.from("rec_experiments").delete().eq("id", exp.id);
      await db.from("rec_weights").delete().eq("version", weightsVersion);
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
