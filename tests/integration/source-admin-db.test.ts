// @vitest-environment node
// Migration 0011 (Painel de Fontes): regras impostas no banco — duas pessoas, via rápida, versão
// otimista, auditoria e runs `cron`/`manual`/`fast` (spec docs/superpowers/specs/2026-09-27-painel-de-fontes.md).
// Pilha local sem Docker (A-017): usuários e fontes do seed, sem rede.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "c1000000-0000-4000-8000-000000000001"; // admin
const MARINA = "c1000000-0000-4000-8000-000000000002"; // editor_chefe
const DIEGO = "c1000000-0000-4000-8000-000000000007"; // operador_ia

// Marca o início da suíte: filtra o `audit_log` que o próprio seed já grava (layer/editorial_score
// e a pausa manual da Rádio Pantanal), para os testes só verem o que eles mesmos produzem.
const testStart = new Date().toISOString();

const asService = createServiceClient();

const sessions = new Map<string, Promise<DbClient>>();
function as(email: string): Promise<DbClient> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ready = client.auth.signInWithPassword({ email, password: SEED_PASSWORD }).then((r) => {
    if (r.error) throw r.error;
    return client;
  });
  sessions.set(email, ready);
  return ready;
}
const helena = () => as("helena.costa@citynews.local");
const marina = () => as("marina.arruda@citynews.local");
const diego = () => as("diego.prado@citynews.local");
const thiago = () => as("thiago.moraes@citynews.local"); // analista, sem source.manage

