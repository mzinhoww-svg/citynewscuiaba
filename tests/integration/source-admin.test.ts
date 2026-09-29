// @vitest-environment node
// FS-T6 · Servidor do painel de fontes: ações do Estúdio ponta a ponta sem navegador (pilha local, A-017).
// Usuários de seed (JWT real, RLS e triggers valendo): Diego (operador de IA), Helena (admin), Marina
// (editora-chefe) e Thiago (analista). Rede e IA são falsas; a fila usa namespace próprio.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activateSourceAction,
  analyzeLinkAction,
  bulkSourcesAction,
  collectNowAction,
  createSourceAction,
  decideApprovalAction,
  setDefaultFrequencyAction,
  setFastLaneMaxAction,
  sourceStatusAction,
  testConnectionAction,
  updateSourceAction,
  uploadLogoAction,
} from "@/app/estudio/control/fontes/actions";
import { requestApproval } from "@/lib/approvals";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createServiceClient } from "@/lib/db/client";
import {
  listSources,
  parseSourceFilters,
  pendingSourceApprovals,
  sourceDetail,
  sourceHistory,
} from "@/lib/db/queries/sources-admin";
import { createMemoryMediaStore } from "@/lib/media/store";
import { DEFAULT_USER_AGENT } from "@/lib/pipeline/http";
import { createQueue } from "@/lib/pipeline/queue";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { createMemoryIngestRepo } from "@/lib/pipeline/testing/memory-ingest-repo";
import { runWithSourceDeps, type SourceServerDeps } from "@/lib/sources/server-deps";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { asUser, clientOf, SEED_USERS, type SeedUser } from "./studio";

const db = createServiceClient();
const trash = pipelineTrash();
const namespace = `sa-${randomUUID().slice(0, 8)}`;
trash.namespaces.add(namespace);
const tag = randomUUID().slice(0, 6);
const memoryMedia = createMemoryMediaStore();

const text = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/plain" } });
const html = (body: string): FakeRoute => ({ body, headers: { "content-type": "text/html" } });
const rss = (host: string): FakeRoute => ({
  body: `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Voz do Coxipó</title>
${[1, 2, 3, 4]
  .map(
    (i) =>
      `<item><title>Moradores do Coxipó pedem asfalto na rua ${i}</title><link>https://${host}/n/${i}</link><pubDate>Sun, 27 Sep 2026 1${i}:00:00 GMT</pubDate><description>CORPO-SECRETO-${i}</description></item>`,
  )
  .join("\n")}</channel></rss>`,
  headers: { "content-type": "application/rss+xml" },
});
const VOZ_HOST = "vozdocoxipo.example";
const routes: Record<string, FakeRoute> = {
  [`https://${VOZ_HOST}/robots.txt`]: text("User-agent: *\nDisallow: /admin\nCrawl-delay: 20"),
  [`https://${VOZ_HOST}/`]: html(
    `<html><head><title>Voz do Coxipó</title><meta property="og:site_name" content="Voz do Coxipó"><link rel="alternate" type="application/rss+xml" href="/feed"></head><body><a href="/termos">Termos</a></body></html>`,
  ),
  [`https://${VOZ_HOST}/feed`]: rss(VOZ_HOST),
  "https://fechado.example/robots.txt": text("User-agent: *\nDisallow: /"),
  "https://fechado.example/feed": rss("fechado.example"),
};
const fake = createFakeHttp(routes);
const provider = createFakeProvider();
const deps: SourceServerDeps = {
  service: db,
  queue: createQueue(db, { namespace }),
  crawl: {
    repo: createMemoryIngestRepo([]),
    http: fake.http,
    resolve: fakeResolve(),
    userAgent: DEFAULT_USER_AGENT,
  },
  callAgent: createCallAgent({ store: createMemoryAiStore(), provider, now: () => new Date() }),
  mediaStore: memoryMedia,
};

/** Roda a ação como um usuário de seed, com as dependências de teste. */
const as = <T>(user: SeedUser, fn: () => Promise<T>): Promise<T> =>
  asUser(user, () => runWithSourceDeps(deps, fn), { now: () => new Date() });

function formFrom(fields: Record<string, string | number | boolean | string[] | null | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.append(k, String(v));
  }
  return f;
}

const created: string[] = [];
const approvalIds: string[] = [];
const discoveryIds: string[] = [];
const mediaIds: string[] = [];
let seq = 0;

