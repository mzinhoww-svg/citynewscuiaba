// @vitest-environment node
// ARD-T1: campos ricos do evento, edições da newsletter e pacotes sociais.
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createServiceClient } from "@/lib/db/client";
import { AGENDA_AUDIT_ACTIONS } from "@/lib/audit/actions";

const db = createServiceClient();
const anon = createPublicClient();
const slugs: string[] = [];

const listing = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  title: `Evento ${slug}`,
  starts_at: "2027-03-10T22:00:00Z",
  venue: "Teatro Fictício",
  category: "Música",
  origin: "organizer",
  confirmed_at: "2026-10-08T12:00:00Z",
  ...extra,
});

afterAll(async () => {
  if (slugs.length) await db.from("event_listings").delete().in("slug", slugs);
  await db.from("newsletter_editions").delete().like("subject", "ard-t1%");
  await db.from("social_packages").delete().eq("week_start", "2031-01-06");
});

describe("event_listings: campos ricos", () => {
  it("tem organizer, media_id, venue_id e featured_until", async () => {
    slugs.push("ard-t1-rico");
    const ins = await db.from("event_listings").insert(
      listing("ard-t1-rico", {
        organizer: "Coletivo Fictício",
        age_rating: "16",
        featured_until: "2027-03-09T00:00:00Z",
      }),
    );
    expect(ins.error).toBeNull();
    const r = await db
      .from("event_listings")
      .select("organizer, media_id, venue_id, featured_until, age_rating")
      .eq("slug", "ard-t1-rico")
      .single();
    expect(r.error).toBeNull();
    expect(r.data?.organizer).toBe("Coletivo Fictício");
    expect(r.data?.media_id).toBeNull();
    expect(r.data?.venue_id).toBeNull();
    expect(r.data?.age_rating).toBe("16");
  });

  it("recusa faixa etária fora da lista e aceita as sete", async () => {
    slugs.push(
      "ard-t1-adulto",
      ...["livre", "10", "12", "14", "16", "18", "consulte"].map((a) => `ard-t1-f-${a}`),
    );
    const bad = await db
      .from("event_listings")
      .insert(listing("ard-t1-adulto", { age_rating: "adulto" }));
    expect(bad.error).not.toBeNull();
    for (const a of ["livre", "10", "12", "14", "16", "18", "consulte"]) {
      const ok = await db
        .from("event_listings")
        .insert(listing(`ard-t1-f-${a}`, { age_rating: a }));
      expect(ok.error).toBeNull();
    }
  });
});

describe("newsletter_editions", () => {
  it("anônimo lê edição publicada e não lê rascunho", async () => {
    const rows = ["draft", "published", "aguardando_provedor", "sent", "failed"].map(
      (status, i) => ({
        list: "agenda-fds",
        edition_date: `2031-01-${String(10 + i).padStart(2, "0")}`,
        subject: `ard-t1 ${status}`,
        html: "<p>x</p>",
        text: "x",
        items: [],
        status,
      }),
    );
    const ins = await db.from("newsletter_editions").insert(rows);
    expect(ins.error).toBeNull();
    const seen = await anon.from("newsletter_editions").select("status").like("subject", "ard-t1%");
    expect(seen.error).toBeNull();
    expect((seen.data ?? []).map((r) => r.status).sort()).toEqual([
      "aguardando_provedor",
      "published",
      "sent",
    ]);
  });

  it("recusa status desconhecido e edição repetida na mesma data", async () => {
    const base = {
      list: "agenda-fds",
      edition_date: "2031-02-01",
      subject: "ard-t1 dup",
      html: "",
      text: "",
      items: [],
    };
    const bad = await db.from("newsletter_editions").insert({ ...base, status: "x" });
    expect(bad.error).not.toBeNull();
    expect(
      (await db.from("newsletter_editions").insert({ ...base, status: "draft" })).error,
    ).toBeNull();
    expect(
      (await db.from("newsletter_editions").insert({ ...base, status: "draft" })).error,
    ).not.toBeNull();
  });

  it("anônimo não escreve", async () => {
    const r = await anon.from("newsletter_editions").insert({
      list: "agenda-fds",
      edition_date: "2031-03-01",
      subject: "ard-t1 anon",
      html: "",
      text: "",
      items: [],
      status: "published",
    });
    expect(r.error).not.toBeNull();
  });
});

describe("social_packages", () => {
  it("anônimo não lê nem escreve; service role grava com unicidade", async () => {
    const row = {
      kind: "instagram_agenda",
      week_start: "2031-01-06",
      status: "draft",
      items: [],
      caption: "c",
      assets: [],
    };
    expect((await db.from("social_packages").insert(row)).error).toBeNull();
    expect((await db.from("social_packages").insert(row)).error).not.toBeNull();
    const seen = await anon.from("social_packages").select("id").eq("week_start", "2031-01-06");
    expect(seen.data ?? []).toEqual([]);
    const w = await anon.from("social_packages").insert({ ...row, week_start: "2031-01-13" });
    expect(w.error).not.toBeNull();
    const bad = await db
      .from("social_packages")
      .insert({ ...row, week_start: "2031-01-13", status: "x" });
    expect(bad.error).not.toBeNull();
  });
});

describe("auditoria e bucket", () => {
  it("studio_audit_actions inclui as ações novas", async () => {
    const r = await db.rpc("studio_audit_actions");
    const list = r.data as string[];
    for (const a of AGENDA_AUDIT_ACTIONS) expect(list).toContain(a);
    for (const a of ["event.feature", "social.approve", "social.publish", "social.discard"]) {
      expect(AGENDA_AUDIT_ACTIONS as readonly string[]).toContain(a);
    }
  });
});
