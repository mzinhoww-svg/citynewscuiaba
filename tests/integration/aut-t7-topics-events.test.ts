// @vitest-environment node
// AUT-T7 (A10, A14): estado do assunto automático e agenda de leitor com aprovação automática.
// Migration 0142.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { saveEventSubmission } from "@/lib/db/writes";

const service = createServiceClient();
const tag = randomUUID().slice(0, 8);
const topics: string[] = [];
const articles: string[] = [];
const items: string[] = [];
const emails: string[] = [];

afterAll(async () => {
  if (articles.length) {
    await service.from("corrections").delete().in("article_id", articles);
    await service.from("articles").delete().in("id", articles);
  }
  if (items.length) await service.from("collected_items").delete().in("id", items);
  if (topics.length) await service.from("topics").delete().in("id", topics);
  if (emails.length) {
    const subs = await service
      .from("event_submissions")
      .select("id, event_id")
      .in("contact_email", emails);
    const ids = (subs.data ?? []).map((s) => s.id);
    const events = (subs.data ?? []).flatMap((s) => (s.event_id ? [s.event_id] : []));
    if (ids.length)
      await service
        .from("decisions")
        .delete()
        .in(
          "object_ref",
          ids.map((i) => `submission:${i}`),
        );
    if (ids.length) await service.from("event_submissions").delete().in("id", ids);
    if (events.length) await service.from("event_listings").delete().in("id", events);
  }
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function topic(updatedAt = new Date().toISOString(), state?: string) {
  const t = await service
    .from("topics")
    .insert({
      slug: `aut7-${tag}-${topics.length}`,
      title: "Assunto AUT7",
      updated_at: updatedAt,
      ...(state ? { state } : {}),
    } as never)
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  topics.push(t.data.id);
  return t.data.id;
}
const stateOf = async (id: string) =>
  (await service.from("topics").select("state").eq("id", id).single()).data?.state;

describe("estado do assunto: correção publicada", () => {
  it("publicar uma correção marca o assunto como corrigido", async () => {
    const t = await topic();
    const a = await service
      .from("articles")
      .insert({
        slug: `aut7-${tag}-a`,
        kind: "original",
        topic_id: t,
        section_slug: "cidade",
        title: "Matéria com correção",
        dek: "Linha fina.",
        body: { type: "doc", content: [] },
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (a.error) throw new Error(a.error.message);
    articles.push(a.data.id);
    const c = await service
      .from("corrections")
      .insert({
        article_id: a.data.id,
        kind: "correction",
        public_note: "Corrigimos o número de vagas.",
        requested_by: "leitor",
      })
      .select("id")
      .single();
    expect(await stateOf(t)).toBe("em_apuracao");
    await service
      .from("corrections")
      .update({ published_at: new Date().toISOString() })
      .eq("id", c.data!.id);
    expect(await stateOf(t)).toBe("corrigido");
  });
});

describe("topic_close_stale: encerrado depois de 7 dias sem novidade", () => {
  it("fecha o assunto parado há mais de 7 dias e preserva o recente", async () => {
    const old = await topic(daysAgo(8), "confirmado");
    const fresh = await topic(daysAgo(2), "confirmado");
    const r = await service.rpc("topic_close_stale");
    expect(r.error).toBeNull();
    expect(await stateOf(old)).toBe("encerrado");
    expect(await stateOf(fresh)).toBe("confirmado");
  });

  it("item coletado recente conta como novidade", async () => {
    const t = await topic(daysAgo(10));
    const { data: src } = await service
      .from("sources")
      .select("id")
      .eq("slug", "mt-agora")
      .single();
    const item = await service
      .from("collected_items")
      .insert({
        source_id: src!.id,
        canonical_url: `https://mtagora.example/aut7-${tag}`,
        original_title: "Novo item",
        topic_id: t,
      })
      .select("id")
      .single();
    items.push(item.data!.id);
    await service.rpc("topic_close_stale");
    expect(await stateOf(t)).toBe("em_apuracao");
  });

  it("aceita relógio e prazo de teste", async () => {
    const t = await topic(daysAgo(2));
    await service.rpc("topic_close_stale", { p_now: new Date().toISOString(), p_days: 1 });
    expect(await stateOf(t)).toBe("encerrado");
  });
});

describe("agenda de leitor com aprovação automática (A14)", () => {
  const email = (n: string) => {
    const e = `leitor-${tag}-${n}@example.com`;
    emails.push(e);
    return e;
  };
  const future = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
  const base = (over: Record<string, unknown> = {}) => ({
    title: `Sarau de outubro ${tag}`,
    startsAt: future(),
    endsAt: null,
    venue: "Arena Pantanal",
    neighborhood: null,
    priceCents: null,
    ageRating: "livre",
    link: null,
    description: "Poesia e música ao vivo.",
    contactEmail: email("a"),
    ...over,
  });
  const latest = async (contactEmail: string) =>
    (
      await service
        .from("event_submissions")
        .select("id, status, event_id, decided_by, decision_reason")
        .eq("contact_email", contactEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    ).data!;

  it("data futura, local conhecido, sem link nem palavrão: entra na agenda sozinha", async () => {
    const e = base();
    expect((await saveEventSubmission(e)).ok).toBe(true);
    const s = await latest(e.contactEmail);
    expect(s).toMatchObject({ status: "approved", decided_by: null });
    expect(s.event_id).not.toBeNull();
    const ev = await service
      .from("event_listings")
      .select("title, venue, origin, confirmed_at, category")
      .eq("id", s.event_id!)
      .single();
    expect(ev.data).toMatchObject({ title: e.title, venue: "Arena Pantanal", origin: "reader" });
    expect(ev.data?.confirmed_at).not.toBeNull();
    const d = await service
      .from("decisions")
      .select("step, output")
      .eq("object_ref", `submission:${s.id}`)
      .single();
    expect(d.data).toMatchObject({ step: "event_auto", output: { approved: true } });
  });

  it("local desconhecido, link ou palavrão ficam pendentes para a redação", async () => {
    for (const [n, over] of [
      ["venue", { venue: "Bar do Zé Desconhecido" }],
      ["link", { link: "https://sympla.com.br/evento" }],
      ["prof", { description: "Festa do caralho" }],
    ] as const) {
      const e = base({ ...over, contactEmail: email(n) });
      expect((await saveEventSubmission(e)).ok).toBe(true);
      const s = await latest(e.contactEmail);
      expect(s.status, n).toBe("pending");
      expect(s.event_id, n).toBeNull();
    }
  });

  it("limite diário: a 4ª sugestão do mesmo leitor vai para a redação", async () => {
    const who = email("lim");
    for (let i = 0; i < 3; i++) {
      await saveEventSubmission(base({ title: `Evento ${i} ${tag}`, contactEmail: who }));
    }
    const subs = await service
      .from("event_submissions")
      .select("status")
      .eq("contact_email", who)
      .order("created_at");
    expect((subs.data ?? []).map((x) => x.status)).toEqual(["approved", "approved", "approved"]);
    await saveEventSubmission(base({ title: `Evento 4 ${tag}`, contactEmail: who }));
    expect((await latest(who)).status).toBe("pending");
  });
});
