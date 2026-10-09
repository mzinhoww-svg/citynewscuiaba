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
  instagramPostUrl,
  markSocialPublished,
  readSocialPackage,
  regenerateSocialPackage,
  socialSlide,
  socialZip,
} from "@/lib/studio/social-package";
import type { Database } from "@/lib/db/types";
import { asUser, clientOf, SEED_USERS } from "./studio";

vi.setConfig({ testTimeout: 60_000 });

const SECRET = "segredo-de-teste-do-job-social-agenda-32+chars";
const db = createServiceClient();
const TAG = `ard-t6-${Date.now().toString(36)}`;
const pick = (offset: number) =>
  weekRange(new Date(), addDays("2036-01-07", 7 * ((Date.now() % 300) + offset))).weekStart;
const EMPTY_WEEK = pick(0);
const WEEK = pick(400);
const RIGHTS_WEEK = pick(800);
const GUARD_WEEK = pick(1200);
const assets: string[] = [];
const slugs: string[] = [];
const ids: string[] = [];

const event = (n: number, extra: Record<string, unknown> = {}, week = WEEK) => {
  const slug = `${TAG}-${week}-${n}`;
  slugs.push(slug);
  return {
    slug,
    title: `Forró ${n} ${TAG}`,
    starts_at: new Date(
      `${addDays(week, 2)}T${String(10 + n).padStart(2, "0")}:00:00-04:00`,
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
    .select(
      "id, status, items, caption, assets, error, excluded, approved_by, published_url, generated_at",
    )
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
      event(1, {}, RIGHTS_WEEK),
      event(1, {}, GUARD_WEEK),
    ])
    .select("id, slug");
  if (ins.error) throw ins.error;
  for (const r of ins.data) ids.push(r.id);
});

afterAll(async () => {
  await db.from("event_listings").delete().in("slug", slugs);
  for (const w of [EMPTY_WEEK, WEEK, RIGHTS_WEEK, GUARD_WEEK]) {
    await db.from("social_packages").delete().eq("kind", "instagram_agenda").eq("week_start", w);
    await db.from("audit_log").delete().eq("object_ref", socialRef(w));
  }
  if (assets.length) await db.from("media_assets").delete().in("id", assets);
});

const gen = async (week: string) => (await row(week))[0]?.generated_at ?? null;

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
    const paths = p?.assets as string[];
    expect(paths).toHaveLength(4);
    paths.forEach((path, i) =>
      expect(path).toMatch(new RegExp(`^${WEEK}/[a-z0-9]+/0${i + 1}\\.png$`)),
    );
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
    // Nova geração, nova pasta; a anterior foi apagada do Storage.
    expect(rows[0]?.generated_at).not.toBe(p?.generated_at);
    const folder = (x: unknown) => String((x as string[])[0]).split("/")[1];
    expect(folder(rows[0]?.assets)).not.toBe(folder(p?.assets));
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
    const seen = await gen(WEEK);
    const r = await asUser("juliana", () => approveSocialPackage(WEEK, seen));
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

  it("geração diferente da que a pessoa viu: aprovação recusada (changed)", async () => {
    expect(
      await asUser("otavio", () => approveSocialPackage(WEEK, "2001-01-01T00:00:00.000Z")),
    ).toEqual({
      ok: false,
      error: "changed",
    });
    expect((await row(WEEK))[0]?.status).toBe("draft");
  });

  it("aprovar grava quem e quando, audita; o job não sobrescreve o aprovado", async () => {
    const seen = await gen(WEEK);
    const r = await asUser("otavio", () => approveSocialPackage(WEEK, seen));
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
      "https://www.instagram.com/explore/tags/cuiaba/",
      "javascript:alert(1)",
    ]) {
      expect(await asUser("otavio", () => markSocialPublished(WEEK, bad))).toEqual({
        ok: false,
        error: "invalid_url",
      });
    }
    const url = "https://www.instagram.com/p/ABC123exemplo/";
    // Sem o www também vale; o link é gravado normalizado.
    const r = await asUser("otavio", () =>
      markSocialPublished(WEEK, "https://instagram.com/p/ABC123exemplo"),
    );
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

describe("link do post", () => {
  it("normaliza instagram.com para www e aceita só /p/, /reel/ e /tv/", () => {
    expect(instagramPostUrl("https://instagram.com/p/AbC_1")).toBe(
      "https://www.instagram.com/p/AbC_1/",
    );
    expect(instagramPostUrl("https://www.instagram.com/tv/X9/")).toBe(
      "https://www.instagram.com/tv/X9/",
    );
    for (const bad of [
      "https://www.instagram.com/citycuiabaa/",
      "https://www.instagram.com:8443/p/X/",
      "https://user:pw@www.instagram.com/p/X/",
      "https://m.instagram.com/p/X/",
    ])
      expect(instagramPostUrl(bad), bad).toBeNull();
  });
});

