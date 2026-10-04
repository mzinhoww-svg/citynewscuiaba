// @vitest-environment node
// Gate do P4 (docs/reports/P4-gate-review.md): invariantes editoriais no banco. Cada caso
// reproduz um achado como usuário de seed, pela Server Action ou por chamada PostgREST direta
// (JWT do navegador + anon key), e confere que o banco recusa.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as revalidatePOST } from "@/app/api/jobs/revalidate/route";
import type { Json } from "@/lib/db/types";
import { createMemoryMediaStore } from "@/lib/media/store";
import { openCorrection } from "@/lib/studio/corrections";
import { approveImage, setImageText, takedownImage } from "@/lib/studio/media";
import { checklist } from "@/lib/studio/checklist";
import { studioContext } from "@/lib/studio/context";
import { loadDraftView } from "@/lib/studio/draft-view";
import { publishArticle } from "@/lib/studio/publish";
import { approveSubmission, rejectSubmission } from "@/lib/studio/moderation";
import { assign } from "@/lib/studio/queue";
import { reprocessItem, requestChanges, updateSources } from "@/lib/studio/review";
import { saveDraft } from "@/lib/studio/save";
import { asUser, clientOf, SEED_USERS, service } from "./studio";

/** SQL direto no banco local/CI (psql), só para ler o catálogo. */
function sql(text: string): string {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL ausente");
  return execFileSync("psql", [url, "-At", "-v", "ON_ERROR_STOP=1", "-c", text], {
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  })
    .toString()
    .trim();
}

