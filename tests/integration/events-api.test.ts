// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/events/route";
import { createServiceClient } from "@/lib/db/client";
import { err, ok } from "@/lib/result";
import { handleEvents, type EventsDeps } from "@/lib/events/api";

const IP = `192.0.2.${Math.floor(Math.random() * 250) + 1}`;
const anonIds: string[] = [];

function event(over: Record<string, unknown> = {}) {
  const anonId = randomUUID();
  anonIds.push(anonId);
  return {
    name: "article_read",
    anonId,
    userId: null,
    at: new Date().toISOString(),
    sourceId: "folha-do-cerrado",
    contentId: "article:1",
    session: { id: randomUUID(), page: "/materia/x", referrer: null, device: "mobile" },
    consent: { version: "v1", metrics: true, personalization: true },
    algoVersion: "rec-v1",
    props: { seconds: 45, scrollPct: 60 },
    ...over,
  };
}

const post = (body: unknown, ip = IP) =>
  new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "text/plain", "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("/api/events", () => {
  it("grava com received_at do servidor e sem IP", async () => {
    const e = event();
    const res = await POST(post(e));
    expect(res.status).toBe(204);
    const { data } = await createServiceClient()
      .from("events")
      .select("*")
      .eq("anon_id", e.anonId)
      .single();
    expect(data).toMatchObject({
      name: "article_read",
      anon_id: e.anonId,
      user_id: null,
      source_slug: "folha-do-cerrado",
      content_ref: "article:1",
      props: { seconds: 45, scrollPct: 60 },
    });
    expect(Date.now() - Date.parse(data!.received_at)).toBeLessThan(60_000);
    expect(JSON.stringify(data)).not.toContain(IP);
  });

  it("só métricas grava sem identificador", async () => {
    const res = await POST(
      post(
        event({
          anonId: null,
          session: { id: "-", page: "/", referrer: null, device: "desktop" },
          consent: { version: "v1", metrics: true, personalization: false },
          name: "privacy_settings_updated",
          contentId: null,
          sourceId: null,
          props: { metrics: true, personalization: false },
        }),
      ),
    );
    expect(res.status).toBe(204);
  });

  it("400 em payload inválido, anonId sem personalização ou prop fora do plano", async () => {
    expect((await POST(post("{"))).status).toBe(400);
    expect(
      (
        await POST(
          post(event({ consent: { version: "v1", metrics: true, personalization: false } })),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(post(event({ props: { seconds: 45, scrollPct: 60, religiao: "x" } })))).status,
    ).toBe(400);
    expect((await POST(post(event({ at: "2020-01-01T00:00:00Z" })))).status).toBe(400);
  });

  it("413 em corpo grande", async () => {
    expect((await POST(post("x".repeat(9000)))).status).toBe(413);
  });

  it("429 quando o limite estoura e 503 sem banco", async () => {
    const deps = (over: Partial<EventsDeps>): EventsDeps => ({
      insert: async () => ok(undefined),
      hitLimit: async () => ok(true),
      salt: "s",
      now: () => new Date(),
      ...over,
    });
    const ip = `198.18.0.${Math.floor(Math.random() * 250) + 1}`;
    expect(
      (await handleEvents(post(event(), ip), deps({ hitLimit: async () => ok(false) }))).status,
    ).toBe(429);
    expect(
      (
        await handleEvents(
          post(event(), ip),
          deps({
            hitLimit: async () => err({ kind: "unconfigured" }),
            insert: async () => err({ kind: "unconfigured" }),
          }),
        )
      ).status,
    ).toBe(503);
  });

  it("chave do limite é o hash do IP com sal do dia, nunca o IP", async () => {
    const keys: string[] = [];
    const deps: EventsDeps = {
      insert: async () => ok(undefined),
      hitLimit: async (k) => {
        keys.push(k);
        return ok(true);
      },
      salt: "sal",
      now: () => new Date(),
    };
    await handleEvents(post(event(), "203.0.113.9"), deps);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys[0]).not.toContain("203.0.113.9");
  });

  afterAll(async () => {
    const db = createServiceClient();
    await db.from("events").delete().in("anon_id", anonIds);
    await db.from("events").delete().eq("name", "privacy_settings_updated").is("anon_id", null);
  });
});
