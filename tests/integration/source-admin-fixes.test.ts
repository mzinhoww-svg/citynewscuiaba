// @vitest-environment node
// Painel de fontes, FS-T6 fix round 1 (revisão FS-T6): restringir campo crítico aplica na hora,
// URLs validadas na escrita, Crawl-delay só do servidor, falhas depois de gravar sempre relatadas,
// lote com batchId próprio, logo sem órfão, vínculo de descoberta validado, runs pulados pelo
// gatilho real e feed novo sem ETag antigo. Sessões reais do seed, como em source-admin.test.ts.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const state = vi.hoisted(() => ({
  client: null as unknown,
  failTakedown: false,
  failApprovalRequest: false,
  failAudit: false,
  storage: null as null | {
    uploads: string[];
    removed: string[];
    onUpload?: () => Promise<void>;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.40.50.60, 10.0.0.1" }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/client")>();
  return {
    ...actual,
    createServerClient: async () => {
      if (!state.client) throw new Error("sem sessão no teste");
      return state.client;
    },
    // Storage falso só quando o teste pede (a pilha local não tem Storage, A-017).
    createServiceClient: () => {
      const real = actual.createServiceClient();
      if (!state.storage) return real;
      const fake = state.storage;
      return new Proxy(real, {
        get(target, prop, receiver) {
          if (prop !== "storage") return Reflect.get(target, prop, receiver);
          return {
            from: () => ({
              upload: async (path: string) => {
                fake.uploads.push(path);
                await fake.onUpload?.();
                return { data: { path }, error: null };
              },
              remove: async (paths: string[]) => {
                fake.removed.push(...paths);
                return { data: [], error: null };
              },
            }),
          };
        },
      });
    },
  };
});
vi.mock("@/lib/media/takedown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/takedown")>();
  return {
    ...actual,
    takedownReproduction: async (...args: Parameters<typeof actual.takedownReproduction>) => {
      if (state.failTakedown) throw new Error("Storage fora do ar (simulado)");
      return actual.takedownReproduction(...args);
    },
  };
});
vi.mock("@/lib/approvals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/approvals")>();
  return {
    ...actual,
    createApprovals: (db: DbClient) => {
      const real = actual.createApprovals(db);
      return {
        ...real,
        requestApproval: async (input: Parameters<typeof real.requestApproval>[0]) => {
          if (state.failApprovalRequest) throw new Error("approvals: banco fora do ar (simulado)");
          return real.requestApproval(input);
        },
      };
    },
  };
});
vi.mock("@/lib/db/source-admin-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/source-admin-store")>();
  return {
    ...actual,
    createSourceAdminStore: (...args: Parameters<typeof actual.createSourceAdminStore>) => {
      const store = actual.createSourceAdminStore(...args);
      return {
        ...store,
        audit: async (entry: Parameters<typeof store.audit>[0]) => {
          if (state.failAudit) throw new Error("audit_log: fora do ar (simulado)");
          return store.audit(entry);
        },
      };
    },
  };
});

const { createServiceClient } = await import("@/lib/db/client");
const {
  updateSourceAction,
  decideApprovalAction,
  sourceStatusAction,
  createSourceAction,
  activateSourceAction,
  testConnectionAction,
  uploadLogoAction,
  collectNowAction,
} = await import("@/app/estudio/control/fontes/actions");
const { sourceRuns, pendingSourceApprovals } = await import("@/lib/db/queries/sources-admin");

const SEED_PASSWORD = "citynews-local-123";
const HELENA = "helena.costa@citynews.local";
const MARINA = "marina.arruda@citynews.local";
const DIEGO = "diego.prado@citynews.local";
const testStart = new Date().toISOString();
const svc = createServiceClient();