describe("direitos da foto conferidos de novo na aprovação e no ZIP", () => {
  let asset = "";
  const setAsset = (fields: Database["public"]["Tables"]["media_assets"]["Update"]) =>
    db.from("media_assets").update(fields).eq("id", asset);

  beforeAll(async () => {
    const m = await db
      .from("media_assets")
      .insert({
        kind: "reproduction",
        storage_path: `reproducao/${TAG}.jpg`,
        origin_url: `https://forro.example/${TAG}.jpg`,
        page_url: "https://forro.example/praca",
        source_name: "Fonte",
        license: "reproducao",
        allowed_use: "event",
        credit: "Foto: reprodução web · Fonte",
        status: "approved",
        width: 1200,
        height: 800,
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    asset = m.data.id;
    assets.push(asset);
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SOCIAL_STORE", "memory");
    expect(await (await run(RIGHTS_WEEK)).json()).toMatchObject({ outcome: "built" });
    // A pilha local não tem os bytes: a foto entra no item como se tivesse entrado no slide.
    const [p] = await row(RIGHTS_WEEK);
    const items = (p?.items as Record<string, unknown>[]).map((it) => ({
      ...it,
      image: { assetId: asset, credit: "Fonte", originUrl: "https://forro.example/praca" },
    }));
    const u = await db
      .from("social_packages")
      .update({ items })
      .eq("kind", "instagram_agenda")
      .eq("week_start", RIGHTS_WEEK);
    if (u.error) throw u.error;
  });

  it("foto bloqueada: aprovar dá image_rights; liberada de novo, aprova", async () => {
    await setAsset({ status: "blocked" });
    const seen = await gen(RIGHTS_WEEK);
    expect(await asUser("otavio", () => approveSocialPackage(RIGHTS_WEEK, seen))).toEqual({
      ok: false,
      error: "image_rights",
    });
    await setAsset({ status: "approved" });
    const r = await asUser("otavio", () => approveSocialPackage(RIGHTS_WEEK, seen));
    expect(r.ok).toBe(true);
  });

  it("foto retirada depois de aprovado: ZIP recusado e a tela lista o evento", async () => {
    expect((await asUser("otavio", () => socialZip(RIGHTS_WEEK))).ok).toBe(true);
    await setAsset({ removed_at: new Date().toISOString() });
    expect(await asUser("otavio", () => socialZip(RIGHTS_WEEK))).toEqual({
      ok: false,
      error: "image_rights",
    });
    const view = await asUser("otavio", () => readSocialPackage(RIGHTS_WEEK));
    if (!view.ok) throw new Error(view.error);
    expect(view.value.revokedImages.map((i) => i.title)).toEqual([`Forró 1 ${TAG}`]);
  });

  it("flag de reprodução desligada também derruba a foto", async () => {
    await setAsset({ removed_at: null });
    const flag = await db
      .from("feature_flags")
      .update({ enabled: false })
      .eq("key", "image_reproduction_enabled");
    if (flag.error) throw flag.error;
    try {
      expect((await asUser("otavio", () => socialZip(RIGHTS_WEEK))).ok).toBe(false);
    } finally {
      await db
        .from("feature_flags")
        .update({ enabled: true })
        .eq("key", "image_reproduction_enabled");
    }
    expect((await asUser("otavio", () => socialZip(RIGHTS_WEEK))).ok).toBe(true);
  });
});

describe("trava no banco (0208): a editoria não pula etapas pelo PostgREST", () => {
  const direct = async () => clientOf("otavio");
  const where = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    q.eq("kind", "instagram_agenda").eq("week_start", GUARD_WEEK);

  beforeAll(async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SOCIAL_STORE", "memory");
    expect(await (await run(GUARD_WEEK)).json()).toMatchObject({ outcome: "built" });
  });

  it("aprovar em nome de outra pessoa é recusado", async () => {
    const u = await where(
      (await direct())
        .from("social_packages")
        .update({ status: "approved", approved_by: SEED_USERS.helena.id }),
    );
    expect(u.error?.code).toBe("42501");
    expect((await row(GUARD_WEEK))[0]?.status).toBe("draft");
  });

  it("rascunho direto para publicado é recusado", async () => {
    const u = await where(
      (await direct())
        .from("social_packages")
        .update({ status: "published", published_url: "https://www.instagram.com/p/X1/" }),
    );
    expect(u.error?.code).toBe("42501");
  });

  it("trocar PNGs, legenda ou inserir pacote já aprovado é recusado", async () => {
    const db2 = await direct();
    expect(
      (await where(db2.from("social_packages").update({ assets: ["x/../y.png"] }))).error?.code,
    ).toBe("42501");
    expect(
      (await where(db2.from("social_packages").update({ caption: "outra" }))).error?.code,
    ).toBe("42501");
    const ins = await db2.from("social_packages").insert({
      kind: "instagram_agenda",
      week_start: addDays(GUARD_WEEK, 7),
      status: "approved",
      approved_by: SEED_USERS.otavio.id,
    });
    expect(ins.error?.code).toBe("42501");
  });

  it("a aprovação direta grava a própria pessoa e a hora do banco; publicar exige link válido", async () => {
    const db2 = await direct();
    const before = Date.now();
    const u = await where(
      db2
        .from("social_packages")
        .update({ status: "approved", approved_at: "2001-01-01T00:00:00Z" }),
    )
      .select("approved_by, approved_at")
      .single();
    expect(u.error).toBeNull();
    expect(u.data?.approved_by).toBe(SEED_USERS.otavio.id);
    expect(Date.parse(u.data!.approved_at!)).toBeGreaterThanOrEqual(before - 60_000);
    const bad = await where(
      db2
        .from("social_packages")
        .update({ status: "published", published_url: "https://evil.example/" }),
    );
    expect(bad.error?.code).toBe("42501");
    // A ação do Estúdio continua funcionando.
    const ok = await asUser("otavio", () =>
      markSocialPublished(GUARD_WEEK, "https://www.instagram.com/reel/Abc_1-2/"),
    );
    expect(ok.ok).toBe(true);
  });

  it("apagar o pacote pelo PostgREST é recusado (só Descartar)", async () => {
    const del = await where((await direct()).from("social_packages").delete());
    expect(del.error?.code).toBe("42501");
    expect(await row(GUARD_WEEK)).toHaveLength(1);
  });
});
