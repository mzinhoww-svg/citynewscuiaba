// @vitest-environment node
// D-06 (migration 0153): a chave anônima não lê os metadados internos da matéria.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

describe("colunas internas de articles fora do anônimo (D-06)", () => {
  it("o portal continua lendo o que mostra", async () => {
    const { data, error } = await anon
      .from("articles")
      .select("id, slug, title, dek, published_at, seo_title")
      .in("status", ["published", "updated"])
      .limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it.each(["ai_fallback", "review_reason", "rules_version", "risk_level", "due_at"])(
    "anônimo não lê %s",
    async (col) => {
      const { error } = await anon.from("articles").select(col).limit(1);
      expect(error?.message ?? "").toMatch(/permission denied/i);
    },
  );
});