const sessions = new Map<string, Promise<DbClient>>();
function signedIn(email: string): Promise<DbClient> {
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
    return client as unknown as DbClient;
  });
  sessions.set(email, ready);
  return ready;
}
async function asUser<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const previous = state.client;
  state.client = await signedIn(email);
  try {
    return await fn();
  } finally {
    state.client = previous;
  }
}
function formFrom(values: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v instanceof Blob) f.append(k, v);
    else if (Array.isArray(v)) for (const x of v) f.append(k, String(x));
    else if (v !== undefined && v !== null) f.append(k, String(v));
  }
  return f;
}
type Row = Database["public"]["Tables"]["sources"]["Row"];
async function rowBySlug(slug: string): Promise<Row> {
  const r = await svc.from("sources").select("*").eq("slug", slug).single();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
async function auditRows(ref: string) {
  const r = await svc
    .from("audit_log")
    .select("*")
    .eq("object_ref", ref)
    .gt("at", testStart)
    .order("id");
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const TOUCHED = [
  "agencia-mt",
  "diario-oficial-de-cuiaba",
  "placar-mt",
  "cena-cuiabana",
  "agro-em-pauta-mt",
  "diario-da-baixada",
  "brasil-hoje",
  "mt-agora",
] as const;
const snapshots = new Map<string, Row>();
const createdSources: string[] = [];
const runIds: string[] = [];

beforeAll(async () => {
  process.env.MEDIA_STORE = "memory";
  state.client = await signedIn(HELENA);
  for (const slug of TOUCHED) snapshots.set(slug, await rowBySlug(slug));
});

afterAll(async () => {
  for (const [, row] of snapshots) {
    const now = (await svc.from("sources").select("status").eq("id", row.id).single()).data;
    if (now?.status === "blocked" && row.status !== "blocked")
      await svc.from("sources").update({ status: "paused" }).eq("id", row.id);
    const rest: Partial<Row> = { ...row };
    delete rest.id;
    delete rest.created_at;
    delete rest.slug;
    delete rest.version;
    delete rest.updated_at;
    const r = await svc.from("sources").update(rest).eq("id", row.id);
    if (r.error) throw new Error(`restaurar ${row.slug}: ${r.error.message}`);
  }
  await svc.from("approvals").delete().like("target_ref", "source:%").gt("created_at", testStart);
  await svc.from("source_discoveries").delete().gt("created_at", testStart);
  if (createdSources.length) {
    await svc.from("source_discoveries").delete().in("source_id", createdSources);
    await svc.from("sources").delete().in("id", createdSources);
  }
  for (const id of runIds) await svc.from("ingest_runs").delete().eq("id", id);
  await svc.from("rate_limits").delete().like("bucket", "source_admin%");
  await svc.from("rate_limits").delete().like("bucket", "test-connection%");
  await svc.from("rate_limits").delete().like("bucket", "crawler%");
  await svc.from("rate_limits").delete().like("bucket", "collect_now%");
});

// ---------------------------------------------------------------------------

describe("#1 restringir campo crítico aplica na hora (D-F3)", () => {
  it("imagem reproduction→none, republicação resumo→só link, primary→low e fonte única off", async () => {
    let s = await rowBySlug("agencia-mt"); // primary, licensed_only, resumo, fonte única
    await svc.from("sources").update({ image_policy: "reproduction" }).eq("id", s.id);
    s = await rowBySlug("agencia-mt");
    const steps: [Record<string, string>, Partial<Row>][] = [
      [{ imagePolicy: "none" }, { image_policy: "none" }],
      [{ republishPolicy: "link_only" }, { republish_policy: "link_only" }],
      [{ reliability: "low" }, { reliability: "low" }],
      [{ maySoleSource: "false" }, { may_be_sole_source: false }],
    ];
    for (const [fields, expected] of steps) {
      const cur = await rowBySlug("agencia-mt");
      const r = await asUser(DIEGO, () =>
        updateSourceAction(formFrom({ id: cur.id, version: cur.version, ...fields })),
      );
      expect(r).toMatchObject({ ok: true, message: "Alterações salvas" });
      expect(await rowBySlug("agencia-mt")).toMatchObject(expected);
    }
  });

  it("misto: restringir aplica e afrouxar vira pedido, e a mensagem diz as duas coisas", async () => {
    const s = await rowBySlug("diario-oficial-de-cuiaba"); // imagem none, fonte única
    const r = await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          maySoleSource: "false",
          imagePolicy: "licensed_only",
          justification: "Licença de imagens firmada com a prefeitura",
        }),
      ),
    );
    expect(r).toMatchObject({
      ok: true,
      message: "Alterações salvas. 1 alteração aguarda aprovação de admin ou editor-chefe",
    });
    expect(await rowBySlug("diario-oficial-de-cuiaba")).toMatchObject({
      may_be_sole_source: false,
      image_policy: "none",
    });
  });
});

