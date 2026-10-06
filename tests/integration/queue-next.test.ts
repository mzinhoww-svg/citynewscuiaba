// @vitest-environment node
// UX-W3-T1 (item 46): "Aprovar e ir para o próximo" segue a ordem da fila (`listQueue`), com a
// mesma aba e os mesmos filtros, e pula o que já não está para decidir.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listQueue } from "@/lib/db/queries/queue";
import { nextQueueItem } from "@/lib/db/queries/queue-next";
import { asUser, service } from "./studio";

const run = Date.now();
const SECTION = `prox-${run}`;
const ids: string[] = [];

beforeAll(async () => {
  const s = await service
    .from("sections")
    .insert({ slug: SECTION, name: "Próximo teste", autonomy_category: "cidade" } as never);
  if (s.error) throw s.error;
  // 0..3 com prazos crescentes; 2 já publicada (fora do "próximo"); 4 e 5 sem prazo, empatadas
  // na data (um único insert), desempatadas pelo id; 5 com confiança alta.
  const rows = Array.from({ length: 6 }, (_, i) => {
    const id = randomUUID();
    ids.push(id);
    return {
      id,
      slug: `prox-${run}-${i}`,
      section_slug: SECTION,
      title: `Matéria do próximo ${i}`,
      dek: "Linha fina de teste.",
      body: { type: "doc", content: [] },
      // Rascunho guarda o prazo dado (em revisão, o prazo vem do SLA da redação).
      status: i === 2 ? "published" : "draft",
      published_at: i === 2 ? new Date().toISOString() : null,
      kind: "original",
      confidence: i === 5 ? "alta" : "média",
      due_at: i < 4 ? new Date(Date.UTC(2026, 11, 1, 12, i)).toISOString() : null,
    };
  });
  const r = await service.from("articles").insert(rows as never);
  if (r.error) throw r.error;
});

afterAll(async () => {
  await service.from("articles").delete().in("id", ids);
  await service.from("sections").delete().eq("slug", SECTION);
});

describe("nextQueueItem", () => {
  it("segue a ordem de listQueue e pula o que não está aberto", async () => {
    const page = await asUser("helena", () => listQueue({ tab: "all", section: SECTION }));
    const order = page.rows.filter((r) => r.status !== "published").map((r) => r.id);
    expect(order).toHaveLength(5);
    for (const [i, id] of order.entries()) {
      const next = await asUser("helena", () =>
        nextQueueItem({ tab: "all", section: SECTION }, id),
      );
      expect(next).toBe(order[i + 1] ?? null);
    }
  });

  it("a matéria publicada no meio não é o próximo: de 1 vai para 3", async () => {
    const next = await asUser("helena", () =>
      nextQueueItem({ tab: "all", section: SECTION }, ids[1]!),
    );
    expect(next).toBe(ids[3]);
  });

  it("respeita os filtros da tela", async () => {
    const next = await asUser("helena", () =>
      nextQueueItem({ tab: "all", section: SECTION, confidence: "alta" }, ids[0]!),
    );
    expect(next).toBe(ids[5]);
  });

  it("id desconhecido devolve null", async () => {
    const next = await asUser("helena", () =>
      nextQueueItem({ tab: "all", section: SECTION }, randomUUID()),
    );
    expect(next).toBeNull();
  });
});
