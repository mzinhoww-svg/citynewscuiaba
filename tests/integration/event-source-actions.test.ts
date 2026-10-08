// @vitest-environment node
// AGM-T6 fix round 1: ativar fonte de eventos roda a prévia (até 6 chamadas ao modelo) e por isso
// passa pela cota do teste de conexão (`source_admin_test`, 30/h por pessoa), além da de escrita.
// Sessão real do seed (Helena), como em source-admin-fixes.test.ts.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.40.50.61" }),
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

const { createServiceClient } = await import("@/lib/db/client");
const { activateSourceAction, sourceStatusAction } =
  await import("@/app/estudio/control/fontes/actions");

const HELENA_ID = "c1000000-0000-4000-8000-000000000001";
const ID = "f6000000-0000-4000-8000-000000000002";
const svc = createServiceClient();
const KEY = createHash("sha256").update(`user:${HELENA_ID}`).digest("hex");

async function clearLimits() {
  await svc.from("rate_limits").delete().eq("bucket", "agenda").eq("key_hash", "agm-t6-ativacao");
  await svc.from("rate_limits").delete().eq("bucket", "source_admin_test").eq("key_hash", KEY);
  await svc.from("rate_limits").delete().eq("bucket", "source_admin_write").eq("key_hash", KEY);
}

beforeAll(async () => {
  vi.stubEnv("CRAWLER_FIXTURES", "1");
  vi.stubEnv("AI_PROVIDER", "fake");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const r = await client.auth.signInWithPassword({
    email: "helena.costa@citynews.local",
    password: "citynews-local-123",
  });
  if (r.error) throw r.error;
  state.client = client as unknown as DbClient;
  await svc.from("sources").delete().eq("id", ID);
  const ins = await svc.from("sources").insert({
    id: ID,
    slug: "agm-t6-ativacao",
    name: "Teatro da ativação (fictício)",
    base_url: "https://teatro-cerrado.example/",
    kind: "events",
    locality: "cuiaba",
    status: "paused",
    status_reason: "pending_activation",
    extract_kind: "ai_page",
    event_origin: "organizer",
    confirms: true,
  });
  if (ins.error) throw new Error(ins.error.message);
  await clearLimits();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await clearLimits();
  await svc.from("agenda_extract_cache").delete().like("url", "%teatro-cerrado.example%");
  await svc.from("sources").delete().eq("id", ID);
});

/** Esgota a cota do teste de conexão (30/h) desta pessoa. */
async function exhaustTestLimit() {
  for (let i = 0; i < 30; i++) {
    const r = await svc.rpc("hit_rate_limit", {
      p_bucket: "source_admin_test",
      p_key_hash: KEY,
      p_limit: 30,
      p_window_seconds: 3600,
    });
    if (r.error) throw new Error(r.error.message);
  }
}

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

describe("ativação de fonte de eventos usa a cota do teste de conexão", () => {
  it("com a cota esgotada, Ativar e Retomar recusam sem rodar a prévia", async () => {
    await exhaustTestLimit();
    const row = (await svc.from("sources").select("version").eq("id", ID).single()).data!;
    const viaStatus = await sourceStatusAction(
      form({ id: ID, version: String(row.version), action: "activate" }),
    );
    expect(viaStatus).toMatchObject({ ok: false, message: expect.stringMatching(/testou muitas/) });
    const viaActivate = await activateSourceAction(form({ id: ID, version: String(row.version) }));
    expect(viaActivate).toMatchObject({
      ok: false,
      message: expect.stringMatching(/testou muitas/),
    });
    const after = (await svc.from("sources").select("status").eq("id", ID).single()).data!;
    expect(after.status).toBe("paused");
    // Nenhuma página lida: a prévia não rodou.
    const cache = await svc
      .from("agenda_extract_cache")
      .select("url")
      .like("url", "%teatro-cerrado.example%");
    expect(cache.data).toEqual([]);
  });

  it("com cota, ativa (prévia com 1 evento aprovado ou mais)", async () => {
    await clearLimits();
    const row = (await svc.from("sources").select("version").eq("id", ID).single()).data!;
    const r = await activateSourceAction(form({ id: ID, version: String(row.version) }));
    expect(r).toMatchObject({ ok: true, message: "Fonte ativada" });
  });
});