describe("#2 URLs validadas na escrita", () => {
  it("feedUrl e termsUrl inválidos são recusados com mensagem em pt-BR e nada muda", async () => {
    const s = await rowBySlug("diario-da-baixada");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          feedUrl: "javascript:alert(1)",
          termsUrl: "http://127.0.0.1/termos",
        }),
      ),
    );
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        feedUrl: expect.stringMatching(/http/),
        termsUrl: "Este endereço não é permitido.",
      },
    });
    expect((await rowBySlug("diario-da-baixada")).version).toBe(s.version);
  });

  it("no cadastro também", async () => {
    const r = await asUser(DIEGO, () =>
      createSourceAction(
        formFrom({
          name: "Teste URL",
          baseUrl: "https://testeurl.example",
          strategy: "rss",
          feedUrl: "ftp://testeurl.example/feed",
          locality: "mt",
        }),
      ),
    );
    expect(r).toMatchObject({ ok: false, fieldErrors: { feedUrl: expect.any(String) } });
  });
});

describe("#12 feed novo zera ETag/Last-Modified", () => {
  it("trocar feed_url limpa os cabeçalhos condicionais do feed antigo", async () => {
    const s = await rowBySlug("diario-da-baixada");
    await svc
      .from("sources")
      .update({ etag: '"abc"', last_modified: "Sat, 26 Sep 2026 12:00:00 GMT" })
      .eq("id", s.id);
    const cur = await rowBySlug("diario-da-baixada");
    const r = await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: cur.id,
          version: cur.version,
          feedUrl: "https://diariodabaixada.example/feed-novo",
        }),
      ),
    );
    expect(r).toMatchObject({ ok: true });
    expect(await rowBySlug("diario-da-baixada")).toMatchObject({
      feed_url: "https://diariodabaixada.example/feed-novo",
      etag: null,
      last_modified: null,
    });
  });
});

describe("#3 Crawl-delay só do servidor", () => {
  it("consumption do cliente não define robots; ativação e teste gravam o Crawl-delay", async () => {
    process.env.CRAWLER_FIXTURES = "1";
    try {
      const created = await asUser(DIEGO, () =>
        createSourceAction(
          formFrom({
            name: "Cadência MT",
            slug: "cadencia-mt-teste",
            baseUrl: "https://cadencia.example",
            strategy: "rss",
            feedUrl: "https://cadencia.example/feed",
            locality: "cuiaba",
            termsReviewed: "true",
            consumption: JSON.stringify({
              strategy: "rss",
              robots: { crawlDelaySec: 1 },
              extra: "<script>",
            }),
          }),
        ),
      );
      expect(created).toMatchObject({ ok: true });
      if (!created.ok) throw new Error("cadastro");
      const id = (created.data as { id: string }).id;
      createdSources.push(id);
      const row = (await svc.from("sources").select("*").eq("id", id).single()).data!;
      const consumption = row.consumption as {
        robots?: { crawlDelaySec?: unknown };
        extra?: unknown;
      };
      expect(consumption.robots?.crawlDelaySec ?? null).toBeNull();
      expect(consumption.extra).toBeUndefined();

      const activated = await asUser(DIEGO, () =>
        activateSourceAction(formFrom({ id, version: row.version })),
      );
      expect(activated).toMatchObject({ ok: true });
      const after = (await svc.from("sources").select("*").eq("id", id).single()).data!;
      expect(after.status).toBe("active");
      expect(after.consumption).toMatchObject({ robots: { crawlDelaySec: 600 } });

      // O teste de conexão regrava o valor (aqui, igual: sem nova versão).
      const tested = await asUser(DIEGO, () => testConnectionAction(formFrom({ id })));
      expect(tested).toMatchObject({ ok: true });
      const again = (await svc.from("sources").select("*").eq("id", id).single()).data!;
      expect(again.consumption).toMatchObject({ robots: { crawlDelaySec: 600 } });
      expect(again.version).toBe(after.version);
      // Na volta a pausada para não entrar em coleta de verdade.
      await svc.from("sources").update({ status: "paused" }).eq("id", id);
    } finally {
      delete process.env.CRAWLER_FIXTURES;
    }
  });
});