/** R1: converte `{ error }` do supabase-js em exceção, para `rejects.toThrow()` funcionar. */
async function rpc(name: string, args?: Record<string, unknown>) {
  const r = await asService.rpc(name as never, args as never);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function rpcAs(client: Promise<DbClient>, name: string, args?: Record<string, unknown>) {
  const c = await client;
  const r = await c.rpc(name as never, args as never);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

async function sourceBySlug(slug: string) {
  const r = await asService.from("sources").select("*").eq("slug", slug).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function approval(id: string) {
  const r = await asService.from("approvals").select("*").eq("id", id).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function auditFor(objectRef: string) {
  const r = await asService
    .from("audit_log")
    .select("*")
    .eq("object_ref", objectRef)
    .gt("at", testStart)
    .order("id");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function countRuns(opts: { trigger: string; window?: string }) {
  let q = asService
    .from("ingest_runs")
    .select("*", { count: "exact", head: true })
    .eq("trigger", opts.trigger);
  if (opts.window) q = q.eq("window_start", opts.window);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

// ---------------------------------------------------------------------------
// Snapshot/restauração das fontes de seed tocadas pelos testes (o banco é compartilhado com o
// resto da suíte de integração; nada aqui deve vazar para os outros arquivos, A-017).
// ---------------------------------------------------------------------------
const TOUCHED_SLUGS = [
  "folha-do-cerrado",
  "mt-agora",
  "radio-pantanal",
  "portal-varzea",
  "correio-mato-grossense",
  "diario-da-baixada",
] as const;
const snapshots = new Map<string, Record<string, unknown>>();
const createdSourceIds: string[] = [];
const createdApprovalIds: string[] = [];

beforeAll(async () => {
  for (const slug of TOUCHED_SLUGS) {
    const row = await sourceBySlug(slug);
    snapshots.set(slug, row as unknown as Record<string, unknown>);
  }
});

afterAll(async () => {
  for (const [slug, row] of snapshots) {
    const rest = { ...row };
    delete rest.id;
    delete rest.created_at;
    delete rest.slug;
    const r = await asService
      .from("sources")
      .update(rest as Record<string, never>)
      .eq("id", row.id as string);
    if (r.error) throw new Error(`restaurar ${slug}: ${r.error.message}`);
  }
  await asService.rpc("app_setting_set", {
    p_key: "sources.fast_lane_max",
    p_value: 10,
    p_ctx: {},
  });
  await asService.rpc("app_setting_set", {
    p_key: "sources.default_frequency_minutes",
    p_value: 30,
    p_ctx: {},
  });
  if (createdApprovalIds.length)
    await asService.from("approvals").delete().in("id", createdApprovalIds);
  if (createdSourceIds.length) await asService.from("sources").delete().in("id", createdSourceIds);
});

describe("frequência: grade com via rápida (D-F14, Review Focus 4)", () => {
  it("fora da grade é recusada pelo banco; 10, 15 e 20 passam", async () => {
    for (const v of [5, 25, 45, 1470]) {
      await expect(
        asService
          .from("sources")
          .update({ frequency_minutes: v })
          .eq("slug", "folha-do-cerrado")
          .then(throwOnError),
      ).rejects.toThrow(/sources_frequency_minutes_check|check/i);
    }
    for (const v of [10, 15, 20, 60, null]) {
      await expect(
        asService
          .from("sources")
          .update({ frequency_minutes: v })
          .eq("slug", "folha-do-cerrado")
          .then(throwOnError),
      ).resolves.toBeTruthy();
    }
  });
});

describe("via rápida: uma pessoa, com travas no banco (D-F28, D-F29, Review Focus 6)", () => {
  it("só fonte ativa e com vaga", async () => {
    await rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 1, p_ctx: {} });

    const folha = await sourceBySlug("folha-do-cerrado"); // active
    await rpcAs(helena(), "source_admin_update", {
      p_id: folha.id,
      p_version: folha.version,
      p_patch: { frequency_minutes: 10 },
      p_ctx: {},
    });

    const mt = await sourceBySlug("mt-agora"); // active
    await expect(
      rpcAs(helena(), "source_admin_update", {
        p_id: mt.id,
        p_version: mt.version,
        p_patch: { frequency_minutes: 15 },
        p_ctx: {},
      }),
    ).rejects.toThrow(/via rápida está cheia/);

    const pausada = await sourceBySlug("radio-pantanal"); // paused (seed FS-T1)
    await expect(
      rpcAs(helena(), "source_admin_update", {
        p_id: pausada.id,
        p_version: pausada.version,
        p_patch: { frequency_minutes: 10 },
        p_ctx: {},
      }),
    ).rejects.toThrow(/Ative a fonte/);

    // Trocar entre 10, 15 e 20 na mesma fonte não ocupa vaga nova.
    const f2 = await sourceBySlug("folha-do-cerrado");
    expect(f2.frequency_minutes).toBe(10);
    await rpcAs(helena(), "source_admin_update", {
      p_id: f2.id,
      p_version: f2.version,
      p_patch: { frequency_minutes: 20 },
      p_ctx: {},
    });
    expect((await sourceBySlug("folha-do-cerrado")).frequency_minutes).toBe(20);

    // O padrão global só aceita a grade do ciclo normal (30 a 1440).
    await expect(
      rpc("app_setting_set", {
        p_key: "sources.default_frequency_minutes",
        p_value: 10,
        p_ctx: {},
      }),
    ).rejects.toThrow();
  });
});

describe("claim_source_fetch: uma coleta por janela (D-F29, Review Focus 6)", () => {
  it("retentativa do mesmo run passa; run diferente na mesma janela não", async () => {
    const id = (await sourceBySlug("folha-do-cerrado")).id;
    const cronRun = randomUUID();
    const fastRun = randomUUID();
    // Início da janela atual de 10 min (em vez de uma data fixa no passado): testa a semântica
    // "já coletou nesta janela", não só "já coletou algum dia".
    const since = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();

    expect(await rpc("claim_source_fetch", { p_source: id, p_run: cronRun, p_since: since })).toBe(
      true,
    );
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: fastRun, p_since: since })).toBe(
      false,
    );
    expect(await rpc("claim_source_fetch", { p_source: id, p_run: cronRun, p_since: since })).toBe(
      true,
    );
  });

  it("não altera a versão otimista (Finding 2): claim é bookkeeping operacional", async () => {
    const before = await sourceBySlug("folha-do-cerrado");
    await rpc("claim_source_fetch", {
      p_source: before.id,
      p_run: randomUUID(),
      p_since: new Date(Date.now() - 60_000).toISOString(),
    });
    expect((await sourceBySlug("folha-do-cerrado")).version).toBe(before.version);
  });
});

describe("criação de fonte: duas pessoas vale desde o create (Finding 1, Review Focus 2)", () => {
  it("Diego não cria fonte já com os quatro campos críticos afrouxados", async () => {
    await expect(
      rpcAs(diego(), "source_admin_create", {
        p: {
          slug: `fonte-critica-${randomUUID().slice(0, 8)}`,
          name: "Fonte crítica",
          baseUrl: "https://fonte-critica.example",
          kind: "rss",
          locality: "cuiaba",
          imagePolicy: "reproduction",
          reliability: "primary",
          mayBeSoleSource: true,
          republishPolicy: "summary_2_sentences",
        },
        p_ctx: {},
      }),
    ).rejects.toThrow(/aprovação/);
  });

  it("SQL direto com campo crítico afrouxado no insert também é recusado", async () => {
    const d = await diego();
    await expect(
      d
        .from("sources")
        .insert({
          slug: `fonte-critica-sql-${randomUUID().slice(0, 8)}`,
          name: "Fonte crítica SQL",
          base_url: "https://fonte-critica-sql.example",
          kind: "rss",
          locality: "cuiaba",
          reliability: "primary",
        })
        .then(throwOnError),
    ).rejects.toThrow(/aprovação/);
  });

  it("criação com o padrão restrito funciona (paused, pending_activation)", async () => {
    const id = (await rpcAs(diego(), "source_admin_create", {
      p: {
        slug: `fonte-ok-${randomUUID().slice(0, 8)}`,
        name: "Fonte OK",
        baseUrl: "https://fonte-ok.example",
        kind: "rss",
        locality: "cuiaba",
      },
      p_ctx: {},
    })) as string;
    createdSourceIds.push(id);
    const row = await asService.from("sources").select("*").eq("id", id).single();
    expect(row.data).toMatchObject({
      status: "paused",
      status_reason: "pending_activation",
      image_policy: "none",
      republish_policy: "link_only",
      reliability: "standard",
      may_be_sole_source: false,
      version: 1,
    });
  });
});

describe("versão só sobe com mudança de conteúdo (Finding 2, D-F23)", () => {
  it("bookkeeping de coleta (last_fetched_at, etag, consecutive_failures) não bumpa a versão", async () => {
    const before = await sourceBySlug("folha-do-cerrado");
    await asService
      .from("sources")
      .update({
        last_fetched_at: new Date().toISOString(),
        etag: "etag-teste",
        last_modified: "seg, 27 set 2026 10:00:00 GMT",
        last_error: "erro transitório",
        consecutive_failures: 1,
      })
      .eq("id", before.id);
    expect((await sourceBySlug("folha-do-cerrado")).version).toBe(before.version);
  });

  it("mudar um campo de configuração bumpa a versão em 1", async () => {
    const before = await sourceBySlug("mt-agora");
    await rpcAs(helena(), "source_admin_update", {
      p_id: before.id,
      p_version: before.version,
      p_patch: { priority: before.priority === 1 ? 2 : 1 },
      p_ctx: {},
    });
    expect((await sourceBySlug("mt-agora")).version).toBe(before.version + 1);
  });
});

describe("app_settings e source_discoveries: escrita só por RPC (Finding 3)", () => {
  it("update direto em app_settings é recusado; app_setting_set como pessoa logada funciona e audita com ip_hash", async () => {
    const h = await helena();
    await expect(
      h
        .from("app_settings")
        .update({ value: 20 })
        .eq("key", "sources.fast_lane_max")
        .then(throwOnError),
    ).rejects.toThrow(/permission denied/);

    await rpcAs(helena(), "app_setting_set", {
      p_key: "sources.fast_lane_max",
      p_value: 7,
      p_ctx: { reason: "ajuste de teste" },
      p_ip_hash: "ip-hash-settings-teste",
    });
    const setting = await asService
      .from("app_settings")
      .select("value")
      .eq("key", "sources.fast_lane_max")
      .single();
    expect(setting.data?.value).toBe(7);

    const rows = await asService
      .from("audit_log")
      .select("*")
      .eq("action", "settings.update")
      .eq("object_ref", "setting:sources.fast_lane_max")
      .gt("at", testStart)
      .order("id", { ascending: false })
      .limit(1);
    expect(rows.data?.[0]).toMatchObject({ ip_hash: "ip-hash-settings-teste" });
    expect(rows.data?.[0]?.details).toMatchObject({ reason: "ajuste de teste" });

    await rpcAs(helena(), "app_setting_set", {
      p_key: "sources.fast_lane_max",
      p_value: 10,
      p_ctx: {},
    });
  });

  it("analista sem source.manage: app_setting_set recusa com mensagem própria", async () => {
    await expect(
      rpcAs(thiago(), "app_setting_set", {
        p_key: "sources.fast_lane_max",
        p_value: 5,
        p_ctx: {},
      }),
    ).rejects.toThrow(/sem permissão/);
  });

  it("insert direto em source_discoveries é recusado; source_discovery_save funciona", async () => {
    const h = await helena();
    await expect(
      h
        .from("source_discoveries")
        .insert({ input_url: "https://teste.example", created_by: HELENA })
        .then(throwOnError),
    ).rejects.toThrow(/permission denied/);

    const id = (await rpcAs(helena(), "source_discovery_save", {
      p: { inputUrl: "https://teste.example/secao" },
      p_ctx: {},
    })) as string;
    expect(id).toBeTruthy();
    await asService.from("source_discoveries").delete().eq("id", id);
  });
});

describe("erro de permissão é distinto de conflito de versão (achado da revisão)", () => {
  it("analista sem source.manage recebe mensagem própria em source_admin_update", async () => {
    const s = await sourceBySlug("mt-agora");
    await expect(
      rpcAs(thiago(), "source_admin_update", {
        p_id: s.id,
        p_version: s.version,
        p_patch: { priority: 1 },
        p_ctx: {},
      }),
    ).rejects.toThrow(/sem permissão/);
  });

  it("chave desconhecida no patch é um erro, não ignorada em silêncio (camelCase não é mais aceito)", async () => {
    const s = await sourceBySlug("mt-agora");
    await expect(
      rpcAs(helena(), "source_admin_update", {
        p_id: s.id,
        p_version: s.version,
        p_patch: { rateLimitPerHour: 10 },
        p_ctx: {},
      }),
    ).rejects.toThrow(/campo desconhecido/);
  });
});

describe("arquivar via SQL direto libera a vaga da via rápida (Finding 4, §7.8.2)", () => {
  it("archived_at setado direto zera frequency_minutes < 30", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-rapida-${randomUUID().slice(0, 8)}`,
        name: "Fonte rápida de teste",
        base_url: "https://fonte-rapida.example",
        kind: "rss",
        locality: "cuiaba",
        status: "paused",
        frequency_minutes: 10,
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    createdSourceIds.push(id);
    expect(created.data!.frequency_minutes).toBe(10);

    const archived = await asService
      .from("sources")
      .update({ archived_at: new Date().toISOString(), archive_reason: "teste" })
      .eq("id", id)
      .select()
      .single();
    expect(archived.error).toBeNull();
    expect(archived.data!.frequency_minutes).toBeNull();
  });
});

describe("transições de status inválidas são recusadas no trigger (Finding 5, §6.4)", () => {
  it("blocked → active direto é recusado (só blocked → paused, via desbloquear)", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-bloqueada-${randomUUID().slice(0, 8)}`,
        name: "Fonte bloqueada de teste",
        base_url: "https://fonte-bloqueada.example",
        kind: "rss",
        locality: "cuiaba",
        status: "blocked",
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    createdSourceIds.push(id);

    await expect(
      asService.from("sources").update({ status: "active" }).eq("id", id).then(throwOnError),
    ).rejects.toThrow(/transição de status/);
  });

  it("ativar (paused → active) exige termos revisados; 'activate' é sinônimo de 'resume'", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-sem-termos-${randomUUID().slice(0, 8)}`,
        name: "Fonte sem termos",
        base_url: "https://fonte-sem-termos.example",
        kind: "rss",
        locality: "cuiaba",
        status: "paused",
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    const slug = created.data!.slug;
    createdSourceIds.push(id);

    await expect(
      rpc("source_admin_status", {
        p_id: id,
        p_version: created.data!.version,
        p_action: "resume",
        p_ctx: {},
      }),
    ).rejects.toThrow(/termos/);

    await asService
      .from("sources")
      .update({ terms_reviewed_at: new Date().toISOString() })
      .eq("id", id);
    const withTerms = await sourceBySlug(slug);
    await rpc("source_admin_status", {
      p_id: id,
      p_version: withTerms.version,
      p_action: "activate",
      p_ctx: {},
    });
    expect((await sourceBySlug(slug)).status).toBe("active");
  });
});

describe("ciclo de vida completo: bulk, pause/resume/block/unblock/restore", () => {
  it("pausa em lote, retoma, bloqueia e desbloqueia (crítico) uma fonte de teste", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-ciclo-${randomUUID().slice(0, 8)}`,
        name: "Fonte do ciclo de vida",
        base_url: "https://fonte-ciclo.example",
        kind: "rss",
        locality: "cuiaba",
        status: "active",
        terms_reviewed_at: new Date().toISOString(),
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    const slug = created.data!.slug;
    createdSourceIds.push(id);

    const bulkResult = await rpc("source_admin_bulk", {
      p_ids: [id],
      p_action: "pause",
      p_value: {},
      p_ctx: {},
    });
    expect(bulkResult).toEqual([{ id, ok: true }]);
    expect((await sourceBySlug(slug)).status).toBe("paused");

    const paused = await sourceBySlug(slug);
    await rpc("source_admin_status", {
      p_id: id,
      p_version: paused.version,
      p_action: "resume",
      p_ctx: {},
    });
    expect((await sourceBySlug(slug)).status).toBe("active");

    const active = await sourceBySlug(slug);
    await rpc("source_admin_status", {
      p_id: id,
      p_version: active.version,
      p_action: "block",
      p_reason: "quality",
      p_ctx: {},
    });
    const blocked = await sourceBySlug(slug);
    expect(blocked.status).toBe("blocked");

    await expect(
      rpcAs(helena(), "source_admin_status", {
        p_id: id,
        p_version: blocked.version,
        p_action: "unblock",
        p_ctx: {},
      }),
    ).rejects.toThrow(/aprovação/);

    const h = await helena();
    const approvalRow = await h
      .from("approvals")
      .insert({
        kind: "source.critical",
        target_ref: `source:${id}:status=paused`,
        requested_by: HELENA,
        justification: "Motivo resolvido com o veículo",
      })
      .select()
      .single();
    expect(approvalRow.error).toBeNull();
    createdApprovalIds.push(approvalRow.data!.id);
    const m = await marina();
    await m
      .from("approvals")
      .update({ status: "approved", approved_by: MARINA })
      .eq("id", approvalRow.data!.id);

    await rpcAs(helena(), "source_admin_status", {
      p_id: id,
      p_version: blocked.version,
      p_action: "unblock",
      p_ctx: {},
    });
    expect((await sourceBySlug(slug)).status).toBe("paused");
  });

  it("restaurar uma fonte arquivada volta para paused", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-restaurar-${randomUUID().slice(0, 8)}`,
        name: "Fonte a restaurar",
        base_url: "https://fonte-restaurar.example",
        kind: "rss",
        locality: "cuiaba",
        status: "paused",
        archived_at: new Date().toISOString(),
        archive_reason: "teste",
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    const slug = created.data!.slug;
    createdSourceIds.push(id);

    await rpc("source_admin_status", {
      p_id: id,
      p_version: created.data!.version,
      p_action: "restore",
      p_ctx: {},
    });
    const restored = await sourceBySlug(slug);
    expect(restored).toMatchObject({
      archived_at: null,
      status: "paused",
      status_reason: "manual",
    });
  });
});

describe("peek_rate_limit e record_source_fetch (só service_role)", () => {
  it("peek_rate_limit não consome cota e respeita o limite já usado", async () => {
    const bucket = `teste-fs-t1-${randomUUID().slice(0, 8)}`;
    const keyHash = "hash-teste";
    expect(
      await rpc("peek_rate_limit", {
        p_bucket: bucket,
        p_key_hash: keyHash,
        p_limit: 1,
        p_window_seconds: 60,
      }),
    ).toBe(true);
    await asService.rpc("hit_rate_limit", {
      p_bucket: bucket,
      p_key_hash: keyHash,
      p_limit: 1,
      p_window_seconds: 60,
    });
    expect(
      await rpc("peek_rate_limit", {
        p_bucket: bucket,
        p_key_hash: keyHash,
        p_limit: 1,
        p_window_seconds: 60,
      }),
    ).toBe(false);
    await asService.from("rate_limits").delete().eq("bucket", bucket);
  });

  it("record_source_fetch soma o dia de forma idempotente", async () => {
    const id = (await sourceBySlug("mt-agora")).id;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" }).format(new Date());
    await rpc("record_source_fetch", {
      p_source: id,
      p_outcome: "ok",
      p_latency_ms: 120,
      p_items_new: 2,
      p_error: null,
    });
    await rpc("record_source_fetch", {
      p_source: id,
      p_outcome: "failed",
      p_latency_ms: null,
      p_items_new: 0,
      p_error: "timeout",
    });
    const row = await asService
      .from("source_health_daily")
      .select("*")
      .eq("day", day)
      .eq("source_id", id)
      .single();
    expect(row.data).toMatchObject({
      fetch_ok: 1,
      fetch_failed: 1,
      items_new: 2,
      last_error: "timeout",
    });
    await asService.from("source_health_daily").delete().eq("day", day).eq("source_id", id);
  });
});

describe("mudança crítica: duas pessoas (D-F3 a D-F5, Review Focus 2)", () => {
  it("sem aprovação não muda, nem por SQL direto", async () => {
    const s = await sourceBySlug("portal-varzea"); // image_policy 'none' no seed
    await expect(
      rpcAs(diego(), "source_admin_update", {
        p_id: s.id,
        p_version: s.version,
        p_patch: { image_policy: "reproduction" },
        p_ctx: {},
      }),
    ).rejects.toThrow(/aprovação/);
    const d = await diego();
    await expect(
      d.from("sources").update({ image_policy: "reproduction" }).eq("id", s.id).then(throwOnError),
    ).rejects.toThrow(/aprovação/);
    expect((await sourceBySlug("portal-varzea")).image_policy).toBe("none");
  });

  it("aprovação de outra pessoa aplica e é consumida", async () => {
    const s = await sourceBySlug("portal-varzea");
    const d = await diego();
    const a = await d
      .from("approvals")
      .insert({
        kind: "source.critical",
        target_ref: `source:${s.id}:image_policy=reproduction`,
        requested_by: DIEGO,
        justification: "Acordo assinado em 20/09",
      })
      .select()
      .single();
    expect(a.error).toBeNull();
    createdApprovalIds.push(a.data!.id);

    // Diego é operador_ia: nem chega à regra "quem pede não decide" (guard_approvals) — a RLS de
    // approvals_decide (só admin/editor_chefe) já barra a linha antes, então a tentativa não
    // muda nada (nenhuma exceção: 0 linhas afetadas, comportamento de RLS em UPDATE).
    await d
      .from("approvals")
      .update({ status: "approved", approved_by: DIEGO })
      .eq("id", a.data!.id);
    expect(await approval(a.data!.id)).toMatchObject({ status: "pending", approved_by: null });

    const m = await marina();
    const decide = await m
      .from("approvals")
      .update({ status: "approved", approved_by: MARINA })
      .eq("id", a.data!.id)
      .select();
    expect(decide.error).toBeNull();

    await rpcAs(marina(), "source_admin_update", {
      p_id: s.id,
      p_version: s.version,
      p_patch: { image_policy: "reproduction" },
      p_ctx: { reason: "Acordo" },
    });
    expect((await sourceBySlug("portal-varzea")).image_policy).toBe("reproduction");
    expect((await approval(a.data!.id)).status).toBe("applied");
  });
});

describe("versão otimista (D-F23)", () => {
  it("versão desatualizada não sobrescreve", async () => {
    const s = await sourceBySlug("correio-mato-grossense");
    await rpcAs(helena(), "source_admin_update", {
      p_id: s.id,
      p_version: s.version,
      p_patch: { editorial_score: 4 },
      p_ctx: {},
    });
    await expect(
      rpcAs(diego(), "source_admin_update", {
        p_id: s.id,
        p_version: s.version, // mesma versão antiga: conflito
        p_patch: { editorial_score: 2 },
        p_ctx: {},
      }),
    ).rejects.toThrow(/conflito de versão/);
    expect((await sourceBySlug("correio-mato-grossense")).editorial_score).toBe(4);
  });
});

describe("auditoria: diff de configuração, sem campos operacionais (D-F22)", () => {
  it("registra o antes/depois do campo mudado e ignora last_fetched_at/etag", async () => {
    const before = await sourceBySlug("radio-pantanal");
    await rpcAs(helena(), "source_admin_update", {
      p_id: before.id,
      p_version: before.version,
      p_patch: { editorial_score: 5 },
      p_ctx: { reason: "Cobertura de serviços" },
    });
    await asService
      .from("sources")
      .update({ last_fetched_at: new Date().toISOString(), etag: "x" })
      .eq("id", before.id);

    const rows = await auditFor(`source:${before.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toMatchObject({
      changes: [{ field: "editorial_score", from: before.editorial_score, to: 5 }],
      reason: "Cobertura de serviços",
    });
  });
});

