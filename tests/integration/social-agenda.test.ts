// @vitest-environment node
// ARD-T6: pacote "Agenda da semana" do Instagram contra o banco local. Semanas distantes (sem
// evento do seed), eventos fictícios; os PNGs vão para o armazenamento em memória da pilha local
// (`SOCIAL_STORE=memory`, A-017). Comandos do Estúdio rodam como usuários de seed (RLS valendo).
import { strFromU8, unzipSync } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/jobs/social-agenda/route";
import { createServiceClient } from "@/lib/db/client";
import { addDays } from "@/lib/format/date";
import { socialRef } from "@/lib/social/build-package";
import { weekRange } from "@/lib/social/pick-week";
import {
  approveSocialPackage,
  discardSocialPackage,
  markSocialPublished,
  regenerateSocialPackage,
  socialSlide,
  socialZip,
} from "@/lib/studio/social-package";
import { asUser, SEED_USERS } from "./studio";

vi.setConfig({ testTimeout: 60_000 });

const SECRET = "segredo-de-teste-do-job-social-agenda-32+chars";
const db = createServiceClient();
const TAG = `ard-t6-${Date.now().toString(36)}`;
const pick = (offset: number) =>
  weekRange(new Date(), addDays("2036-01-07", 7 * ((Date.now() % 300) + offset))).weekStart;
const EMPTY_WEEK = pick(0);
const WEEK = pick(400);
const slugs: string[] = [];
const ids: string[] = [];

const event = (n: number, extra: Record<string, unknown> = {}) => {
  const slug = `${TAG}-${n}`;
  slugs.push(slug);
  return {
    slug,
    title: `Forró ${n} ${TAG}`,
    starts_at: new Date(
      `${addDays(WEEK, 2)}T${String(10 + n).padStart(2, "0")}:00:00-04:00`,
    ).toISOString(),
    venue: `Praça Fictícia ${n}`,
    category: "musica",
    origin: "newsroom",
    price_cents: n === 2 ? 4000 : 0,
    confirmed_at: new Date().toISOString(),
    ...extra,
  };
};

const run = (week: string, auth = `Bearer ${SECRET}`) =>
  POST(
    new Request(`http://localhost/api/jobs/social-agenda?semana=${week}`, {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    }),
  );

const row = async (week: string) => {
  const r = await db
    .from("social_packages")
    .select("id, status, items, caption, assets, error, excluded, approved_by, published_url")
    .eq("kind", "instagram_agenda")
    .eq("week_start", week);
  if (r.error) throw r.error;
  return r.data;
};

const audits = async (week: string, action: string) =>
  (
    await db
      .from("audit_log")
      .select("actor, action, details")
      .eq("object_ref", socialRef(week))
      .eq("action", action)
  ).data ?? [];

beforeAll(async () => {
  const ins = await db
    .from("event_listings")
    .insert([
      event(1),
      event(2),
      event(3, { withdrawn_at: new Date().toISOString() }),
      event(4, { confirmed_at: null }),
    ])
    .select("id, slug");
  if (ins.error) throw ins.error;
  for (const r of ins.data) ids.push(r.id);
});

afterAll(async () => {
  await db.from("event_listings").delete().in("slug", slugs);
  for (const w of [EMPTY_WEEK, WEEK]) {
    await db.from("social_packages").delete().eq("kind", "instagram_agenda").eq("week_start", w);
    await db.from("audit_log").delete().eq("object_ref", socialRef(w));
  }
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("SOCIAL_STORE", "memory");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/jobs/social-agenda", () => {
  it("sem o segredo: 401 e nada gravado", async () => {
    expect((await run(EMPTY_WEEK, "")).status).toBe(401);
    expect((await run(EMPTY_WEEK, "Bearer errado-errado-errado-errado-errado")).status).toBe(401);
    expect(await row(EMPTY_WEEK)).toEqual([]);
  });

  it("semana sem eventos: rascunho vazio, sem PNG, auditado como system:agenda", async () => {
    const res = await run(EMPTY_WEEK);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "empty", status: "draft", events: 0 });
    const [p] = await row(EMPTY_WEEK);
    expect(p).toMatchObject({ status: "draft", items: [], assets: [], error: null });
    const a = await audits(EMPTY_WEEK, "social.build");
    expect(a).toHaveLength(1);
    expect(a[0]?.actor).toBe("system:agenda");
  });

  it("monta os PNGs da semana (só confirmados e não retirados) e é idempotente", async () => {
    const res = await run(WEEK);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ outcome: "built", events: 2, slides: 4 });
    const [p] = await row(WEEK);
    expect(p?.status).toBe("draft");
    expect(p?.assets).toEqual([1, 2, 3, 4].map((i) => `${WEEK}/0${i}.png`));
    const titles = (p?.items as { title: string }[]).map((i) => i.title);
    expect(titles).toEqual([`Forró 1 ${TAG}`, `Forró 2 ${TAG}`]);
    expect(p?.caption).toContain(
      "Confirme horários e valores na fonte oficial antes de sair de casa.",
    );

    const again = await run(WEEK);
    expect(again.status).toBe(200);
    const rows = await row(WEEK);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(p?.id);
  });
});