const doc = (...paragraphs: string[]) => ({
  type: "doc" as const,
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

const TOPIC = "c4000000-0000-4000-8000-000000000001";
const ITEM = "c3000000-0000-4000-8000-000000000002";
const ids = {
  pub: randomUUID(),
  auto: randomUUID(),
  fallback: randomUUID(),
  rafael: randomUUID(),
  draft: randomUUID(),
  scheduled: randomUUID(),
  dueBad: randomUUID(),
  dueGood: randomUUID(),
  other: randomUUID(),
  juliana: randomUUID(),
};
const media: string[] = [];
const corrections: string[] = [];
const reports: string[] = [];
const run = Date.now();

const FALLBACK = [
  "Folha do Cerrado: Prefeitura anuncia mutirão de limpeza nos córregos do CPA. A ação começa na segunda e vai mobilizar 120 agentes em doze bairros da região norte (https://folhadocerrado.example/mutirao)",
  "MT Agora: Mutirão vai recolher entulho e pneus velhos. Moradores podem deixar os materiais nos pontos de coleta montados pela Secretaria de Obras até sexta-feira (https://mtagora.example/entulho)",
];

const complete = {
  kind: "original" as const,
  tags: ["limpeza"],
  neighborhoods: ["cpa"],
  seo_title: "Mutirão de limpeza no CPA",
  seo_description: "Prefeitura organiza mutirão de limpeza nos córregos do CPA nesta semana.",
};

async function createArticle(
  id: string,
  fields: Record<string, unknown>,
  versions: { origin: "ai" | "human"; snapshot: NonNullable<Json>; author_id?: string }[] = [],
) {
  const { error } = await service.from("articles").insert({
    id,
    slug: `gate-p4-${id.slice(0, 8)}-${run}`,
    section_slug: "cidade",
    title: "Mutirão de limpeza chega aos córregos do CPA",
    dek: "Ação da prefeitura começa na segunda com 120 agentes.",
    body: doc("Texto inicial da redação."),
    status: "in_review",
    ...complete,
    ...fields,
  } as never);
  if (error) throw error;
  const rows = versions.length
    ? versions
    : [{ origin: "human" as const, snapshot: { title: "x" }, author_id: undefined }];
  for (const [i, v] of rows.entries()) {
    const r = await service.from("article_versions").insert({
      article_id: id,
      number: i + 1,
      snapshot: v.snapshot,
      origin: v.origin,
      author_id: v.author_id ?? null,
    });
    if (r.error) throw r.error;
  }
}

async function versionOf(id: string): Promise<number> {
  const { data } = await service
    .from("article_versions")
    .select("number")
    .eq("article_id", id)
    .order("number", { ascending: false })
    .limit(1)
    .single();
  return data?.number ?? 0;
}

async function statusOf(id: string) {
  const { data } = await service
    .from("articles")
    .select("status, title, scheduled_for, field_origins, review_reason")
    .eq("id", id)
    .single();
  return data!;
}

beforeAll(async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  await createArticle(ids.pub, { status: "published", publish_mode: "human", published_at: past });
  await createArticle(
    ids.auto,
    {
      status: "published",
      publish_mode: "auto",
      published_at: past,
      agent_id: "write",
      topic_id: TOPIC,
      kind: "normalized",
    },
    [{ origin: "ai", snapshot: { title: "x" } }],
  );
  await createArticle(
    ids.fallback,
    { ai_fallback: true, agent_id: "write", kind: "normalized", body: doc(...FALLBACK) },
    [{ origin: "ai", snapshot: { title: "x", body: doc(...FALLBACK), aiFallback: true } }],
  );
  await service.from("article_sources").insert({
    article_id: ids.fallback,
    item_id: ITEM,
    role: "primary",
    confirmed: true,
  });
  await createArticle(ids.rafael, {
    author_id: SEED_USERS.rafael.id,
    status: "in_review",
    kind: "original",
  });
  await createArticle(ids.draft, { status: "draft" });
  await createArticle(ids.scheduled, {});
  await createArticle(ids.dueBad, {});
  await createArticle(ids.dueGood, {});
  // Editoria cidade exige fonte primária confirmada: as que vão ao checklist ganham uma.
  const { error: srcErr } = await service.from("article_sources").insert(
    [ids.draft, ids.scheduled, ids.dueBad, ids.dueGood].map((article_id) => ({
      article_id,
      item_id: ITEM,
      role: "primary",
      confirmed: true,
    })),
  );
  if (srcErr) throw srcErr;
  await createArticle(ids.other, {
    status: "published",
    publish_mode: "human",
    published_at: past,
  });
});

afterAll(async () => {
  if (corrections.length) await service.from("corrections").delete().in("id", corrections);
  await service.from("corrections").delete().in("article_id", Object.values(ids));
  if (reports.length) await service.from("reports").delete().in("id", reports);
  await service.from("article_media").delete().in("article_id", Object.values(ids));
  if (media.length) await service.from("media_assets").delete().in("id", media);
  await service.from("articles").delete().in("id", Object.values(ids));
});

describe("B-015 · rascunho sem IA só publica reescrito", () => {
  it("publicar o rascunho sem IA como veio é recusado com o motivo", async () => {
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.fallback, when: "now", destinations: ["home", "section"] }),
    );
    expect(r).toEqual({
      ok: false,
      error: "invalid",
      message: "Rascunho sem IA: reescreva o texto das fontes antes de publicar",
    });
    expect((await statusOf(ids.fallback)).status).toBe("in_review");
  });

  it("a chamada direta à função de publicação também recusa", async () => {
    const db = await clientOf("marina");
    const { data } = await db.rpc("studio_publish", {
      p_id: ids.fallback,
      p_destinations: ["home"],
    });
    expect(data).toMatchObject({ status: "blocked", blockers: ["ai_fallback"] });
  });

  it("reescrita parcial (um parágrafo das fontes ainda no corpo) continua bloqueada", async () => {
    const base = await versionOf(ids.fallback);
    const saved = await asUser("marina", () =>
      saveDraft({
        id: ids.fallback,
        baseVersion: base,
        doc: {
          title: "Mutirão de limpeza chega aos córregos do CPA",
          dek: "Ação da prefeitura começa na segunda com 120 agentes.",
          body: doc(
            "A prefeitura de Cuiabá faz nesta semana um mutirão nos córregos do CPA.",
            FALLBACK[1]!,
          ),
        },
      }),
    );
    expect(saved.ok).toBe(true);
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.fallback, when: "now", destinations: ["home"] }),
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });

  it("corpo reescrito pela redação libera a publicação", async () => {
    const base = await versionOf(ids.fallback);
    const saved = await asUser("marina", () =>
      saveDraft({
        id: ids.fallback,
        baseVersion: base,
        doc: {
          title: "Mutirão de limpeza chega aos córregos do CPA",
          dek: "Ação da prefeitura começa na segunda com 120 agentes.",
          body: doc(
            "A prefeitura de Cuiabá faz nesta semana um mutirão nos córregos do CPA.",
            "Quem tiver entulho ou pneus pode levar aos pontos de coleta até sexta.",
          ),
        },
      }),
    );
    expect(saved.ok).toBe(true);
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.fallback, when: "now", destinations: ["home"] }),
    );
    expect(r).toMatchObject({ ok: true, value: { status: "published" } });
  });
});