/** Fonte própria do teste, `active` e com termos revisados (service role: fora do guard). */
async function mkSource(over: Record<string, unknown> = {}) {
  const n = ++seq;
  const slug = `sa-${tag}-${n}`;
  const { data, error } = await db
    .from("sources")
    .insert({
      slug,
      name: `Fonte SA ${tag} ${n}`,
      base_url: `https://sa-${tag}-${n}.example/`,
      feed_url: `https://sa-${tag}-${n}.example/feed`,
      kind: "rss",
      locality: "cuiaba",
      status: "active",
      terms_reviewed_at: new Date().toISOString(),
      ...over,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  created.push(data.id);
  return data;
}
const load = async (id: string) =>
  (await db.from("sources").select("*").eq("id", id).single()).data as NonNullable<
    Awaited<ReturnType<typeof mkSource>>
  >;
const bySlug = async (slug: string) =>
  (await db.from("sources").select("*").eq("slug", slug).single()).data!;
const auditActions = async (ref: string) =>
  ((await db.from("audit_log").select("action").eq("object_ref", ref)).data ?? []).map(
    (r) => r.action,
  );

let varzeaBefore: Awaited<ReturnType<typeof bySlug>>;
const rateBuckets = ["source_analyze", "source_test"];

beforeAll(async () => {
  varzeaBefore = await bySlug("portal-varzea");
});

afterAll(async () => {
  await db.from("sources").update({ frequency_minutes: null }).in("id", created);
  await db.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 10, p_ctx: {} });
  await db.rpc("app_setting_set", {
    p_key: "sources.default_frequency_minutes",
    p_value: 30,
    p_ctx: {},
  });
  await db
    .from("sources")
    .update({
      image_policy: varzeaBefore.image_policy,
      status: varzeaBefore.status,
      status_reason: varzeaBefore.status_reason,
      editorial_score: varzeaBefore.editorial_score,
    })
    .eq("id", varzeaBefore.id);
  if (mediaIds.length) await db.from("media_assets").delete().in("id", mediaIds);
  if (approvalIds.length) await db.from("approvals").delete().in("id", approvalIds);
  if (discoveryIds.length) await db.from("source_discoveries").delete().in("id", discoveryIds);
  await db.from("source_discoveries").delete().in("input_url", ["https://vozdocoxipo.example/"]);
  if (created.length) {
    await db
      .from("approvals")
      .delete()
      .eq("kind", "source.critical")
      .or(created.map((id) => `target_ref.like.source:${id}:%`).join(","));
    await db.from("source_discoveries").delete().in("source_id", created);
    await db.from("sources").delete().in("id", created);
  }
  for (const bucket of rateBuckets) await db.from("rate_limits").delete().eq("bucket", bucket);
  await db.from("rate_limits").delete().eq("bucket", "collect_now");
  await purgePipeline(db, trash);
});

