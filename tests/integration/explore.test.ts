// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getCollectionBySlug, getExploreData } from "@/lib/db/queries";

function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`leitura falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("explorar e coleções (P1-T9)", () => {
  it("explorar traz editorias com contagem do dia, assuntos, coleções e mais lidas", async () => {
    const now = new Date("2026-09-27T18:00:00Z");
    const d = value(await getExploreData(now));
    expect(d.sections.map((s) => s.slug)).toContain("cidade");
    const total = d.sections.reduce((n, s) => n + s.todayCount, 0);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(d.sections.every((s) => Number.isInteger(s.todayCount))).toBe(true);
    expect(d.topics.length).toBeGreaterThan(0);
    expect(d.collections).toHaveLength(4);
    expect(d.mostRead.length).toBeGreaterThan(0);
    expect(d.mostRead.length).toBeLessThanOrEqual(5);
  });

  it("coleção traz capa, curador e itens na ordem, com agregado apontando ao original", async () => {
    const c = value(await getCollectionBySlug("seca-e-fumaca"));
    expect(c?.title).toBe("Seca e fumaça");
    expect(c?.curator).toBe("Marina Arruda");
    expect(c?.updatedAt).toBeTruthy();
    expect(c?.items.map((i) => i.kind)).toEqual(["article", "article", "article", "aggregated"]);
    const agg = c?.items.find((i) => i.kind === "aggregated");
    expect(agg?.kind === "aggregated" && agg.item.url).toMatch(/^https:\/\/mtagora\.example\//);
  });

  it("coleção mista mantém eventos e matérias", async () => {
    const c = value(await getCollectionBySlug("outubro-em-cuiaba"));
    expect(c?.items.map((i) => i.kind)).toEqual(["event", "event", "event", "article"]);
  });

  it("coleção inexistente devolve null", async () => {
    expect(value(await getCollectionBySlug("nao-existe"))).toBeNull();
  });
});