describe("Estúdio: regerar, aprovar, ZIP e publicar", () => {
  it("slide sai do bucket privado para quem tem a editoria Agenda; PNG 1080×1350", async () => {
    const r = await asUser("otavio", () => socialSlide(WEEK, 0));
    if (!r.ok) throw new Error(r.error);
    const v = new DataView(r.value.buffer, r.value.byteOffset, r.value.byteLength);
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([1080, 1350]);
    expect(await asUser("juliana", () => socialSlide(WEEK, 0))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("Regerar tirando um evento: sai do pacote, fica gravado e auditado com a pessoa", async () => {
    const r = await asUser("otavio", () => regenerateSocialPackage(WEEK, { exclude: [ids[0]!] }));
    if (!r.ok) throw new Error(r.error);
    expect(r.value).toMatchObject({ outcome: "built", events: 1, slides: 3 });
    const [p] = await row(WEEK);
    expect(p?.excluded).toEqual([ids[0]]);
    expect(p?.assets).toHaveLength(3);
    const a = await audits(WEEK, "social.regenerate");
    expect(a).toHaveLength(1);
    expect(a[0]?.actor).toBe(SEED_USERS.otavio.id);
  });

  it("sem a editoria Agenda: aprovar é barrado e a negação é auditada", async () => {
    const r = await asUser("juliana", () => approveSocialPackage(WEEK));
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await audits(WEEK, "social.approve.denied")).toHaveLength(1);
    expect((await row(WEEK))[0]?.status).toBe("draft");
  });

  it("ZIP recusado antes da aprovação", async () => {
    expect(await asUser("otavio", () => socialZip(WEEK))).toEqual({
      ok: false,
      error: "not_ready",
    });
  });

  it("aprovar grava quem e quando, audita; o job não sobrescreve o aprovado", async () => {
    const r = await asUser("otavio", () => approveSocialPackage(WEEK));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.status).toBe("approved");
    const [p] = await row(WEEK);
    expect(p).toMatchObject({ status: "approved", approved_by: SEED_USERS.otavio.id });
    expect(await audits(WEEK, "social.approve")).toHaveLength(1);

    const job = await run(WEEK);
    expect(await job.json()).toMatchObject({ outcome: "skipped", status: "approved" });
    const [after] = await row(WEEK);
    expect(after).toEqual(p);
    // Regerar também não mexe no aprovado.
    expect(await asUser("otavio", () => regenerateSocialPackage(WEEK))).toEqual({
      ok: false,
      error: "invalid_state",
    });
  });

  it("ZIP depois de aprovado: PNGs, caption.txt e creditos.txt", async () => {
    const r = await asUser("otavio", () => socialZip(WEEK));
    if (!r.ok) throw new Error(r.error);
    const files = unzipSync(r.value.bytes);
    expect(Object.keys(files).sort()).toEqual(
      ["01.png", "02.png", "03.png", "caption.txt", "creditos.txt"].sort(),
    );
    expect(strFromU8(files["caption.txt"]!)).toContain(`Forró 2 ${TAG}`);
    expect(strFromU8(files["creditos.txt"]!)).toContain("Slide 02");
    expect(await asUser("juliana", () => socialZip(WEEK))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("marcar como publicado só com link do Instagram; audita", async () => {
    for (const bad of [
      "http://www.instagram.com/p/abc/",
      "https://instagram.com.example/p/abc/",
      "https://www.instagram.com/",
      "javascript:alert(1)",
    ]) {
      expect(await asUser("otavio", () => markSocialPublished(WEEK, bad))).toEqual({
        ok: false,
        error: "invalid_url",
      });
    }
    const url = "https://www.instagram.com/p/ABC123exemplo/";
    const r = await asUser("otavio", () => markSocialPublished(WEEK, url));
    if (!r.ok) throw new Error(r.error);
    expect((await row(WEEK))[0]).toMatchObject({ status: "published", published_url: url });
    const a = await audits(WEEK, "social.publish");
    expect(a[0]?.details).toMatchObject({ url });
  });

  it("publicado não é descartado; rascunho vazio é descartado e auditado", async () => {
    expect(await asUser("otavio", () => discardSocialPackage(WEEK))).toEqual({
      ok: false,
      error: "invalid_state",
    });
    const r = await asUser("otavio", () => discardSocialPackage(EMPTY_WEEK));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.status).toBe("discarded");
    expect(await audits(EMPTY_WEEK, "social.discard")).toHaveLength(1);
    // O job não ressuscita o descartado.
    expect(await (await run(EMPTY_WEEK)).json()).toMatchObject({ outcome: "skipped" });
  });
});
