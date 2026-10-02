// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listNewsEntries, listPageEntries, listTopicEntries } from "@/lib/db/queries";

describe("sitemaps (P1-T11)", () => {
  it("notícias: só matérias públicas das últimas 48 h", async () => {
    const now = new Date("2026-09-27T18:00:00Z");
    const r = await listNewsEntries(now);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.length).toBeGreaterThan(0);
    const since = now.getTime() - 48 * 3600_000;
    for (const e of r.value) {
      expect(e.path).toMatch(/^\/materia\//);
      expect(new Date(e.publishedAt).getTime()).toBeGreaterThanOrEqual(since);
    }
    expect(r.value.some((e) => e.path.includes("materia-arquivada-seed"))).toBe(false);
  });

  it("assuntos e páginas só com caminhos do próprio site", async () => {
    const topics = await listTopicEntries();
    const pages = await listPageEntries();
    if (!topics.ok || !pages.ok) throw new Error("leitura falhou");
    expect(topics.value.map((t) => t.path)).toContain("/assunto/obra-do-viaduto-na-miguel-sutil");
    expect(pages.value.map((p) => p.path)).toContain("/colecoes/seca-e-fumaca");
    expect([...topics.value, ...pages.value].every((e) => e.path.startsWith("/"))).toBe(true);
  });
});