describe("#4 opt-out: falha na remoção das reproduções é relatada", () => {
  it("bloqueia, devolve ok:false com mensagem clara e audita source.takedown_failed", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    state.failTakedown = true;
    try {
      const r = await asUser(DIEGO, () =>
        sourceStatusAction(
          formFrom({ id: s.id, version: s.version, action: "block", reason: "opt_out" }),
        ),
      );
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/reproduç/i) });
    } finally {
      state.failTakedown = false;
    }
    expect(await rowBySlug("agro-em-pauta-mt")).toMatchObject({
      status: "blocked",
      image_policy: "none",
    });
    const audit = await auditRows(`source:${s.id}`);
    expect(audit.map((a) => a.action)).toContain("source.takedown_failed");
  });
});

describe("#5 falha ao pedir aprovação é relatada, sem esconder o que foi salvo", () => {
  it("não crítico salvo, pedido falho listado, ok:false", async () => {
    const s = await rowBySlug("brasil-hoje");
    state.failApprovalRequest = true;
    let r;
    try {
      r = await asUser(DIEGO, () =>
        updateSourceAction(
          formFrom({
            id: s.id,
            version: s.version,
            editorialScore: 2,
            imagePolicy: "licensed_only",
            justification: "Licença",
          }),
        ),
      );
    } finally {
      state.failApprovalRequest = false;
    }
    expect(r).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Alterações salvas.*política de imagem/),
    });
    expect(await rowBySlug("brasil-hoje")).toMatchObject({
      editorial_score: 2,
      image_policy: "none",
    });
  });
});