describe("aprovação de mudança crítica (Review Focus 2)", () => {
  it("operador pede, tenta aprovar, editora-chefe aprova", async () => {
    const s = await bySlug("portal-varzea");
    await db.from("sources").update({ image_policy: "none" }).eq("id", s.id);
    const fresh = await bySlug("portal-varzea");
    const r = await as("diego", () =>
      updateSourceAction(
        formFrom({
          id: fresh.id,
          version: fresh.version,
          imagePolicy: "reproduction",
          justification: "Acordo assinado em 20/09",
        }),
      ),
    );
    expect(r).toMatchObject({ ok: true, message: "1 alteração aguarda segunda aprovação" });
    expect((await bySlug("portal-varzea")).image_policy).toBe("none");

    const pending = (await as("diego", () => pendingSourceApprovals()))!;
    expect(pending.ok).toBe(true);
    const p = pending.ok ? pending.value.find((x) => x.sourceId === fresh.id) : undefined;
    expect(p).toMatchObject({
      field: "image_policy",
      value: "reproduction",
      requesterName: "Diego Prado",
    });
    approvalIds.push(p!.id);

    // Diego pediu: não aprova a própria mudança.
    expect(
      await as("diego", () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({ ok: false, message: "A aprovação precisa ser de outra pessoa" });
    // UPDATE direto como Diego (authenticated) cai no guard do banco.
    const direct = await (
      await clientOf("diego")
    )
      .from("sources")
      .update({ image_policy: "reproduction" })
      .eq("id", fresh.id);
    expect(direct.error?.message).toMatch(/aprovação source\.critical/);

    expect(
      await as("marina", () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({ ok: true });
    expect((await bySlug("portal-varzea")).image_policy).toBe("reproduction");
    expect(
      (
        await db
          .from("approvals")
          .select("status, approved_by, requested_by")
          .eq("id", p!.id)
          .single()
      ).data,
    ).toEqual({
      status: "applied",
      approved_by: SEED_USERS.marina.id,
      requested_by: SEED_USERS.diego.id,
    });
    expect(await auditActions(`source:${fresh.id}`)).toEqual(
      expect.arrayContaining([
        "source.approval_requested",
        "source.approval_applied",
        "source.update",
      ]),
    );
    const upd = await db
      .from("audit_log")
      .select("actor, details")
      .eq("object_ref", `source:${fresh.id}`)
      .eq("action", "source.update")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(upd.data?.actor).toBe(SEED_USERS.marina.id);
    expect(JSON.stringify(upd.data?.details)).toContain(SEED_USERS.diego.id);
  });

  it("mudança crítica sem justificativa é recusada e nada nasce", async () => {
    const s = await mkSource();
    const r = await as("diego", () =>
      updateSourceAction(formFrom({ id: s.id, version: s.version, reliability: "primary" })),
    );
    expect(r).toMatchObject({ ok: false, fieldErrors: { justification: expect.any(String) } });
    expect(
      (await db.from("approvals").select("id").like("target_ref", `source:${s.id}:%`)).data,
    ).toEqual([]);
  });

  it("mistura: o que não é crítico aplica na hora; o crítico espera", async () => {
    const s = await mkSource();
    const r = await as("diego", () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          editorialScore: 5,
          maySoleSource: "true",
          justification: "Única fonte do bairro",
        }),
      ),
    );
    expect(r).toMatchObject({
      ok: true,
      message: "Fonte salva. 1 alteração aguarda segunda aprovação",
    });
    const after = await load(s.id);
    expect(after.editorial_score).toBe(5);
    expect(after.may_be_sole_source).toBe(false);
    // Recusar não muda a fonte.
    const [p] = (
      (await as("marina", () => pendingSourceApprovals())) as {
        ok: true;
        value: { id: string; sourceId: string }[];
      }
    ).value.filter((x) => x.sourceId === s.id);
    expect(
      await as("marina", () => decideApprovalAction(formFrom({ id: p!.id, decision: "reject" }))),
    ).toMatchObject({ ok: true });
    expect((await load(s.id)).may_be_sole_source).toBe(false);
  });

  it("operador não decide pedido de outra pessoa; aprovar pedido que perdeu o efeito pede recusa", async () => {
    const s = await mkSource();
    const r = await as("helena", () =>
      updateSourceAction(
        formFrom({
          id: s.id,
          version: s.version,
          imagePolicy: "with_agreement",
          justification: "Acordo",
        }),
      ),
    );
    expect(r.ok).toBe(true);
    const list = await as("marina", () => pendingSourceApprovals());
    const p = list.ok ? list.value.find((x) => x.sourceId === s.id) : undefined;
    expect(
      await as("diego", () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({
      ok: false,
      message: "Apenas administração e editor-chefe aprovam mudanças críticas de fonte.",
    });
    // A política já subiu por outro caminho (service role): a aprovação não tem mais efeito.
    await db.from("sources").update({ image_policy: "reproduction" }).eq("id", s.id);
    expect(
      await as("marina", () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("não tem mais efeito"),
    });
    expect(
      (await db.from("approvals").select("status").eq("id", p!.id).single()).data?.status,
    ).toBe("pending");
  });

  it("desbloquear exige segunda pessoa; bloquear exige motivo", async () => {
    const s = await mkSource();
    expect(
      await as("helena", () =>
        sourceStatusAction(formFrom({ id: s.id, version: s.version, action: "block" })),
      ),
    ).toMatchObject({
      ok: false,
      message: "Informe o motivo.",
    });
    const b = await as("helena", () =>
      sourceStatusAction(
        formFrom({ id: s.id, version: s.version, action: "block", reason: "legal" }),
      ),
    );
    expect(b).toMatchObject({ ok: true, message: "Fonte bloqueada." });
    const blocked = await load(s.id);
    expect(blocked).toMatchObject({ status: "blocked", status_reason: "legal" });

    const u = await as("diego", () =>
      sourceStatusAction(
        formFrom({
          id: s.id,
          version: blocked.version,
          action: "unblock",
          justification: "Acordo refeito",
        }),
      ),
    );
    expect(u).toMatchObject({ ok: true, message: "1 alteração aguarda segunda aprovação" });
    expect((await load(s.id)).status).toBe("blocked");
    const list = await as("marina", () => pendingSourceApprovals());
    const p = list.ok ? list.value.find((x) => x.sourceId === s.id) : undefined;
    expect(p).toMatchObject({ field: "status", value: "paused" });
    expect(
      await as("marina", () => decideApprovalAction(formFrom({ id: p!.id, decision: "approve" }))),
    ).toMatchObject({ ok: true });
    expect(await load(s.id)).toMatchObject({ status: "paused", status_reason: "manual" });
  });
});

describe("pedido source.critical no banco (0030)", () => {
  it("só pedido que amplia direitos, de fonte existente, sem repetição", async () => {
    const s = await mkSource({ image_policy: "reproduction", reliability: "primary" });
    const ask = (ref: string, user: SeedUser = "diego") =>
      as(user, () =>
        requestApproval({ kind: "source.critical", targetRef: ref, justification: "Motivo" }),
      );
    // já está no valor máximo: não amplia
    expect(await ask(`source:${s.id}:image_policy=reproduction`)).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(await ask(`source:${s.id}:reliability=verified`)).toMatchObject({
      ok: false,
      error: "invalid",
    });
    // desbloquear só de fonte bloqueada
    expect(await ask(`source:${s.id}:status=paused`)).toMatchObject({
      ok: false,
      error: "invalid",
    });
    // fonte inexistente e campo fora da lista
    expect(await ask(`source:${randomUUID()}:image_policy=reproduction`)).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(await ask(`source:${s.id}:name=Outro`)).toMatchObject({ ok: false, error: "invalid" });
    // analista não pede
    expect(await ask(`source:${s.id}:may_be_sole_source=true`, "thiago")).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    // pedido válido e repetição
    const first = await ask(`source:${s.id}:may_be_sole_source=true`);
    expect(first.ok).toBe(true);
    expect(await ask(`source:${s.id}:may_be_sole_source=true`)).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });
});

describe("permissão e conflito", () => {
  it("sem source.manage a ação redireciona para entrar com motivo", async () => {
    const s = await mkSource();
    const digest = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return "";
      } catch (e) {
        return String((e as { digest?: string }).digest ?? e);
      }
    };
    const d = await digest(() =>
      as("thiago", () =>
        updateSourceAction(formFrom({ id: s.id, version: s.version, editorialScore: 1 })),
      ),
    );
    expect(d).toContain("NEXT_REDIRECT");
    expect(d).toContain("/entrar?next=%2Festudio%2Fcontrol%2Ffontes&motivo=sem-permissao");
    expect((await load(s.id)).editorial_score).toBe(s.editorial_score);
    const acts: Array<() => Promise<unknown>> = [
      () => collectNowAction(formFrom({ id: s.id })),
      () => analyzeLinkAction(formFrom({ url: "vozdocoxipo.example" })),
      () => bulkSourcesAction(formFrom({ ids: s.id, action: "pause" })),
      () => setFastLaneMaxAction(formFrom({ max: 5 })),
    ];
    for (const act of acts)
      expect(await digest(() => as("thiago", act))).toContain("motivo=sem-permissao");
  });

  it("conflito de versão devolve mensagem com quem mudou e não grava", async () => {
    const s = await mkSource();
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id: s.id, version: s.version, editorialScore: 4 })),
      ),
    ).toMatchObject({ ok: true, message: "Fonte salva." });
    const r = await as("diego", () =>
      updateSourceAction(
        formFrom({ id: s.id, version: s.version, editorialScore: 1, name: "Outro nome" }),
      ),
    );
    expect(r).toMatchObject({
      ok: false,
      message: expect.stringMatching(
        /^Esta fonte foi alterada por Helena Costa às \d{1,2}h(\d{2})?\. Recarregue para ver a versão atual\.$/,
      ),
    });
    const after = await load(s.id);
    expect(after.editorial_score).toBe(4);
    expect(after.name).toBe(s.name);
  });
});

