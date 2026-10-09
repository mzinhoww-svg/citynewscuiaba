// @vitest-environment node
// ARD-T5: job da newsletter "Agenda do fim de semana" contra o banco local. Fim de semana
// distante (sem evento do seed), eventos e inscrição fictícios; a leitura pública é a do anon.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/jobs/newsletter-agenda/route";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { getLatestPublicEdition, getPublicEdition } from "@/lib/db/newsletter-editions";
import { addDays } from "@/lib/format/date";

vi.setConfig({ testTimeout: 30_000 });

const SECRET = "segredo-de-teste-do-job-newsletter-agenda-32+";
const db = createServiceClient();
const anon = createPublicClient();
const TAG = `ard-t5-${Date.now().toString(36)}`;
// Uma sexta distante e única por execução (2034–2043), sem eventos do seed.
const FRIDAY = addDays("2034-01-06", 7 * (Date.now() % 520));
const THURSDAY_NOON = new Date(`${addDays(FRIDAY, -1)}T11:45:00-04:00`).toISOString();
const EMAIL = `${TAG}@exemplo.example`;
const slugs: string[] = [];

const event = (n: number, extra: Record<string, unknown> = {}) => {
  const slug = `${TAG}-${n}`;
  slugs.push(slug);
  return {
    slug,
    title: `Forró ${n} ${TAG}`,
    starts_at: new Date(
      `${addDays(FRIDAY, 1)}T${String(10 + n).padStart(2, "0")}:00:00-04:00`,
    ).toISOString(),
    venue: "Praça Fictícia",
    category: "musica",
    origin: "newsroom",
    price_cents: 0,
    confirmed_at: new Date().toISOString(),
    ...extra,
  };
};

const run = (auth = `Bearer ${SECRET}`, now = THURSDAY_NOON) =>
  POST(
    new Request(`http://localhost/api/jobs/newsletter-agenda?now=${encodeURIComponent(now)}`, {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  );

const editionRows = () =>
  db
    .from("newsletter_editions")
    .select("id, status, published_at, sent_at, html, items")
    .eq("list", "agenda-fds")
    .eq("edition_date", FRIDAY);

beforeAll(async () => {
  const ins = await db
    .from("event_listings")
    .insert([
      event(1),
      event(2),
      event(3, { withdrawn_at: new Date().toISOString() }),
      event(4, { confirmed_at: null }),
    ]);
  if (ins.error) throw ins.error;
  const sub = await db.from("newsletter_subscriptions").insert({
    email: EMAIL,
    list: "agenda-fds",
    confirmed_at: new Date().toISOString(),
    token_hash: "x".repeat(64),
  });
  if (sub.error) throw sub.error;
});

afterAll(async () => {
  await db.from("event_listings").delete().in("slug", slugs);
  await db.from("newsletter_editions").delete().eq("list", "agenda-fds").eq("edition_date", FRIDAY);
  await db.from("newsletter_subscriptions").delete().eq("email", EMAIL);
});

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/jobs/newsletter-agenda", () => {
  it("recusa sem o segredo ou com segredo errado", async () => {
    expect((await run("")).status).toBe(401);
    expect((await run("Bearer errado")).status).toBe(401);
    expect((await editionRows()).data).toEqual([]);
  });

  it("now inválido: 400", async () => {
    expect((await run(undefined, "ontem")).status).toBe(400);
  });

  it("menos de 3 eventos públicos (retirado e sem confirmação fora): rascunho, página não lê", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "draft",
      reason: "few_events",
      items: 2,
      editionDate: FRIDAY,
    });
    const rows = (await editionRows()).data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("draft");
    expect(rows[0]?.published_at).toBeNull();
    const pub = await getPublicEdition("agenda-fds", FRIDAY);
    expect(pub).toEqual({ ok: true, value: null });
    const audit = await db
      .from("audit_log")
      .select("actor, action, details")
      .eq("object_ref", `newsletter:agenda-fds:${FRIDAY}`);
    expect(audit.data?.[0]).toMatchObject({
      actor: "system:agenda",
      action: "newsletter.edition",
      details: expect.objectContaining({ status: "draft" }),
    });
  });

  it("com 3 eventos e sem provedor: publicada na web, aguardando_provedor; idempotente", async () => {
    const ins = await db.from("event_listings").insert(event(5));
    expect(ins.error).toBeNull();
    const first = await (await run()).json();
    expect(first).toMatchObject({ status: "aguardando_provedor", items: 3, recipients: 1 });
    const rows = (await editionRows()).data ?? [];
    expect(rows).toHaveLength(1);
    const id = rows[0]?.id;
    const publishedAt = rows[0]?.published_at;
    expect(publishedAt).not.toBeNull();
    expect(rows[0]?.html).toContain("{{unsubscribe_url}}");

    const pub = await getPublicEdition("agenda-fds", FRIDAY);
    expect(pub.ok && pub.value?.items.map((i) => i.title)).toEqual([
      `Forró 1 ${TAG}`,
      `Forró 2 ${TAG}`,
      `Forró 5 ${TAG}`,
    ]);
    expect(pub.ok && pub.value?.items[0]?.url).toMatch(new RegExp(`/agenda/${TAG}-1$`));
    const anonRead = await anon
      .from("newsletter_editions")
      .select("status")
      .eq("edition_date", FRIDAY);
    expect(anonRead.data).toEqual([{ status: "aguardando_provedor" }]);

    // Sábado: mesma edição, mesma linha, mesma data de publicação.
    const again = await (await run(undefined, `${addDays(FRIDAY, 1)}T12:00:00-04:00`)).json();
    expect(again).toMatchObject({ status: "aguardando_provedor", editionDate: FRIDAY });
    const after = (await editionRows()).data ?? [];
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(id);
    expect(after[0]?.published_at).toBe(publishedAt);

    const latest = await getLatestPublicEdition("agenda-fds");
    expect(latest.ok && latest.value?.editionDate).toBeTruthy();
  });

  it("edição já enviada não é reescrita nem reenviada", async () => {
    const upd = await db
      .from("newsletter_editions")
      .update({ status: "sent", sent_at: new Date().toISOString(), html: "<p>enviada</p>" })
      .eq("list", "agenda-fds")
      .eq("edition_date", FRIDAY);
    expect(upd.error).toBeNull();
    expect(await (await run()).json()).toMatchObject({ status: "sent", skipped: true });
    const rows = (await editionRows()).data ?? [];
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.html).toBe("<p>enviada</p>");
  });
});
