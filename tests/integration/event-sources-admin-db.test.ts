// @vitest-environment node
// Migration 0197 (AGM-T6): o Painel de Fontes cria e edita fontes de eventos pelas RPCs
// `source_admin_create`/`source_admin_update`, com as colunas de evento de 0195. Pilha local, sem rede.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const asService = createServiceClient();
const created: string[] = [];

let helenaClient: Promise<DbClient> | null = null;
function helena(): Promise<DbClient> {
  if (helenaClient) return helenaClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  helenaClient = client.auth
    .signInWithPassword({ email: "helena.costa@citynews.local", password: SEED_PASSWORD })
    .then((r) => {
      if (r.error) throw r.error;
      return client;
    });
  return helenaClient;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const c = await helena();
  const r = await c.rpc(name as never, args as never);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

async function createEvents(over: Record<string, unknown> = {}) {
  const id = (await rpc("source_admin_create", {
    p: {
      slug: `eventos-${randomUUID().slice(0, 8)}`,
      name: "Casa de Eventos (teste)",
      baseUrl: "https://casa-eventos.example/",
      kind: "events",
      locality: "cuiaba",
      extractKind: "ai_page",
      eventOrigin: "organizer",
      confirms: true,
      collectorNotes: ["Cada show tem página própria."],
      listUrls: ["https://casa-eventos.example/agenda"],
      requireCity: true,
      defaultVenue: "Casa de Eventos",
      ...over,
    },
    p_ctx: {},
  })) as string;
  created.push(id);
  return id;
}

afterAll(async () => {
  if (created.length) await asService.from("sources").delete().in("id", created);
});

describe("source_admin_create com fonte de eventos (0197)", () => {
  it("grava as colunas de evento e nasce pausada aguardando ativação", async () => {
    const id = await createEvents();
    const { data } = await asService.from("sources").select("*").eq("id", id).single();
    expect(data).toMatchObject({
      kind: "events",
      status: "paused",
      status_reason: "pending_activation",
      extract_kind: "ai_page",
      event_origin: "organizer",
      confirms: true,
      collector_notes: ["Cada show tem página própria."],
      list_urls: ["https://casa-eventos.example/agenda"],
      require_city: true,
      default_venue: "Casa de Eventos",
      default_neighborhood: null,
    });
  });

  it("sem tipo de extração, a constraint recusa", async () => {
    await expect(createEvents({ extractKind: "" })).rejects.toThrow(/sources_events_need_extract/);
  });
});

describe("source_admin_update com colunas de evento (0197)", () => {
  it("aceita as colunas de evento e sobe a versão", async () => {
    const id = await createEvents();
    const v = (await rpc("source_admin_update", {
      p_id: id,
      p_version: 1,
      p_patch: {
        confirms: false,
        extract_kind: "tribe",
        event_origin: "official",
        collector_notes: [],
        list_urls: [],
        require_city: false,
        default_venue: "",
        default_category: "musica",
      },
      p_ctx: {},
    })) as number;
    expect(v).toBe(2);
    const { data } = await asService.from("sources").select("*").eq("id", id).single();
    expect(data).toMatchObject({
      confirms: false,
      extract_kind: "tribe",
      event_origin: "official",
      collector_notes: [],
      require_city: false,
      default_venue: null,
      default_category: "musica",
    });
  });

  it("fonte de eventos não vira fonte de notícia (nem o contrário)", async () => {
    const id = await createEvents();
    await expect(
      rpc("source_admin_update", { p_id: id, p_version: 1, p_patch: { kind: "rss" }, p_ctx: {} }),
    ).rejects.toThrow(/tipo da fonte/);
    const { data: news } = await asService
      .from("sources")
      .select("id, version")
      .eq("slug", "mt-agora")
      .single();
    await expect(
      rpc("source_admin_update", {
        p_id: news!.id,
        p_version: news!.version,
        p_patch: { kind: "events" },
        p_ctx: {},
      }),
    ).rejects.toThrow(/tipo da fonte/);
  });
});