describe("estado, lote e opt-out", () => {
  it("opt-out bloqueia, zera política de imagem e remove reproduções", async () => {
    const s = await mkSource({ image_policy: "reproduction" });
    const asset = await db
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: `test/${tag}-optout.jpg`,
        license: "REPRODUÇÃO",
        allowed_use: "reproduction",
        status: "approved",
        source_id: s.id,
      })
      .select("id")
      .single();
    expect(asset.error).toBeNull();
    mediaIds.push(asset.data!.id);

    const r = await as("helena", () =>
      sourceStatusAction(
        formFrom({ id: s.id, version: s.version, action: "block", reason: "opt_out" }),
      ),
    );
    expect(r).toMatchObject({
      ok: true,
      message: "Fonte bloqueada por pedido da fonte. 1 imagem reproduzida foi removida.",
      data: { removedImages: 1 },
    });
    expect(await load(s.id)).toMatchObject({
      status: "blocked",
      status_reason: "opt_out",
      image_policy: "none",
    });
    expect(
      (await db.from("media_assets").select("status").eq("id", asset.data!.id).single()).data
        ?.status,
    ).toBe("blocked");
  });

  it("M4b: takedown que falha no opt-out avisa, e repetir só refaz o takedown", async () => {
    const s = await mkSource({ image_policy: "reproduction" });
    const path = `test/${tag}-optout-falho.jpg`;
    const asset = await db
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: path,
        license: "REPRODUÇÃO",
        allowed_use: "reproduction",
        status: "approved",
        source_id: s.id,
      })
      .select("id")
      .single();
    mediaIds.push(asset.data!.id);
    const flaky = createMemoryMediaStore();
    let broken = true;
    const store = {
      ...flaky,
      remove: async (p: string) => {
        if (broken) throw new Error("storage indisponível");
        return flaky.remove(p);
      },
    };
    const withStore = { ...deps, mediaStore: store };
    const run = (version: number) =>
      asUser(
        "helena",
        () =>
          runWithSourceDeps(withStore, () =>
            sourceStatusAction(formFrom({ id: s.id, version, action: "block", reason: "opt_out" })),
          ),
        { now: () => new Date() },
      );
    const first = await run(s.version);
    expect(first).toMatchObject({
      ok: false,
      message: expect.stringMatching(/não foram removidas|não foi removida/),
    });
    expect((await load(s.id)).status).toBe("blocked");
    // A reprodução já saiu do portal (bloqueada); o arquivo ainda precisa sair.
    broken = false;
    const again = await run((await load(s.id)).version);
    expect(again).toMatchObject({ ok: true, data: { removedImages: 1 } });
    expect(
      (await db.from("media_assets").select("status").eq("id", asset.data!.id).single()).data
        ?.status,
    ).toBe("blocked");
  });

  it("excluir = arquivar: pausa antes, motivo obrigatório, itens ficam e dá para restaurar", async () => {
    const s = await mkSource();
    expect(
      await as("helena", () =>
        sourceStatusAction(
          formFrom({ id: s.id, version: s.version, action: "archive", reason: "x" }),
        ),
      ),
    ).toMatchObject({ ok: false, message: "Pause a fonte antes de excluir." });
    const p = await as("helena", () =>
      sourceStatusAction(formFrom({ id: s.id, version: s.version, action: "pause" })),
    );
    expect(p).toMatchObject({ ok: true, message: "Fonte pausada." });
    const v = (await load(s.id)).version;
    expect(
      await as("helena", () =>
        sourceStatusAction(formFrom({ id: s.id, version: v, action: "archive" })),
      ),
    ).toMatchObject({
      ok: false,
      message: "Informe o motivo.",
    });
    const a = await as("helena", () =>
      sourceStatusAction(
        formFrom({ id: s.id, version: v, action: "archive", reason: "Site saiu do ar" }),
      ),
    );
    expect(a).toMatchObject({ ok: true });
    const arch = await load(s.id);
    expect(arch.archived_at).not.toBeNull();
    expect(arch.archive_reason).toBe("Site saiu do ar");
    // arquivada não se altera; restaurar volta pausada
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id: s.id, version: arch.version, editorialScore: 1 })),
      ),
    ).toMatchObject({ ok: false, message: "A fonte está arquivada. Restaure antes de alterar." });
    const rr = await as("helena", () =>
      sourceStatusAction(formFrom({ id: s.id, version: arch.version, action: "restore" })),
    );
    expect(rr).toMatchObject({ ok: true, message: "Fonte restaurada. Ela volta pausada." });
    expect(await load(s.id)).toMatchObject({
      archived_at: null,
      status: "paused",
      status_reason: "manual",
    });
  });

  it("lote de 3: 2 pausadas e 1 ignorada com motivo, mesmo batchId", async () => {
    const [a, b] = [await mkSource(), await mkSource()];
    const c = await mkSource({ status: "paused", status_reason: "manual" });
    const r = await as("helena", () =>
      bulkSourcesAction(formFrom({ ids: [a.id, b.id, c.id], action: "pause" })),
    );
    expect(r).toMatchObject({ ok: true, message: "2 fontes alteradas, 1 ignorada com motivo." });
    const data = (
      r as {
        ok: true;
        data?: {
          batchId: string;
          items: { id: string; outcome: string; reason: string | null; message: string | null }[];
        };
      }
    ).data!;
    expect(data.items.find((i) => i.id === c.id)).toMatchObject({
      outcome: "ignored",
      reason: "already_paused",
      message: "Já estava pausada",
    });
    expect((await load(a.id)).status).toBe("paused");
    expect((await load(b.id)).status).toBe("paused");
    const logs = (
      await db
        .from("audit_log")
        .select("object_ref, details")
        .in(
          "object_ref",
          [a.id, b.id].map((i) => `source:${i}`),
        )
        .eq("action", "source.status")
    ).data!;
    expect(logs).toHaveLength(2);
    for (const l of logs) expect(l.details).toMatchObject({ batchId: data.batchId });
  });

  it("lote: acima de 50, id inválido e primeira ativação são tratados", async () => {
    const tooMany = Array.from({ length: 51 }, () => randomUUID());
    expect(
      await as("helena", () => bulkSourcesAction(formFrom({ ids: tooMany, action: "pause" }))),
    ).toMatchObject({
      ok: false,
      message: "O lote aceita de 1 a 50 fontes.",
    });
    expect(
      await as("helena", () => bulkSourcesAction(formFrom({ ids: "x", action: "pause" }))),
    ).toMatchObject({ ok: false });
    const first = await mkSource({ status: "paused", status_reason: "pending_activation" });
    const again = await mkSource({ status: "paused", status_reason: "manual" });
    const r = await as("helena", () =>
      bulkSourcesAction(formFrom({ ids: [first.id, again.id], action: "activate" })),
    );
    const items = (
      r as { ok: true; data?: { items: { id: string; outcome: string; reason: string | null }[] } }
    ).data!.items;
    expect(items.find((i) => i.id === first.id)).toMatchObject({
      outcome: "ignored",
      reason: "needs_first_activation",
    });
    expect(items.find((i) => i.id === again.id)).toMatchObject({ outcome: "applied" });
  });
});