describe("#6 auditoria complementar e pedido obsoleto", () => {
  it("falha na auditoria depois de gravar não joga fora o sucesso", async () => {
    const mt = await rowBySlug("mt-agora");
    state.failAudit = true;
    let r;
    try {
      r = await asUser(DIEGO, () => collectNowAction(formFrom({ id: mt.id })));
    } finally {
      state.failAudit = false;
    }
    expect(r).toMatchObject({ ok: true, message: expect.stringMatching(/enfileirada/) });
    if (r?.ok) {
      const runId = (r.data as { runId: string }).runId;
      runIds.push(runId);
      await svc.from("jobs").delete().eq("message->>runId", runId);
    }
  });

  it("linha de auditoria forjada por outra pessoa não torna o pedido obsoleto", async () => {
    const s = await rowBySlug("placar-mt"); // imagem none
    await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          imagePolicy: "with_agreement",
          justification: "Acordo com o Placar MT",
        }),
      ),
    );
    const pending = await pendingSourceApprovals();
    if (!pending.ok) throw new Error("pendentes");
    const p = pending.value.find((x) => x.sourceId === s.id)!;
    // Helena (staff) grava uma linha falsa dizendo que o valor de antes era outro.
    const helena = await signedIn(HELENA);
    const forged = await helena.from("audit_log").insert({
      actor: "c1000000-0000-4000-8000-000000000001",
      action: "source.approval_requested",
      object_ref: `source:${s.id}`,
      details: { approvalId: p.id, field: "image_policy", from: "reproduction" },
    });
    expect(forged.error).toBeNull();
    expect(
      await asUser(MARINA, () => decideApprovalAction(formFrom({ id: p.id, decision: "approve" }))),
    ).toMatchObject({ ok: true });
    expect((await rowBySlug("placar-mt")).image_policy).toBe("with_agreement");
  });

  it("campo mudado depois do pedido ainda torna o pedido obsoleto", async () => {
    const s = await rowBySlug("cena-cuiabana"); // imagem none
    await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          imagePolicy: "licensed_only",
          justification: "Licença",
        }),
      ),
    );
    await svc.from("sources").update({ image_policy: "with_agreement" }).eq("id", s.id);
    const pending = await pendingSourceApprovals();
    if (!pending.ok) throw new Error("pendentes");
    const p = pending.value.find((x) => x.sourceId === s.id)!;
    expect(
      await asUser(MARINA, () => decideApprovalAction(formFrom({ id: p.id, decision: "approve" }))),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/obsoleto/) });
  });

  it("pedido já aprovado (aplicação falhou) também fica obsoleto quando o campo mudou (I-4)", async () => {
    const s = await rowBySlug("agro-em-pauta-mt");
    // Valor diferente do "antes" do pedido (testes anteriores podem ter deixado `none`).
    const changed = s.image_policy === "none" ? "with_agreement" : "none";
    await asUser(DIEGO, () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          imagePolicy: "reproduction",
          justification: "Acordo de reprodução",
        }),
      ),
    );
    const pending = await pendingSourceApprovals();
    if (!pending.ok) throw new Error("pendentes");
    const p = pending.value.find((x) => x.sourceId === s.id)!;
    // Simula "aprovada, mas a aplicação falhou": decisão gravada direto, sem consumir.
    const approved = await svc
      .from("approvals")
      .update({ status: "approved", approved_by: "c1000000-0000-4000-8000-000000000002" })
      .eq("id", p.id)
      .select("status, decided_at")
      .single();
    expect(approved.data).toMatchObject({ status: "approved" });
    expect(approved.data?.decided_at).not.toBeNull();
    // O campo mudou de novo no meio do caminho (pela service role: sem pedido de aprovação).
    await svc.from("sources").update({ image_policy: changed }).eq("id", s.id);
    expect(
      await asUser(MARINA, () => decideApprovalAction(formFrom({ id: p.id, decision: "approve" }))),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/obsoleto/) });
    expect((await rowBySlug("agro-em-pauta-mt")).image_policy).toBe(changed);
    // Decisão é final no banco: continua `approved` (expira em 24 h), nunca `applied`.
    expect(
      (await svc.from("approvals").select("status").eq("id", p.id).single()).data?.status,
    ).toBe("approved");
    const rows = await auditRows(`source:${s.id}`);
    expect(rows.at(-1)).toMatchObject({
      action: "source.approval_rejected",
      details: expect.objectContaining({ approvalId: p.id, obsolete: true }),
    });
  });
});

describe("#8 logotipo: sem arquivo órfão em conflito", () => {
  function png(side: number): Blob {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    new DataView(b.buffer).setUint32(16, side);
    new DataView(b.buffer).setUint32(20, side);
    return new Blob([b], { type: "image/png" });
  }

  it("envio normal grava logo_path", async () => {
    state.storage = { uploads: [], removed: [] };
    try {
      const s = await rowBySlug("placar-mt");
      const r = await asUser(DIEGO, () =>
        uploadLogoAction(formFrom({ id: s.id, version: s.version, logo: png(128) })),
      );
      expect(r).toMatchObject({ ok: true });
      expect((await rowBySlug("placar-mt")).logo_path).toBe(state.storage.uploads[0]);
      expect(state.storage.removed).toEqual([]);
    } finally {
      state.storage = null;
    }
  });

  it("versão muda durante o envio: conflito e o arquivo enviado é apagado", async () => {
    const s = await rowBySlug("placar-mt");
    state.storage = {
      uploads: [],
      removed: [],
      onUpload: async () => {
        await svc.from("sources").update({ editorial_score: 4 }).eq("id", s.id);
      },
    };
    try {
      const r = await asUser(DIEGO, () =>
        uploadLogoAction(formFrom({ id: s.id, version: s.version, logo: png(256) })),
      );
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/alterada/) });
      expect(state.storage.uploads).toHaveLength(1);
      expect(state.storage.removed).toEqual(state.storage.uploads);
    } finally {
      state.storage = null;
    }
  });
});

