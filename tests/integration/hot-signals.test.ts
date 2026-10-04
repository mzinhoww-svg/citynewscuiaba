// @vitest-environment node
// HOT-T1 (0151): `front_signals` com banco real. RLS ligada sem política: anônimo não lê nem
// escreve; só o service role grava. `featured_items` ganha `topic_id` e `dismissed_at`; a flag
// `hot_featured_enabled` nasce ligada e `featured.hot_min_sources` vale 3 em `app_settings`.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const created: string[] = [];
let sourceId = "";

const anon = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

beforeAll(async () => {
  const src = await db.from("sources").select("id").limit(1).single();
  if (src.error) throw new Error(src.error.message);
  sourceId = src.data.id;
  const ins = await db
    .from("front_signals")
    .insert({ source_id: sourceId, url: `https://example.com/hot-${tag}`, rank: 1 })
    .select("id")
    .single();
  if (ins.error) throw new Error(ins.error.message);
  created.push(ins.data.id);
});

afterAll(async () => {
  if (created.length) await db.from("front_signals").delete().in("id", created);
});

describe("front_signals (banco real)", () => {
  it("service role grava e lê", async () => {
    const r = await db.from("front_signals").select("id, rank, topic_id").in("id", created);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ id: created[0], rank: 1, topic_id: null }]);
  });

  it("anônimo não lê nenhuma linha", async () => {
    const r = await anon().from("front_signals").select("*").limit(5);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("anônimo não escreve", async () => {
    const r = await anon()
      .from("front_signals")
      .insert({ source_id: sourceId, url: `https://example.com/anon-${tag}`, rank: 2 })
      .select();
    expect(r.error).not.toBeNull();
    expect(r.error!.message).toMatch(/row-level security|permission denied/i);
  });

  it("rank fora de 1 a 10 é recusado", async () => {
    const r = await db
      .from("front_signals")
      .insert({ source_id: sourceId, url: `https://example.com/rank-${tag}`, rank: 11 })
      .select("id");
    expect(r.error).not.toBeNull();
  });
});

describe("flags e colunas da pauta quente", () => {
  it("hot_featured_enabled nasce ligada e hot_min_sources vale 3", async () => {
    const flag = await db
      .from("feature_flags")
      .select("enabled")
      .eq("key", "hot_featured_enabled")
      .single();
    expect(flag.data?.enabled).toBe(true);
    const min = await db
      .from("app_settings")
      .select("value")
      .eq("key", "featured.hot_min_sources")
      .single();
    expect(min.data?.value).toBe(3);
  });

  it("hot_min_sources fora de 2 a 10 é recusado", async () => {
    const r = await db
      .from("app_settings")
      .update({ value: 1 })
      .eq("key", "featured.hot_min_sources")
      .select("key");
    expect(r.error).not.toBeNull();
  });

  it("featured_items expõe topic_id e dismissed_at", async () => {
    const r = await db.from("featured_items").select("id, topic_id, dismissed_at").limit(1);
    expect(r.error).toBeNull();
  });
});