describe("frequência e via rápida", () => {
  it("via rápida cheia: updateSourceAction devolve a mensagem e nada muda", async () => {
    await db.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 1, p_ctx: {} });
    // Esvazia a via para o teste ser determinístico (só fontes do seed com frequência < 30, se houver).
    const used = (
      (await db.from("sources").select("id").lt("frequency_minutes", 30).is("archived_at", null))
        .data ?? []
    ).length;
    if (used > 0)
      await db.from("sources").update({ frequency_minutes: null }).lt("frequency_minutes", 30);
    const [a, b] = [await mkSource(), await mkSource()];
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id: a.id, version: a.version, frequencyMinutes: 10 })),
      ),
    ).toMatchObject({ ok: true });
    const r = await as("helena", () =>
      updateSourceAction(formFrom({ id: b.id, version: b.version, frequencyMinutes: 15 })),
    );
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        frequencyMinutes: expect.stringMatching(/^A via rápida está cheia: 1 de 1 fontes\. /),
      },
    });
    expect((await load(b.id)).frequency_minutes).toBeNull();
    // troca dentro da via não ocupa vaga; fora da grade é recusada
    const a2 = await load(a.id);
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id: a.id, version: a2.version, frequencyMinutes: 20 })),
      ),
    ).toMatchObject({ ok: true });
    const a3 = await load(a.id);
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id: a.id, version: a3.version, frequencyMinutes: 25 })),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { frequencyMinutes: expect.stringMatching(/10, 15 ou 20/) },
    });
    // fonte pausada não entra na via rápida
    const paused = await mkSource({ status: "paused", status_reason: "manual" });
    await db.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 10, p_ctx: {} });
    expect(
      await as("helena", () =>
        updateSourceAction(
          formFrom({ id: paused.id, version: paused.version, frequencyMinutes: 10 }),
        ),
      ),
    ).toMatchObject({
      ok: false,
      message: "Ative a fonte antes de colocá-la na via rápida.",
    });
  });

  it("lote de frequência rápida enche as vagas e ignora o resto com motivo", async () => {
    await db.from("sources").update({ frequency_minutes: null }).lt("frequency_minutes", 30);
    await db.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 2, p_ctx: {} });
    const three = [await mkSource(), await mkSource(), await mkSource()];
    const r = await as("helena", () =>
      bulkSourcesAction(
        formFrom({ ids: three.map((t) => t.id), action: "frequency", frequencyMinutes: 15 }),
      ),
    );
    expect(r).toMatchObject({ ok: true, message: "2 fontes alteradas, 1 ignorada com motivo." });
    const items = (
      r as { ok: true; data?: { items: { reason: string | null; message: string | null }[] } }
    ).data!.items;
    expect(items.map((i) => i.reason)).toEqual([null, null, "fast_lane_full"]);
    expect(items[2]?.message).toBe("A via rápida está cheia");
    await db.rpc("app_setting_set", { p_key: "sources.fast_lane_max", p_value: 10, p_ctx: {} });
  });

  it("padrão global recusa 10 min e aceita múltiplo de 30", async () => {
    expect(
      await as("helena", () => setDefaultFrequencyAction(formFrom({ minutes: 10 }))),
    ).toMatchObject({
      ok: false,
      message: "O padrão precisa ser múltiplo de 30 minutos, de 30 minutos a 24 horas.",
    });
    expect(
      await as("helena", () => setDefaultFrequencyAction(formFrom({ minutes: 45 }))),
    ).toMatchObject({ ok: false });
    expect(
      await as("helena", () => setDefaultFrequencyAction(formFrom({ minutes: 60 }))),
    ).toMatchObject({
      ok: true,
      message: "Frequência padrão: 1 h.",
    });
    const s = await mkSource();
    const list = await as("helena", () => sourceDetail(s.id));
    expect(list.ok && list.value?.frequency).toMatchObject({
      chosen: null,
      effective: 60,
      isDefault: true,
      raisedBy: null,
    });
    await as("helena", () => setDefaultFrequencyAction(formFrom({ minutes: 30 })));
  });

  it("vagas da via rápida: 0 a 20", async () => {
    expect(await as("helena", () => setFastLaneMaxAction(formFrom({ max: 21 })))).toMatchObject({
      ok: false,
      message: "Informe de 0 a 20 vagas.",
    });
    expect(await as("helena", () => setFastLaneMaxAction(formFrom({ max: 3 })))).toMatchObject({
      ok: true,
    });
    await as("helena", () => setFastLaneMaxAction(formFrom({ max: 10 })));
  });

  it("frequência efetiva na leitura mostra quem elevou (A-115)", async () => {
    const s = await mkSource({
      frequency_minutes: null,
      consumption: {
        strategy: "rss",
        robots: { checkedAt: new Date().toISOString(), allowed: true, crawlDelaySec: 600 },
      },
    });
    const d = await as("helena", () => sourceDetail(s.id));
    expect(d.ok && d.value?.frequency).toMatchObject({ effective: 30, raisedBy: null });
    const s2 = await mkSource({
      consumption: {
        strategy: "rss",
        robots: { checkedAt: new Date().toISOString(), allowed: true, crawlDelaySec: 1800 },
      },
    });
    const d2 = await as("helena", () => sourceDetail(s2.id));
    expect(d2.ok && d2.value?.frequency).toMatchObject({
      effective: 60,
      raisedBy: "robots",
      lane: "normal",
    });
    const list = await as("helena", () =>
      listSources(parseSourceFilters(new URLSearchParams({ q: s2.slug }))),
    );
    expect(list.ok && list.value.rows[0]?.frequency).toMatchObject({
      effective: 60,
      raisedBy: "robots",
    });
  });
});