describe("ciclo de vida: arquivar e delete revogado (D-F19)", () => {
  it("arquivar só pausada ou bloqueada; delete revogado para authenticated", async () => {
    const s = await sourceBySlug("diario-da-baixada"); // active no seed
    await expect(
      rpcAs(helena(), "source_admin_status", {
        p_id: s.id,
        p_version: s.version,
        p_action: "archive",
        p_reason: "duplicada",
        p_ctx: {},
      }),
    ).rejects.toThrow(/pausada ou bloqueada/);

    const h = await helena();
    await expect(h.from("sources").delete().eq("id", s.id).then(throwOnError)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("fonte arquivada some de public_sources", async () => {
    const created = await asService
      .from("sources")
      .insert({
        slug: `fonte-teste-arquivar-${randomUUID().slice(0, 8)}`,
        name: "Fonte de teste (arquivar)",
        base_url: "https://fonte-teste.example",
        kind: "rss",
        locality: "cuiaba",
        status: "active",
      })
      .select()
      .single();
    expect(created.error).toBeNull();
    const id = created.data!.id;
    createdSourceIds.push(id);

    await rpc("source_admin_status", {
      p_id: id,
      p_version: created.data!.version,
      p_action: "pause",
      p_reason: "manual",
      p_ctx: {},
    });
    const paused = await sourceBySlug(created.data!.slug);
    await rpc("source_admin_status", {
      p_id: id,
      p_version: paused.version,
      p_action: "archive",
      p_reason: "teste",
      p_ctx: {},
    });

    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const visible = await anon.from("public_sources").select("id").eq("id", id).maybeSingle();
    expect(visible.data).toBeNull();
  });
});

describe("runs cron/manual/fast: índices únicos independentes (D-F21, D-F29, Review Focus 2 e 6)", () => {
  it("run manual não conflita com o run da janela; o tick duplo (cron e fast) continua único", async () => {
    const window = "2026-09-27T14:30:00Z";
    const manualBefore = await countRuns({ trigger: "manual" });
    await rpc("start_ingest_run", { p_window: window });
    await rpc("start_ingest_run", { p_window: window });
    const manualRun = (await rpc("start_manual_run", {
      p_source: (await sourceBySlug("folha-do-cerrado")).id,
    })) as { run_id: string }[];
    await rpc("start_fast_run", { p_window: window });
    await rpc("start_fast_run", { p_window: window });

    expect(await countRuns({ trigger: "cron", window })).toBe(1);
    expect(await countRuns({ trigger: "fast", window })).toBe(1);
    // Delta em vez de valor absoluto: o banco é compartilhado com o resto da suíte de integração.
    expect(await countRuns({ trigger: "manual" })).toBe(manualBefore + 1);

    await asService.from("ingest_runs").delete().eq("window_start", window);
    await asService.from("ingest_runs").delete().eq("id", manualRun[0]!.run_id);
  });
});

describe("ip_hash chega ao audit_log (Finding 6)", () => {
  it("source_admin_update grava ip_hash quando informado", async () => {
    const s = await sourceBySlug("mt-agora");
    await rpcAs(helena(), "source_admin_update", {
      p_id: s.id,
      p_version: s.version,
      p_patch: { priority: s.priority === 1 ? 2 : 1 },
      p_ctx: { reason: "teste ip_hash" },
      p_ip_hash: "ip-hash-fonte-teste",
    });
    const rows = await auditFor(`source:${s.id}`);
    expect(rows[rows.length - 1]).toMatchObject({ ip_hash: "ip-hash-fonte-teste" });
  });
});

describe("Fonte confiável (AUT-T2)", () => {
  it("source_admin_update salva trusted, bumpa a versão e audita", async () => {
    const before = await sourceBySlug("folha-do-cerrado");
    await rpcAs(helena(), "source_admin_update", {
      p_id: before.id,
      p_version: before.version,
      p_patch: { trusted: !before.trusted },
      p_ctx: { reason: "AUT-T2" },
    });
    const after = await sourceBySlug("folha-do-cerrado");
    expect(after.trusted).toBe(!before.trusted);
    expect(after.version).toBe(before.version + 1);
    const rows = await auditFor(`source:${before.id}`);
    expect(JSON.stringify(rows[rows.length - 1])).toContain("trusted");
    await rpcAs(helena(), "source_admin_update", {
      p_id: after.id,
      p_version: after.version,
      p_patch: { trusted: before.trusted },
      p_ctx: {},
    });
  });
});

describe("agendamento sem pg_net/Vault (pilha local, A-017)", () => {
  it("schedule_pipeline_cron não agenda nada e não derruba a migration", async () => {
    const r = await rpc("schedule_pipeline_cron");
    expect(r).toMatch(/nada agendado/);
  });
});

function throwOnError<T extends { error: { message: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}