describe("#9 source_discovery_link", () => {
  it("fonte inexistente, descoberta de outra pessoa ou antiga não ligam", async () => {
    const diego = await signedIn(DIEGO);
    const helena = await signedIn(HELENA);
    const save = async (c: DbClient) => {
      const r = await c.rpc("source_discovery_save", {
        p: { inputUrl: "https://x.example", finalUrl: "https://x.example/feed" },
      });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };
    const mt = await rowBySlug("mt-agora");
    const mine = await save(diego);
    const theirs = await save(helena);
    const link = async (id: string, source: string) =>
      (await diego.rpc("source_discovery_link", { p_id: id, p_source: source, p_accepted: [] }))
        .data;
    expect(await link(mine, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await link(theirs, mt.id)).toBe(false);
    const old = await save(diego);
    await svc
      .from("source_discoveries")
      .update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
      .eq("id", old);
    expect(await link(old, mt.id)).toBe(false);
    expect(await link(mine, mt.id)).toBe(true);
  });
});

describe("#10 runs pulados com o gatilho real", () => {
  it("pulo registrado num run do ciclo normal aparece como cron", async () => {
    const mt = await rowBySlug("mt-agora");
    const run = await svc
      .from("ingest_runs")
      .insert({
        window_start: "2001-01-01T00:00:00Z",
        started_at: new Date().toISOString(),
        trigger: "cron",
        stats: { skipped: [{ slug: mt.slug, reason: "previous_pending" }] },
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runIds.push(run.data.id);
    const runs = await sourceRuns(mt.id);
    if (!runs.ok) throw new Error("runs");
    expect(runs.value.find((r) => r.runId === run.data.id)).toMatchObject({
      trigger: "cron",
      outcome: "skipped:previous_pending",
    });
  });
});

describe("ativar sem termos revisados (A-127)", () => {
  it("fonte sem a caixa de termos ativa pelo Estúdio; termos seguem não revisados", async () => {
    process.env.CRAWLER_FIXTURES = "1";
    try {
      const created = await asUser(DIEGO, () =>
        createSourceAction(
          formFrom({
            name: "Sem Termos MT",
            slug: "sem-termos-mt-teste",
            baseUrl: "https://cadencia.example",
            strategy: "rss",
            feedUrl: "https://cadencia.example/feed",
            locality: "cuiaba",
          }),
        ),
      );
      expect(created).toMatchObject({ ok: true });
      if (!created.ok) throw new Error("cadastro");
      const id = (created.data as { id: string }).id;
      createdSources.push(id);
      const row = (await svc.from("sources").select("*").eq("id", id).single()).data!;
      expect(row.terms_reviewed_at).toBeNull();

      const activated = await asUser(DIEGO, () =>
        activateSourceAction(formFrom({ id, version: row.version })),
      );
      expect(activated).toMatchObject({ ok: true });
      const after = (await svc.from("sources").select("*").eq("id", id).single()).data!;
      expect(after.status).toBe("active");
      expect(after.terms_reviewed_at).toBeNull();
      await svc.from("sources").update({ status: "paused" }).eq("id", id);
    } finally {
      delete process.env.CRAWLER_FIXTURES;
    }
  });
});