describe("matéria publicada só muda por Atualização ou Correção (banco)", () => {
  it("editor não reescreve título e corpo de publicada por PostgREST direto", async () => {
    const db = await clientOf("otavio");
    const { error } = await db
      .from("articles")
      .update({ title: "Título trocado sem versão", body: doc("Texto trocado.") })
      .eq("id", ids.pub);
    expect(error?.code).toBe("42501");
    expect((await statusOf(ids.pub)).title).toBe("Mutirão de limpeza chega aos córregos do CPA");
  });

  it("editor não publica por UPDATE direto de status (fora da função com checklist)", async () => {
    const db = await clientOf("otavio");
    const { error } = await db
      .from("articles")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", ids.draft);
    expect(error?.code).toBe("42501");
    expect((await statusOf(ids.draft)).status).toBe("draft");
  });

  it("studio_save_draft recusa publicada e ignora status e origens vindos do cliente", async () => {
    const db = await clientOf("otavio");
    const pub = await db.rpc("studio_save_draft", {
      p_id: ids.pub,
      p_base: await versionOf(ids.pub),
      p_patch: { title: "Reescrita pela função" },
    });
    expect(pub.data).toMatchObject({ status: "public" });
    expect((await statusOf(ids.pub)).title).toBe("Mutirão de limpeza chega aos córregos do CPA");

    const forged = await db.rpc("studio_save_draft", {
      p_id: ids.draft,
      p_base: await versionOf(ids.draft),
      p_patch: {
        title: "Rascunho editado por Otávio",
        status: "published",
        fieldOrigins: {
          title: { origin: "ai", agentId: "write", acceptedBy: SEED_USERS.helena.id },
        },
      },
    });
    expect(forged.data).toMatchObject({ status: "ok" });
    const after = await statusOf(ids.draft);
    expect(after.status).toBe("draft");
    expect(after.field_origins).toMatchObject({
      title: { origin: "human", editedBy: SEED_USERS.otavio.id },
    });
    expect(JSON.stringify(after.field_origins)).not.toContain("Name");
  });

  it("marca de sugestão de IA creditando outra pessoa não entra pelo salvar", async () => {
    const db = await clientOf("otavio");
    const { data, error } = await db.rpc("studio_save_draft", {
      p_id: ids.draft,
      p_base: await versionOf(ids.draft),
      p_patch: {
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Parágrafo que finge ter sido aceito pela Helena.",
                  marks: [
                    {
                      type: "aiSuggestion",
                      attrs: { agentId: "write", acceptedBy: SEED_USERS.helena.id },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    expect(data).toBeNull();
    expect(error?.code).toBe("22023");
  });

  it("revisor não insere versão de correção forjada nem credita outra pessoa", async () => {
    const db = await clientOf("beatriz");
    const { error } = await db.from("article_versions").insert({
      article_id: ids.pub,
      number: 99,
      snapshot: { title: "Texto forjado" },
      origin: "human",
      author_id: SEED_USERS.marina.id,
      change_kind: "correction",
      public_note: "Nota falsa",
    });
    expect(error).not.toBeNull();
    const { data } = await service
      .from("article_versions")
      .select("id")
      .eq("article_id", ids.pub)
      .eq("number", 99);
    expect(data).toEqual([]);
  });

  it("nota pública de correção publicada é imutável e correção só publica pela função", async () => {
    const { data: c } = await service
      .from("corrections")
      .insert({
        article_id: ids.pub,
        kind: "correction",
        public_note: "Nota original",
        requested_by: "Leitor",
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    corrections.push(c!.id);
    const db = await clientOf("beatriz");
    const edit = await db
      .from("corrections")
      .update({ public_note: "Nota trocada" })
      .eq("id", c!.id);
    expect(edit.error?.code).toBe("42501");

    const { data: open } = await service
      .from("corrections")
      .insert({
        article_id: ids.pub,
        kind: "correction",
        public_note: "",
        requested_by: "Leitor",
        status: "open",
      })
      .select("id")
      .single();
    corrections.push(open!.id);
    const fake = await db
      .from("corrections")
      .update({ status: "published", published_at: new Date().toISOString(), public_note: "Falsa" })
      .eq("id", open!.id);
    expect(fake.error?.code).toBe("42501");
  });

  it("Atualização continua mudando a publicada, com versão e nota", async () => {
    const { publishUpdate } = await import("@/lib/studio/corrections");
    const r = await asUser("marina", () =>
      publishUpdate({
        id: ids.other,
        baseVersion: 1,
        doc: {
          title: "Mutirão de limpeza chega aos córregos do CPA",
          dek: "Ação da prefeitura foi ampliada para 15 bairros.",
          body: doc("Texto atualizado."),
        },
        publicNote: "A prefeitura ampliou o mutirão.",
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { version: 2 } });
    const { data: v } = await service
      .from("article_versions")
      .select("change_kind, public_note, author_id")
      .eq("article_id", ids.other)
      .eq("number", 2)
      .single();
    expect(v).toEqual({
      change_kind: "update",
      public_note: "A prefeitura ampliou o mutirão.",
      author_id: SEED_USERS.marina.id,
    });
    expect((await statusOf(ids.other)).status).toBe("updated");
  });
});

describe("Reprocessar e Pedir ajuste", () => {
  it("Reprocessar recusa matéria automática publicada e não despublica", async () => {
    const r = await asUser("marina", () => reprocessItem({ id: ids.auto }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect((await statusOf(ids.auto)).status).toBe("published");
    const db = await clientOf("marina");
    const direct = await db.rpc("studio_request_reprocess", { p_article: ids.auto });
    expect(direct.error).not.toBeNull();
    expect((await statusOf(ids.auto)).status).toBe("published");
  });

  it("jornalista salva a própria matéria depois de Pedir ajuste", async () => {
    const asked = await asUser("marina", () =>
      requestChanges({ id: ids.rafael, reason: "Falta ouvir a associação de moradores." }),
    );
    expect(asked.ok).toBe(true);
    const r = await asUser("rafael", () =>
      saveDraft({
        id: ids.rafael,
        baseVersion: 1,
        doc: {
          title: "Mutirão de limpeza chega aos córregos do CPA",
          dek: "Associação de moradores aprova a ação.",
          body: doc("Texto com a fala da associação."),
        },
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { version: 2 } });
    expect((await statusOf(ids.rafael)).status).toBe("changes_requested");
  });
});

describe("publicação atômica e agendadas", () => {
  it("publicar com versão base antiga devolve conflito sem publicar", async () => {
    const r = await asUser("marina", () =>
      publishArticle({ id: ids.draft, when: "now", destinations: ["home"], baseVersion: 0 }),
    );
    expect(r).toMatchObject({ ok: false, error: "conflict" });
    expect((await statusOf(ids.draft)).status).toBe("draft");
  });

  it("editar agendada cancela o agendamento (precisa reagendar)", async () => {
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const s = await asUser("marina", () =>
      publishArticle({ id: ids.scheduled, when: { at }, destinations: ["home"] }),
    );
    expect(s).toMatchObject({ ok: true, value: { status: "scheduled" } });
    const base = await versionOf(ids.scheduled);
    const r = await asUser("marina", () =>
      saveDraft({
        id: ids.scheduled,
        baseVersion: base,
        doc: {
          title: "Mutirão de limpeza chega aos córregos do CPA",
          dek: "Linha fina revista depois do agendamento.",
          body: doc("Texto."),
        },
      }),
    );
    expect(r).toMatchObject({ ok: true, value: { unscheduled: true } });
    const after = await statusOf(ids.scheduled);
    expect(after.status).toBe("in_review");
    expect(after.scheduled_for).toBeNull();
  });

  it("na hora de publicar a agendada o checklist roda de novo", async () => {
    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    for (const id of [ids.dueBad, ids.dueGood]) {
      const s = await asUser("marina", () =>
        publishArticle({ id, when: { at }, destinations: ["home"] }),
      );
      expect(s.ok).toBe(true);
    }
    // Depois de agendada, a linha fina some (ex.: pipeline ou correção de dados).
    const past = new Date(Date.now() - 60_000).toISOString();
    await service.from("articles").update({ dek: "", scheduled_for: past }).eq("id", ids.dueBad);
    await service.from("articles").update({ scheduled_for: past }).eq("id", ids.dueGood);
    const { error } = await service.rpc("publish_due_scheduled");
    expect(error).toBeNull();
    const bad = await statusOf(ids.dueBad);
    expect(bad.status).toBe("in_review");
    expect(bad.review_reason).toContain("title_dek");
    expect((await statusOf(ids.dueGood)).status).toBe("published");

    // Histórico público mostra a versão publicada da agendada.
    const { data: hist } = await service
      .from("public_article_versions")
      .select("number")
      .eq("article_id", ids.dueGood);
    expect(hist?.length).toBeGreaterThan(0);

    // O pg_cron publica sem invalidar: fica uma invalidação pendente, que a rota de
    // revalidação (chamada pelo mesmo job via pg_net) ou o tick consomem.
    const unauthorized = await revalidatePOST(
      new Request("http://localhost/api/jobs/revalidate", { method: "POST" }),
    );
    expect(unauthorized.status).toBe(401);
    const res = await revalidatePOST(
      new Request("http://localhost/api/jobs/revalidate", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tags: string[] };
    expect(body.tags).toContain(`article:${ids.dueGood}`);
    const again = await service.rpc("take_studio_revalidations");
    expect(again.data ?? []).toEqual([]);
  });
});

describe("fontes, correção e atribuição", () => {
  it("fontes de matéria publicada não mudam fora da Atualização", async () => {
    const r = await asUser("marina", () =>
      updateSources({ id: ids.pub, sources: [{ itemId: ITEM, role: "primary", confirmed: true }] }),
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    const db = await clientOf("otavio");
    const direct = await db
      .from("article_sources")
      .insert({ article_id: ids.pub, item_id: ITEM, role: "context", confirmed: false });
    expect(direct.error).not.toBeNull();
  });

  it("pedido de correção não aceita denúncia de outra matéria", async () => {
    const { data: rep } = await service
      .from("reports")
      .insert({ content_ref: `article:${ids.other}`, kind: "wrong_info", message: "Erro" })
      .select("id")
      .single();
    reports.push(rep!.id);
    const r = await asUser("marina", () =>
      openCorrection({
        articleId: ids.pub,
        kind: "correction",
        requestedBy: "Leitor",
        reportId: rep!.id,
      }),
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });

  it("atribuir só para quem é da redação", async () => {
    const out = await asUser("marina", () =>
      assign({ ids: [ids.draft], userId: SEED_USERS.paulo.id }),
    );
    expect(out.done).toEqual([]);
    expect(out.failed[0]).toMatchObject({ error: "invalid" });
    const ok = await asUser("marina", () =>
      assign({ ids: [ids.draft], userId: SEED_USERS.juliana.id }),
    );
    expect(ok.done).toEqual([ids.draft]);
  });
});

describe("moderação sem corrida", () => {
  it("dois cliques em Aprovar a mesma sugestão criam um evento só", async () => {
    const { data: sub } = await service
      .from("event_submissions")
      .insert({
        payload: { title: "Sarau no Porto", startsAt: "2026-10-10T20:00:00-04:00", venue: "Orla" },
        contact_email: `sarau-${run}@exemplo.com`,
      })
      .select("id")
      .single();
    const edits = {
      title: "Sarau no Porto",
      startsAt: "2026-10-10T20:00:00-04:00",
      venue: "Orla do Porto",
      category: "musica" as const,
    };
    const [a, b] = await Promise.all([
      asUser("marina", () => approveSubmission({ id: sub!.id, edits })),
      asUser("marina", () => approveSubmission({ id: sub!.id, edits })),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const { data: ev } = await service
      .from("event_listings")
      .select("id")
      .eq("title", "Sarau no Porto")
      .eq("venue", "Orla do Porto");
    expect(ev).toHaveLength(1);
    const again = await asUser("marina", () =>
      rejectSubmission({ id: sub!.id, reason: "Duplicado" }),
    );
    expect(again).toMatchObject({ ok: false, error: "invalid" });
    await service.from("event_submissions").delete().eq("id", sub!.id);
    await service
      .from("event_listings")
      .delete()
      .in(
        "id",
        (ev ?? []).map((e) => e.id),
      );
  });
});

describe("mídia: remoção de reprodução e aprovação", () => {
  async function asset(fields: Record<string, unknown>): Promise<string> {
    const { data, error } = await service
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: `reproducao/gate-${randomUUID()}.jpg`,
        origin_url: `https://folhadocerrado.example/foto-${randomUUID()}.jpg`,
        license: "Reprodução",
        credit: "Folha do Cerrado",
        allowed_use: "reprodução com crédito",
        status: "approved",
        ...fields,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    media.push(data!.id);
    return data!.id;
  }

  it("Remover a pedido do veículo apaga a cópia, bloqueia e audita; Aprovar não desfaz", async () => {
    const id = await asset({});
    await service.from("article_media").insert({
      article_id: ids.pub,
      media_id: id,
      rationale: "teste",
      chosen_by: "pipeline",
      alt: "Córrego no CPA",
    });
    const store = createMemoryMediaStore();
    const path = (await service.from("media_assets").select("storage_path").eq("id", id).single())
      .data!.storage_path;
    await store.put(path, new Uint8Array([1, 2, 3]), "image/jpeg");
    const tags: string[] = [];
    const r = await asUser(
      "marina",
      () => takedownImage({ id, reason: "Pedido do veículo por e-mail" }),
      { mediaStore: store, revalidate: async (t) => void tags.push(...t) },
    );
    expect(r).toMatchObject({ ok: true, value: { blocked: 1 } });
    expect((await store.read(path)).ok).toBe(false);
    expect(tags).toContain(`article:${ids.pub}`);
    const { data: m } = await service.from("media_assets").select("status").eq("id", id).single();
    expect(m?.status).toBe("blocked");
    const { data: log } = await service
      .from("audit_log")
      .select("actor, action")
      .eq("object_ref", `media:${id}`)
      .eq("action", "media.takedown");
    expect(log).toEqual([{ actor: SEED_USERS.marina.id, action: "media.takedown" }]);

    const again = await asUser("marina", () => approveImage({ id }));
    expect(again).toMatchObject({ ok: false, error: "invalid" });
    const db = await clientOf("marina");
    const direct = await db.from("media_assets").update({ status: "approved" }).eq("id", id);
    expect(direct.error?.code).toBe("42501");
  });

  const gateSources: string[] = [];
  afterEach(async () => {
    if (media.length) await service.from("article_media").delete().in("media_id", media);
  });
  afterAll(async () => {
    // Imagens primeiro (FK para a fonte), depois as fontes criadas aqui.
    if (media.length) await service.from("media_assets").delete().in("id", media);
    if (gateSources.length) await service.from("sources").delete().in("id", gateSources);
  });

  async function link(mediaId: string, articleId: string) {
    const { error } = await service.from("article_media").insert({
      article_id: articleId,
      media_id: mediaId,
      rationale: "t",
      chosen_by: "t",
      alt: "Teste",
    });
    if (error) throw error;
  }
  async function freshSource(): Promise<string> {
    const { data: base } = await service.from("sources").select("*").limit(1).single();
    const { data, error } = await service
      .from("sources")
      .insert({ ...base!, id: undefined, slug: `gate-${randomUUID()}`, name: "Fonte de teste" })
      .select("id")
      .single();
    if (error) throw error;
    gateSources.push(data!.id);
    return data!.id;
  }
  const statusOfMedia = async (id: string) =>
    (await service.from("media_assets").select("status").eq("id", id).single()).data?.status;

  it("editor de editoria não remove todas da fonte", async () => {
    const sourceId = await freshSource();
    const id = await asset({ source_id: sourceId });
    await link(id, ids.draft);
    const r = await asUser(
      "otavio",
      () => takedownImage({ id, reason: "Pedido", allFromSource: true }),
      { mediaStore: createMemoryMediaStore() },
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await statusOfMedia(id)).toBe("approved");
  });

  it("editor de editoria sem matéria ligada também não remove todas da fonte", async () => {
    const sourceId = await freshSource();
    const id = await asset({ source_id: sourceId });
    const r = await asUser(
      "otavio",
      () => takedownImage({ id, reason: "Pedido", allFromSource: true }),
      { mediaStore: createMemoryMediaStore() },
    );
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await statusOfMedia(id)).toBe("approved");
  });

  it("editor remove só a imagem da própria editoria", async () => {
    const sourceId = await freshSource();
    const id = await asset({ source_id: sourceId });
    await link(id, ids.draft);
    const r = await asUser(
      "otavio",
      () => takedownImage({ id, reason: "Pedido", allFromSource: false }),
      { mediaStore: createMemoryMediaStore(), revalidate: async () => {} },
    );
    expect(r).toMatchObject({ ok: true, value: { blocked: 1 } });
    expect(await statusOfMedia(id)).toBe("blocked");
  });

  it("editora-chefe remove todas da fonte", async () => {
    const sourceId = await freshSource();
    const a = await asset({ source_id: sourceId });
    const b = await asset({ source_id: sourceId });
    const { data: pol } = await service
      .from("articles")
      .select("id")
      .eq("section_slug", "politica")
      .limit(1)
      .single();
    await link(a, ids.draft);
    await link(b, pol!.id);
    const r = await asUser(
      "marina",
      () => takedownImage({ id: a, reason: "Pedido", allFromSource: true }),
      { mediaStore: createMemoryMediaStore(), revalidate: async () => {} },
    );
    expect(r).toMatchObject({ ok: true, value: { blocked: 2 } });
    expect(await statusOfMedia(b)).toBe("blocked");
  });

  it("jornalista não remove reprodução", async () => {
    const id = await asset({});
    const r = await asUser("juliana", () => takedownImage({ id, reason: "Pedido" }), {
      mediaStore: createMemoryMediaStore(),
    });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("Aprovar recusa imagem com licença vencida", async () => {
    const id = await asset({ kind: "licensed", status: "pending", license_until: "2020-01-01" });
    const r = await asUser("marina", () => approveImage({ id }));
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });

  it("imagem usada em duas editorias exige quem aprova nas duas", async () => {
    const id = await asset({ kind: "original", status: "pending" });
    const { data: pol } = await service
      .from("articles")
      .select("id")
      .eq("section_slug", "politica")
      .limit(1)
      .single();
    await service.from("article_media").insert([
      { article_id: ids.draft, media_id: id, rationale: "t", chosen_by: "t" },
      { article_id: pol!.id, media_id: id, rationale: "t", chosen_by: "t" },
    ]);
    for (let i = 0; i < 3; i++) {
      const r = await asUser("otavio", () => approveImage({ id }));
      expect(r).toEqual({ ok: false, error: "forbidden" });
    }
    await service.from("article_media").delete().eq("media_id", id);
  });
});

describe("fila de e-mail do leitor", () => {
  it("destinatário e texto vêm da denúncia respondida, em modelo fixo com campos escapados", async () => {
    const { data: rep } = await service
      .from("reports")
      .insert({
        content_ref: `article:${ids.pub}`,
        kind: "wrong_info",
        message: "Erro",
        contact_email: `leitor-${run}@exemplo.com`,
        status: "answered",
        response: "Corrigimos. <a href='https://golpe.example'>clique</a>",
      })
      .select("id")
      .single();
    reports.push(rep!.id);
    const db = await clientOf("carlos");
    const ok = await db.rpc("studio_queue_reader_email", {
      p_kind: "report_response",
      p_ref: `report:${rep!.id}`,
    });
    expect(ok.error).toBeNull();
    const { data: mail } = await service
      .from("reader_emails")
      .select("to_email, body, subject")
      .eq("ref", `report:${rep!.id}`)
      .single();
    expect(mail?.to_email).toBe(`leitor-${run}@exemplo.com`);
    expect(mail?.body).toContain("&lt;a href=");
    expect(mail?.body).not.toContain("<a ");

    const missing = await db.rpc("studio_queue_reader_email", {
      p_kind: "report_response",
      p_ref: `report:${randomUUID()}`,
    });
    expect(missing.error).not.toBeNull();

    const agenda = await db.rpc("studio_queue_reader_email", {
      p_kind: "event_rejected",
      p_ref: `submission:${randomUUID()}`,
    });
    expect(agenda.error?.code).toBe("42501");
    await service.from("reader_emails").delete().eq("ref", `report:${rep!.id}`);
  });
});

describe("FKs para profiles e exclusão de ex-integrante", () => {
  it("nenhuma FK para profiles fica sem regra de on delete", () => {
    const out = sql(`select conrelid::regclass || '.' || conname from pg_constraint
      where contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'a'
        and conrelid <> 'public.user_roles'::regclass order by 1`);
    expect(out).toBe("");
  });

  it("ex-moderador que respondeu denúncia é excluído; a denúncia fica", async () => {
    const u = await service.auth.admin.createUser({
      email: `ex-moderador-${run}@exemplo.com`,
      password: "senha-de-teste-123",
      email_confirm: true,
    });
    if (u.error) throw u.error;
    const uid = u.data.user.id;
    await service.from("profiles").upsert({ id: uid, display_name: "Ex Moderador" });
    const { data: rep } = await service
      .from("reports")
      .insert({
        content_ref: `article:${ids.pub}`,
        kind: "other",
        message: "x",
        status: "answered",
        response: "Respondido",
        responded_by: uid,
      })
      .select("id")
      .single();
    reports.push(rep!.id);
    await service
      .from("articles")
      .update({
        field_origins: { title: { origin: "human", editedBy: uid, at: "2026-09-01T00:00:00Z" } },
      })
      .eq("id", ids.draft);
    await service
      .from("profiles")
      .update({ delete_requested_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq("id", uid);
    const n = await service.rpc("purge_deleted_accounts", { p_days: 7 });
    expect(n.error).toBeNull();
    expect((await service.from("profiles").select("id").eq("id", uid)).data).toEqual([]);
    const { data: after } = await service
      .from("reports")
      .select("responded_by, response")
      .eq("id", rep!.id)
      .single();
    expect(after).toEqual({ responded_by: null, response: "Respondido" });
    expect(JSON.stringify((await statusOf(ids.draft)).field_origins)).not.toContain(uid);
  });
});

describe("texto alternativo e legenda da imagem", () => {
  it("jornalista escreve o texto alternativo no próprio rascunho e o checklist passa", async () => {
    await createArticle(ids.juliana, { author_id: SEED_USERS.juliana.id, status: "draft" });
    await service
      .from("article_sources")
      .insert({ article_id: ids.juliana, item_id: ITEM, role: "primary", confirmed: true });
    const { data: m } = await service
      .from("media_assets")
      .insert({
        kind: "original",
        storage_path: `original/gate-alt-${randomUUID()}.jpg`,
        license: "CityNews",
        credit: "Foto: Redação",
        allowed_use: "editorial",
        status: "approved",
      })
      .select("id")
      .single();
    media.push(m!.id);
    await service
      .from("article_media")
      .insert({ article_id: ids.juliana, media_id: m!.id, rationale: "t", chosen_by: "t" });

    const check = () =>
      asUser("juliana", async () =>
        checklist((await loadDraftView(await studioContext(), ids.juliana))!),
      );
    expect((await check()).blocker).toBe("Falta texto alternativo da imagem");

    const empty = await asUser("juliana", () =>
      setImageText({
        articleId: ids.juliana,
        mediaId: m!.id,
        alt: " ",
        caption: "",
        decorative: false,
      }),
    );
    expect(empty).toMatchObject({ ok: false, error: "invalid" });
    const long = await asUser("juliana", () =>
      setImageText({
        articleId: ids.juliana,
        mediaId: m!.id,
        alt: "a".repeat(251),
        caption: "",
        decorative: false,
      }),
    );
    expect(long).toMatchObject({ ok: false, error: "invalid" });
    const other = await asUser("rafael", () =>
      setImageText({
        articleId: ids.juliana,
        mediaId: m!.id,
        alt: "x",
        caption: "",
        decorative: false,
      }),
    );
    expect(other).toEqual({ ok: false, error: "forbidden" });

    const r = await asUser("juliana", () =>
      setImageText({
        articleId: ids.juliana,
        mediaId: m!.id,
        alt: "Agentes limpam o córrego do CPA com pás e sacos de lixo",
        caption: "Mutirão no córrego do CPA",
        decorative: false,
      }),
    );
    expect(r).toMatchObject({ ok: true });
    const c = await check();
    expect(c.complete).toBe(true);
    const { data: link } = await service
      .from("article_media")
      .select("alt, caption")
      .eq("article_id", ids.juliana)
      .single();
    expect(link).toEqual({
      alt: "Agentes limpam o córrego do CPA com pás e sacos de lixo",
      caption: "Mutirão no córrego do CPA",
    });
    // O banco concorda: nada bloqueia a publicação.
    const { data: blockers } = await service.rpc("studio_publish_blockers", { p_id: ids.juliana });
    expect(blockers).toEqual([]);

    const deco = await asUser("juliana", () =>
      setImageText({
        articleId: ids.juliana,
        mediaId: m!.id,
        alt: "sobra",
        caption: "",
        decorative: true,
      }),
    );
    expect(deco).toMatchObject({ ok: true });
    expect((await check()).complete).toBe(true);
    const { data: after } = await service
      .from("article_media")
      .select("alt, caption")
      .eq("article_id", ids.juliana)
      .single();
    expect(after).toEqual({ alt: "", caption: null });
  });
});