describe("coletar agora", () => {
  it("cria run manual, recusa a segunda vez em 5 min e fonte pausada", async () => {
    const s = await mkSource();
    const r = await as("diego", () => collectNowAction(formFrom({ id: s.id })));
    expect(r).toMatchObject({
      ok: true,
      message: "Coleta iniciada. Os itens aparecem em instantes.",
    });
    const runId = (r as { ok: true; data?: { runId: string } }).data!.runId;
    trash.runIds.add(runId);
    expect(
      (await db.from("ingest_runs").select("trigger").eq("id", runId).single()).data?.trigger,
    ).toBe("manual");
    expect(await as("diego", () => collectNowAction(formFrom({ id: s.id })))).toMatchObject({
      ok: false,
      message: "Esta fonte já foi coletada há pouco ou você atingiu o limite por hora.",
    });
    const paused = await mkSource({ status: "paused", status_reason: "manual" });
    expect(await as("diego", () => collectNowAction(formFrom({ id: paused.id })))).toMatchObject({
      ok: false,
      message: "Só fontes ativas ou instáveis podem ser coletadas agora.",
    });
    expect(await auditActions(`source:${s.id}`)).toContain("source.collect_now");
  });
});

describe("análise, cadastro e ativação", () => {
  it("analisa a Voz do Coxipó e grava a descoberta sem corpo", async () => {
    const r = await as("diego", () => analyzeLinkAction(formFrom({ url: VOZ_HOST })));
    expect(r).toMatchObject({
      ok: true,
      message: "Análise pronta.",
      data: {
        duplicate: null,
        rules: { name: { value: "Voz do Coxipó" } },
        aiStatus: "ok",
        discovery: { strategy: "rss" },
      },
    });
    const d = (r as { ok: true; data?: { discoveryId: string | null } }).data!;
    expect(d.discoveryId).not.toBeNull();
    discoveryIds.push(d.discoveryId!);
    const row = (await db.from("source_discoveries").select("*").eq("id", d.discoveryId!).single())
      .data!;
    expect(row.created_by).toBe(SEED_USERS.diego.id);
    expect(JSON.stringify(row)).not.toMatch(/CORPO-SECRETO|excerpt/);
    expect(JSON.stringify(r)).not.toContain("CORPO-SECRETO");
    expect(
      (
        await db.from("audit_log").select("action").eq("object_ref", `analysis:${VOZ_HOST}`)
      ).data?.map((a) => a.action),
    ).toContain("source.analyze");
    // Crawl-delay do robots vira sugestão de frequência (nunca via rápida)
    expect(
      (r as { ok: true; data?: { rules: { frequency: { value: number } } } }).data!.rules.frequency
        .value,
    ).toBeGreaterThanOrEqual(30);
  });

  it("endereço interno é recusado com a mensagem do plano", async () => {
    expect(
      await as("diego", () =>
        analyzeLinkAction(formFrom({ url: "http://169.254.169.254/latest/meta-data/" })),
      ),
    ).toMatchObject({
      ok: false,
      message: "Este endereço não é permitido.",
    });
  });

  it("análise recusa a 11ª por hora da mesma pessoa", async () => {
    let last: { ok: boolean; message: string } | null = null;
    for (let i = 0; i < 12; i++)
      last = await as("helena", () => analyzeLinkAction(formFrom({ url: "fechado.example" })));
    expect(last).toMatchObject({
      ok: false,
      message: "Você fez muitas tentativas. Tente de novo mais tarde.",
    });
  });

  it("cria a fonte paused; campo crítico nasce restrito e vira pedido; via rápida só depois de ativar", async () => {
    const r = await as("diego", () =>
      createSourceAction(
        formFrom({
          name: `Voz do Coxipó ${tag}`,
          slug: `voz-${tag}`,
          baseUrl: `https://${VOZ_HOST}/`,
          feedUrl: `https://${VOZ_HOST}/feed`,
          kind: "rss",
          locality: "cuiaba",
          categories: ["cidade"],
          reliability: "primary",
          imagePolicy: "reproduction",
          frequencyMinutes: 10,
          justification: "Jornal comunitário com acordo assinado",
          consumption: JSON.stringify({ strategy: "rss", feedUrl: `https://${VOZ_HOST}/feed` }),
        }),
      ),
    );
    expect(r).toMatchObject({ ok: true, data: { slug: `voz-${tag}`, approvals: 2 } });
    const id = (r as { ok: true; data?: { id: string } }).data!.id;
    created.push(id);
    const row = await load(id);
    expect(row).toMatchObject({
      status: "paused",
      status_reason: "pending_activation",
      reliability: "standard",
      image_policy: "none",
      frequency_minutes: null,
      created_by: SEED_USERS.diego.id,
    });
    const list = await as("marina", () => pendingSourceApprovals());
    const mine = list.ok ? list.value.filter((x) => x.sourceId === id) : [];
    expect(mine.map((m) => m.field).sort()).toEqual(["image_policy", "reliability"]);
    expect(await as("diego", () => sourceHistory(id, 1))).toMatchObject({ ok: true });

    // slug repetido volta erro no campo
    expect(
      await as("diego", () =>
        createSourceAction(
          formFrom({
            name: "Outra",
            slug: `voz-${tag}`,
            baseUrl: `https://${VOZ_HOST}/`,
            locality: "cuiaba",
          }),
        ),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { slug: "Já existe uma fonte com este identificador." },
    });
    // faltam campos
    expect(
      await as("diego", () => createSourceAction(formFrom({ baseUrl: "https://x.example/" }))),
    ).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String), locality: expect.any(String) },
    });
  });

  it("ativar exige termos revisados, robots permitindo e teste de conexão", async () => {
    const r = await as("helena", () =>
      createSourceAction(
        formFrom({
          name: `Voz Ativa ${tag}`,
          slug: `voz-ativa-${tag}`,
          baseUrl: `https://${VOZ_HOST}/`,
          feedUrl: `https://${VOZ_HOST}/feed`,
          kind: "rss",
          locality: "cuiaba",
          consumption: JSON.stringify({ strategy: "rss" }),
        }),
      ),
    );
    const id = (r as { ok: true; data?: { id: string } }).data!.id;
    created.push(id);
    let row = await load(id);
    expect(
      await as("helena", () => activateSourceAction(formFrom({ id, version: row.version }))),
    ).toMatchObject({
      ok: false,
      message: "Marque os termos de uso da fonte como revisados antes de ativar.",
    });
    expect(
      await as("helena", () =>
        updateSourceAction(formFrom({ id, version: row.version, termsReviewed: "true" })),
      ),
    ).toMatchObject({ ok: true });
    row = await load(id);
    expect(row.terms_reviewed_at).not.toBeNull();
    expect(row.terms_reviewed_by).toBe(SEED_USERS.helena.id);

    const act = await as("helena", () =>
      activateSourceAction(formFrom({ id, version: row.version })),
    );
    expect(act).toMatchObject({ ok: true, message: "Fonte ativada." });
    row = await load(id);
    expect(row).toMatchObject({ status: "active", status_reason: null });
    // O Crawl-delay do robots passou a valer: 20 s => 2 x 20 / 60 arredondado => 1 min, ainda 30 min.
    expect(row.consumption).toMatchObject({ robots: { allowed: true, crawlDelaySec: 20 } });

    // robots proibido bloqueia a ativação
    const closed = await mkSource({
      status: "paused",
      status_reason: "pending_activation",
      base_url: "https://fechado.example/",
      feed_url: "https://fechado.example/feed",
    });
    expect(
      await as("helena", () =>
        activateSourceAction(formFrom({ id: closed.id, version: closed.version })),
      ),
    ).toMatchObject({
      ok: false,
      message: "O robots.txt da fonte não permite a coleta. A fonte não pode ser ativada.",
    });
    expect((await load(closed.id)).status).toBe("paused");
  });

  it("testa a conexão de uma fonte cadastrada e de um endereço novo", async () => {
    const s = await mkSource({
      base_url: `https://${VOZ_HOST}/`,
      feed_url: `https://${VOZ_HOST}/feed`,
    });
    expect(await as("diego", () => testConnectionAction(formFrom({ id: s.id })))).toMatchObject({
      ok: true,
      message: "Conexão ok: 4 itens.",
      data: { ok: true, items: 4 },
    });
    expect(
      await as("diego", () =>
        testConnectionAction(formFrom({ feedUrl: "https://fechado.example/feed", kind: "rss" })),
      ),
    ).toMatchObject({
      ok: false,
      message: "O robots.txt da fonte não permite a coleta deste endereço",
    });
    expect(
      await as("diego", () =>
        testConnectionAction(formFrom({ feedUrl: "http://10.0.0.1/feed", kind: "rss" })),
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("logo", () => {
  it("recusa SVG, arquivo pequeno e retangular sem tocar o storage", async () => {
    const s = await mkSource();
    const png = (w: number, h: number) => {
      const b = new Uint8Array(33);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(b.buffer).setUint32(16, w);
      new DataView(b.buffer).setUint32(20, h);
      return b;
    };
    const file = (bytes: Uint8Array | string, type: string, name: string) => {
      const f = formFrom({ id: s.id, version: s.version });
      f.set("file", new File([bytes as BlobPart], name, { type }));
      return f;
    };
    expect(
      await as("helena", () => uploadLogoAction(file("<svg/>", "image/svg+xml", "l.svg"))),
    ).toMatchObject({
      ok: false,
      message: "Use PNG ou WebP. SVG não é aceito.",
    });
    expect(
      await as("helena", () => uploadLogoAction(file(png(64, 64), "image/png", "l.png"))),
    ).toMatchObject({
      ok: false,
      message: "O logo precisa ter pelo menos 96 por 96 pixels.",
    });
    expect(
      await as("helena", () => uploadLogoAction(file(png(128, 96), "image/png", "l.png"))),
    ).toMatchObject({
      ok: false,
      message: "O logo precisa ser quadrado.",
    });
    expect(
      await as("helena", () => uploadLogoAction(formFrom({ id: s.id, version: s.version }))),
    ).toMatchObject({
      ok: false,
      message: "Escolha um arquivo PNG ou WebP.",
    });
    expect((await load(s.id)).logo_path).toBeNull();
  });
});
