// @vitest-environment node
// UX-W1-T3 (item 7): a fila do Estúdio não corta em 100 sem aviso. `listQueue` devolve o total
// real e um cursor opaco e estável (empates de prazo e data desempatados pelo id).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listQueue, listQueueThrough } from "@/lib/db/queries/queue";
import { asUser, service } from "./studio";

const run = Date.now();
const SECTION = `pag-${run}`;
const ids: string[] = [];

beforeAll(async () => {
  const s = await service
    .from("sections")
    .insert({ slug: SECTION, name: "Paginação teste", autonomy_category: "cidade" } as never);
  if (s.error) throw s.error;
  // 130 matérias: 40 com o mesmo prazo, 40 com prazos distintos e 50 sem prazo. Um único insert
  // grava o mesmo updated_at em todas, então a ordem depende do desempate pelo id.
  const rows = Array.from({ length: 130 }, (_, i) => {
    const id = randomUUID();
    ids.push(id);
    const due =
      i < 40
        ? "2026-12-01T12:00:00+00:00"
        : i < 80
          ? new Date(Date.UTC(2026, 11, 2, 0, i)).toISOString()
          : null;
    return {
      id,
      slug: `pag-${run}-${i}`,
      section_slug: SECTION,
      title: `Matéria de paginação ${i}`,
      dek: "Linha fina de teste.",
      body: { type: "doc", content: [] },
      status: "in_review",
      kind: "original",
      due_at: due,
    };
  });
  const r = await service.from("articles").insert(rows as never);
  if (r.error) throw r.error;
});

afterAll(async () => {
  await service.from("articles").delete().in("id", ids);
  await service.from("sections").delete().eq("slug", SECTION);
});

describe("fila do Estúdio paginada", () => {
  it("130 itens: 100 na primeira página, total real e cursor; o cursor traz os 30 restantes", async () => {
    const first = await asUser("helena", () =>
      listQueue({ tab: "all", section: SECTION }, { limit: 100 }),
    );
    expect(first.rows).toHaveLength(100);
    expect(first.total).toBe(130);
    expect(first.nextCursor).not.toBeNull();

    const second = await asUser("helena", () =>
      listQueue({ tab: "all", section: SECTION }, { limit: 100, cursor: first.nextCursor! }),
    );
    expect(second.rows).toHaveLength(30);
    expect(second.total).toBe(130);
    expect(second.nextCursor).toBeNull();

    const all = [...first.rows, ...second.rows].map((r) => r.id);
    expect(new Set(all).size).toBe(130);
    expect(new Set(all)).toEqual(new Set(ids));
  });

  it("páginas pequenas atravessam empates sem repetir nem pular", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await asUser("helena", () =>
        listQueue({ tab: "all", section: SECTION }, { limit: 7, cursor }),
      );
      seen.push(...page.rows.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(130);
    expect(new Set(seen).size).toBe(130);
    // A ordem é a mesma de uma leitura única (prazo, data, id).
    const once = await asUser("helena", () =>
      listQueue({ tab: "all", section: SECTION }, { limit: 200 }),
    );
    expect(seen).toEqual(once.rows.map((r) => r.id));
  });

  it("até o cursor (inclusive) devolve exatamente o que já foi mostrado", async () => {
    const first = await asUser("helena", () =>
      listQueue({ tab: "all", section: SECTION }, { limit: 100 }),
    );
    const head = await asUser("helena", () =>
      listQueueThrough({ tab: "all", section: SECTION }, first.nextCursor!),
    );
    expect(head.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));
  });

  it("cursor inválido volta ao começo em vez de quebrar", async () => {
    const page = await asUser("helena", () =>
      listQueue({ tab: "all", section: SECTION }, { limit: 100, cursor: "adulterado" }),
    );
    expect(page.rows).toHaveLength(100);
    expect(page.total).toBe(130);
  });
});
