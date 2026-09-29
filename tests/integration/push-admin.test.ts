// @vitest-environment node
// A09 no servidor (PW-T11; spec 2026-09-28 §10, critérios 18, 20, 21, 23): Server Actions e
// leituras ponta a ponta sem navegador, com sessões reais do seed (Marina editora-chefe, Helena
// admin, Otávio editor de cidade, Thiago analista). A regra de duas pessoas vale no banco (0041);
// aqui conferimos as mensagens e o que cada papel enxerga. E06: publicar com "Push urgente".
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";

const state = vi.hoisted(() => ({ client: null as unknown, ip: "10.20.30.40" }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${state.ip}, 10.0.0.1` }),
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
  };
});

const { asUser: asStudioUser, clientOf, SEED_USERS, service } = await import("./studio");
type SeedUser = keyof typeof SEED_USERS;
const {
  requestPushAction,
  decidePushAction,
  cancelPushAction,
  pausePushAction,
  requestResumeAction,
  approveResumeAction,
  saveSettingsAction,
  estimateAudienceAction,
  searchArticlesAction,
} = await import("@/app/estudio/admin/notificacoes/actions");
const { publishAction } = await import("@/app/estudio/actions");
const {
  pendingCount,
  queueRows,
  historyRows,
  historyCsv,
  historyDetail,
  pushSettings,
  vapidStatus,
  parseHistoryFilter,
} = await import("@/lib/db/queries/push-admin");

const ART_CIDADE = "c2000000-0000-4000-8000-000000000002";
const ART_ESPORTES = "c2000000-0000-4000-8000-000000000010";
const ART_CLIMA = "c2000000-0000-4000-8000-000000000007";
const testStart = new Date().toISOString();

/** Roda `fn` como a pessoa: sessão para `createServerClient` (ações de A09) e para o Estúdio (E06). */
async function asUser<T>(user: SeedUser, fn: () => Promise<T>): Promise<T> {
  const previous = state.client;
  state.client = (await clientOf(user)) as DbClient;
  try {
    return await asStudioUser(user, fn);
  } finally {
    state.client = previous;
  }
}

function form(values: Record<string, unknown>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values))
    if (v !== undefined && v !== null) f.append(k, String(v));
  return f;
}

const urgent = (articleId: string, extra: Record<string, unknown> = {}) => ({
  kind: "urgent",
  articleId,
  title: "Chuva forte em Cuiabá",
  body: "Defesa Civil alerta para alagamentos.",
  audienceType: "all",
  whenType: "now",
  justification: "Alerta da Defesa Civil",
  ...extra,
});
const highlight = (articleId: string, extra: Record<string, unknown> = {}) => ({
  kind: "highlight",
  articleId,
  title: "Vale a leitura",
  body: "Destaque da redação de hoje.",
  audienceType: "all",
  whenType: "now",
  ...extra,
});

const okId = (r: { ok: boolean; data?: unknown }): string => {
  if (!r.ok) throw new Error("esperava ok");
  return (r.data as { id: string }).id;
};

async function sendRow(id: string) {
  const { data, error } = await service.from("push_sends").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

const SETTINGS_RESET = [
  { key: "push.paused", value: { on: false, by: null, at: null, reason: null } },
  { key: "push.default_daily_limit", value: 3 },
  { key: "push.quiet_start", value: 22 },
  { key: "push.quiet_end", value: 7 },
];

beforeAll(async () => {
  await service.from("app_settings").upsert(SETTINGS_RESET);
  await service.from("rate_limits").delete().like("bucket", "push_admin_%");
});

afterAll(async () => {
  await service.from("push_sends").delete().gte("created_at", testStart);
  await service.from("approvals").delete().like("kind", "push.%").gte("created_at", testStart);
  await service.from("app_settings").upsert(SETTINGS_RESET);
  await service.from("rate_limits").delete().like("bucket", "push_admin_%");
});

describe("duas pessoas nas ações (critério 18)", () => {
  it("Marina pede urgente, tenta aprovar e recebe a mensagem; Helena aprova", async () => {
    const r = await asUser("marina", () => requestPushAction(form(urgent(ART_CIDADE))));
    expect(r).toMatchObject({
      ok: true,
      message: "Pedido criado. Aguardando aprovação de outra pessoa.",
    });
    const id = okId(r);
    expect((await sendRow(id)).status).toBe("pending_approval");
    expect(await asUser("helena", () => pendingCount())).toBeGreaterThanOrEqual(1);
    expect(
      await asUser("marina", () => decidePushAction(form({ id, decision: "approve" }))),
    ).toMatchObject({ ok: false, message: "A aprovação precisa ser de outra pessoa." });
    // Analista não aprova (sem push.approve).
    expect(
      await asUser("thiago", () => decidePushAction(form({ id, decision: "approve" }))),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await asUser("helena", () => decidePushAction(form({ id, decision: "approve" }))),
    ).toMatchObject({
      ok: true,
      message: "Pedido aprovado",
    });
    const row = await sendRow(id);
    expect(row).toMatchObject({ status: "queued", approved_by: SEED_USERS.helena.id });
    expect(
      await asUser("helena", () => decidePushAction(form({ id, decision: "reject", reason: "x" }))),
    ).toMatchObject({
      ok: false,
      message: "Este pedido já foi decidido.",
    });
    // Cancelar: quem pediu ou push.settings, com motivo.
    expect(await asUser("marina", () => cancelPushAction(form({ id })))).toMatchObject({
      ok: false,
      fieldErrors: { reason: "Informe o motivo." },
    });
    expect(
      await asUser("marina", () => cancelPushAction(form({ id, reason: "mudou" }))),
    ).toMatchObject({ ok: true });
    expect((await sendRow(id)).status).toBe("cancelled");
  });

  it("recusar exige motivo e grava; urgente sem justificativa ou agendado é recusado no servidor", async () => {
    const id = okId(await asUser("marina", () => requestPushAction(form(urgent(ART_CLIMA)))));
    expect(
      await asUser("helena", () => decidePushAction(form({ id, decision: "reject" }))),
    ).toMatchObject({
      ok: false,
      fieldErrors: { reason: "Informe o motivo." },
    });
    expect(
      await asUser("helena", () =>
        decidePushAction(form({ id, decision: "reject", reason: "não é urgente" })),
      ),
    ).toMatchObject({ ok: true, message: "Pedido recusado" });
    expect(await sendRow(id)).toMatchObject({ status: "rejected", status_reason: "não é urgente" });

    const noJust = await asUser("marina", () =>
      requestPushAction(form(urgent(ART_CLIMA, { justification: "" }))),
    );
    expect(noJust).toMatchObject({
      ok: false,
      fieldErrors: { justification: "Justificativa obrigatória para urgente" },
    });
    const scheduled = await asUser("marina", () =>
      requestPushAction(form(urgent(ART_CLIMA, { whenType: "at", at: "2030-01-01T10:00" }))),
    );
    expect(scheduled).toMatchObject({ ok: false, fieldErrors: { at: "Urgente só sai agora." } });
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const night = await asUser("marina", () =>
      requestPushAction(form(highlight(ART_CLIMA, { whenType: "at", at: `${inTwoDays}T23:00` }))),
    );
    expect(night).toMatchObject({
      ok: false,
      fieldErrors: { at: "Fora do silêncio: escolha um horário entre 7h e 22h." },
    });
    const far = await asUser("marina", () =>
      requestPushAction(form(highlight(ART_CLIMA, { whenType: "at", at: "2030-01-01T10:00" }))),
    );
    expect(far).toMatchObject({
      ok: false,
      fieldErrors: { at: "Agende no máximo 7 dias à frente." },
    });
    // Destaque agendado dentro da janela: pedido criado com o horário de Cuiabá convertido.
    const ok = await asUser("marina", () =>
      requestPushAction(form(highlight(ART_CLIMA, { whenType: "at", at: `${inTwoDays}T10:30` }))),
    );
    expect(ok).toMatchObject({ ok: true });
    const row = await sendRow(okId(ok));
    expect(Date.parse(row.scheduled_at!)).toBe(Date.parse(`${inTwoDays}T10:30:00-04:00`));
    expect(
      await asUser("helena", () => decidePushAction(form({ id: row.id, decision: "approve" }))),
    ).toMatchObject({ ok: true, message: "Pedido aprovado. Sai no horário agendado." });
    expect((await sendRow(row.id)).status).toBe("scheduled");
  });
});

describe("papéis (critérios 20, 21)", () => {
  it("Otávio (editor) não vê urgente e só vê pedidos próprios e da editoria", async () => {
    expect(await asUser("otavio", () => requestPushAction(form(urgent(ART_CIDADE))))).toMatchObject(
      {
        ok: false,
        message: "Sua conta não tem permissão para esta ação.",
      },
    );
    expect(
      await asUser("otavio", () => requestPushAction(form(highlight(ART_ESPORTES)))),
    ).toMatchObject({
      ok: false,
      message: "Sua conta não tem permissão para esta ação.",
    });
    const own = okId(await asUser("otavio", () => requestPushAction(form(highlight(ART_CIDADE)))));
    const other = okId(
      await asUser("marina", () => requestPushAction(form(highlight(ART_ESPORTES)))),
    );

    const rows = await asUser("otavio", () => queueRows());
    if (!rows.ok) throw new Error("fila");
    const ids = rows.value.map((r) => r.id);
    expect(ids).toContain(own);
    expect(ids).not.toContain(other);
    const mine = rows.value.find((r) => r.id === own)!;
    expect(mine).toMatchObject({
      kind: "highlight",
      status: "pending_approval",
      audienceLabel: "Todos que ativaram Destaques",
      requestedBy: { name: "Otávio Reis" },
      article: { sectionSlug: "cidade" },
    });
    expect(mine.reach).not.toBeNull();

    // Busca de matérias: editor só da própria editoria; admin vê todas as publicadas.
    const search = await asUser("otavio", () => searchArticlesAction(form({ q: "" })));
    const items = (search as { data: { items: { sectionSlug: string }[] } }).data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every((a) => ["cidade", "servicos", "clima", "agenda"].includes(a.sectionSlug)),
    ).toBe(true);
    const all = await asUser("helena", () => searchArticlesAction(form({ q: "copa" })));
    expect((all as { data: { items: { id: string }[] } }).data.items.map((a) => a.id)).toContain(
      ART_ESPORTES,
    );

    // Alcance estimado com a sessão da pessoa (arredondado; abaixo de 20 é 0).
    const est = await asUser("otavio", () =>
      estimateAudienceAction(form({ kind: "highlight", audienceType: "all" })),
    );
    expect(est.ok).toBe(true);
    expect((est as { data: { reach: number } }).data.reach % 10).toBe(0);

    // Analista: nem pedir nem ver a fila (a entrada é só o Funil).
    await expect(
      asUser("thiago", () => pausePushAction(form({ reason: "x", confirm: "PAUSAR" }))),
    ).rejects.toThrow("motivo=sem-permissao");
    const nothing = await asUser("thiago", () => queueRows());
    expect(nothing.ok && nothing.value).toEqual([]);
    expect(
      await asUser("helena", () => decidePushAction(form({ id: other, decision: "approve" }))),
    ).toMatchObject({
      ok: true,
    });
  });

  it("CSV do histórico não tem endpoint, token, id de inscrição nem alvo; filtros inválidos são ignorados", async () => {
    const f = parseHistoryFilter(new URLSearchParams("periodo=99&tipo=x&estado=y&pagina=-2"));
    expect(f).toEqual({ days: 30, kind: null, status: null, page: 1 });
    const csv = await asUser("helena", () =>
      historyCsv({ days: null, kind: null, status: null, page: 1 }),
    );
    expect(csv.split("\r\n")[0]).toBe(
      "data;tipo;materia;titulo;publico;pedido_por;aprovado_por;estado;alvos;enviados;aceitos;falhas;removidas;puladas;recebidos;tocados;ctr",
    );
    expect(csv).not.toMatch(/endpoint|p256dh|auth|token|subscription|source:|bairro:/);
    expect(csv).toMatch(/Chuva forte em Cuiabá/);
    const h = await asUser("helena", () =>
      historyRows({ days: 7, kind: "urgent", status: null, page: 1 }),
    );
    if (!h.ok) throw new Error("histórico");
    expect(h.value.total).toBeGreaterThanOrEqual(1);
    expect(h.value.rows.every((r) => r.kind === "urgent")).toBe(true);
    const detail = await asUser("helena", () => historyDetail(h.value.rows[0]!.id));
    if (!detail.ok) throw new Error("detalhe");
    expect(detail.value?.timeline[0]).toMatchObject({ label: "requested", by: "Marina Arruda" });
    expect(await asUser("helena", () => historyDetail("nao-e-uuid"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("configurações sem VAPID listam só os nomes das variáveis", async () => {
    expect(vapidStatus({} as NodeJS.ProcessEnv)).toEqual({
      ok: false,
      missing: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    });
    const s = await asUser("helena", () => pushSettings());
    expect(s).toMatchObject({ dailyLimit: 3, quietStart: 22, quietEnd: 7, paused: { on: false } });
    expect(JSON.stringify(s.vapid)).not.toMatch(/BE|BA|mailto/);
  });
});

describe("pausa, retomada e configurações (§10.5)", () => {
  it("pausar exige digitar PAUSAR e vale na hora; retomar exige outra pessoa com push.approve", async () => {
    expect(
      await asUser("helena", () =>
        pausePushAction(form({ reason: "incidente", confirm: "pausar" })),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { confirm: "Digite PAUSAR para confirmar." },
    });
    expect(
      await asUser("helena", () =>
        pausePushAction(form({ reason: "incidente", confirm: "PAUSAR" })),
      ),
    ).toMatchObject({
      ok: true,
    });
    const paused = await asUser("marina", () => pushSettings());
    expect(paused.paused).toMatchObject({
      on: true,
      by: { name: "Helena Costa" },
      reason: "incidente",
    });
    // Com envios pausados, o pedido entra e a mensagem avisa.
    const r = await asUser("marina", () => requestPushAction(form(urgent(ART_CIDADE))));
    expect(r).toMatchObject({
      ok: true,
      message: "Pedido criado. Envios pausados: o pedido fica na fila até a retomada.",
    });

    const resume = await asUser("helena", () => requestResumeAction(form({ reason: "resolvido" })));
    expect(resume).toMatchObject({ ok: true });
    const approvalId = (resume as { data: { approvalId: string } }).data.approvalId;
    expect(await asUser("helena", () => approveResumeAction(form({ approvalId })))).toMatchObject({
      ok: false,
      message: "A aprovação precisa ser de outra pessoa.",
    });
    expect(await asUser("otavio", () => approveResumeAction(form({ approvalId })))).toMatchObject({
      ok: false,
      message: "Sua conta não tem permissão para esta ação.",
    });
    expect(await asUser("marina", () => approveResumeAction(form({ approvalId })))).toMatchObject({
      ok: true,
      message: "Envios retomados",
    });
    expect((await asUser("marina", () => pushSettings())).paused.on).toBe(false);
  });

  it("limite 1–3, silêncio 18–22/7–10 e modelos só com {titulo} e {linha_fina}", async () => {
    expect(await asUser("helena", () => saveSettingsAction(form({ dailyLimit: 4 })))).toMatchObject(
      {
        ok: false,
        fieldErrors: { dailyLimit: "Limite entre 1 e 3" },
      },
    );
    expect(
      await asUser("helena", () =>
        saveSettingsAction(
          form({ templates: JSON.stringify([{ name: "x", title: "{titulo}", body: "{outro}" }]) }),
        ),
      ),
    ).toMatchObject({ ok: false, fieldErrors: { templates: expect.stringContaining("{outro}") } });
    expect(
      await asUser("helena", () =>
        saveSettingsAction(
          form({
            dailyLimit: 2,
            quietStart: 21,
            quietEnd: 8,
            templates: JSON.stringify([
              { name: "Padrão", title: "{titulo}", body: "{linha_fina}" },
            ]),
            reason: "teste",
          }),
        ),
      ),
    ).toMatchObject({ ok: true, message: "Configurações salvas" });
    const s = await asUser("helena", () => pushSettings());
    expect(s).toMatchObject({ dailyLimit: 2, quietStart: 21, quietEnd: 8 });
    expect(s.templates).toEqual([{ name: "Padrão", title: "{titulo}", body: "{linha_fina}" }]);
    // Editor não configura: a guarda redireciona.
    await expect(
      asUser("otavio", () => saveSettingsAction(form({ dailyLimit: 3 }))),
    ).rejects.toThrow("sem-permissao");
    await service.from("app_settings").upsert(SETTINGS_RESET);
  });
});

describe("E06 · publicar com Push urgente (§10.7)", () => {
  const id = randomUUID();
  const body: NonNullable<Json> = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Texto de teste." }] }],
  };
  beforeAll(async () => {
    const { error } = await service.from("articles").insert({
      id,
      slug: `teste-push-e06-${id.slice(0, 8)}`,
      kind: "original",
      section_slug: "cultura",
      title: "Festival de teatro de teste abre inscrições <b>hoje</b>",
      dek: "Grupos de Cuiabá podem se inscrever até sexta.",
      body,
      status: "in_review",
      author_id: SEED_USERS.juliana.id,
      tags: ["teatro"],
      neighborhoods: ["porto"],
      seo_title: "Festival de teatro abre inscrições",
      seo_description: "Grupos de Cuiabá podem se inscrever até sexta no festival.",
    });
    if (error) throw error;
    await service.from("article_versions").insert({
      article_id: id,
      number: 1,
      snapshot: { title: "x", dek: "y", body },
      origin: "human",
    });
  });
  afterAll(async () => {
    await service.from("push_sends").delete().eq("article_id", id);
    await service.from("articles").delete().eq("id", id);
  });

  it("sem justificativa é recusado antes de publicar; com justificativa publica e cria o pedido; despublicar cancela", async () => {
    const refused = await asUser("marina", () =>
      publishAction(1, { id, when: "now", destinations: ["home"], push: { justification: "  " } }),
    );
    expect(refused).toEqual({ ok: false, message: "Informe a justificativa do push urgente." });
    expect(
      (await service.from("articles").select("status").eq("id", id).single()).data?.status,
    ).toBe("in_review");

    const r = await asUser("marina", () =>
      publishAction(1, {
        id,
        when: "now",
        destinations: ["home"],
        push: { justification: "Alerta da Defesa Civil" },
      }),
    );
    expect(r).toEqual({
      ok: true,
      message: "Matéria publicada. Pedido de push criado. Aguardando aprovação de outra pessoa.",
      pushQueueHref: "/estudio/admin/notificacoes/fila",
    });
    const { data: sends } = await service.from("push_sends").select("*").eq("article_id", id);
    expect(sends).toHaveLength(1);
    expect(sends![0]).toMatchObject({
      kind: "urgent",
      status: "pending_approval",
      requested_by: SEED_USERS.marina.id,
      title: "Festival de teatro de teste abre inscrições hoje",
      body: "Grupos de Cuiabá podem se inscrever até sexta.",
      justification: "Alerta da Defesa Civil",
      audience: { type: "all" },
    });

    // Otávio (editor) não pede urgente pelo E06: a publicação sai, o pedido não.
    // (guardado no banco; aqui conferimos só a despublicação, 0044)
    await service.from("articles").update({ status: "archived" }).eq("id", id);
    const after = await sendRow(sends![0]!.id);
    expect(after).toMatchObject({ status: "cancelled", status_reason: "Matéria despublicada" });
  });
});
