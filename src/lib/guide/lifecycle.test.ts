import { describe, expect, it, vi } from "vitest";
import type { TemplateRow } from "./engine";
import {
  autoPublishList,
  refreshDue,
  refreshList,
  reportVenue,
  REFRESH_DAYS,
  type RefreshableList,
  type RefreshDeps,
} from "./lifecycle";
import { proposeFromTemplate } from "./proposals";
import { venue } from "./testing";
import type { GuideItem, Venue } from "./types";

const NOW = new Date("2027-01-10T09:00:00Z");
const TPL: TemplateRow = {
  id: "t1",
  weights: null,
  slug: "hoteis-cuiaba",
  title: "Os 5 melhores hotéis de Cuiabá",
  noun: "hotéis",
  category: "hotel",
  subcategory: null,
  neighborhood: null,
  take: 5,
  minVenues: 5,
};
const good = (n = 6) =>
  Array.from({ length: n }, (_, i) =>
    venue({ category: "hotel", rating: 4.9 - i / 10, ratingCount: 300, tripadvisorRank: i + 1 }),
  );

describe("autoPublishList", () => {
  const base = (venues: Venue[]) => {
    const proposal = proposeFromTemplate(TPL, venues);
    return { listId: "l1", template: TPL, proposal, venues, mentions: new Map<string, number>() };
  };

  it("publica pelas regras quando a lista cumpre tudo e o interruptor está ligado", async () => {
    const publish = vi.fn(async () => {});
    const r = await autoPublishList(
      { enabled: async () => true, publish, now: () => NOW },
      base(good()),
    );
    expect(r).toEqual({ published: true });
    expect(publish).toHaveBeenCalledWith("l1", NOW);
  });

  it("interruptor desligado: nada publica", async () => {
    const publish = vi.fn(async () => {});
    const r = await autoPublishList(
      { enabled: async () => false, publish, now: () => NOW },
      base(good()),
    );
    expect(r).toEqual({ published: false, reason: "disabled", missing: [] });
    expect(publish).not.toHaveBeenCalled();
  });

  it("com 4 lugares verificados nunca publica sozinha (Review Focus 1)", async () => {
    const publish = vi.fn(async () => {});
    const r = await autoPublishList(
      { enabled: async () => true, publish, now: () => NOW },
      base(good(4)),
    );
    expect(r).toMatchObject({ published: false, reason: "rules" });
    expect(r.published === false && r.missing).toContain("min_venues");
    expect(publish).not.toHaveBeenCalled();
  });

  it("sem nenhum sinal de qualidade (sem nota, ranking nem menção) fica para o editor", async () => {
    const venues = Array.from({ length: 6 }, () =>
      venue({ category: "hotel", rating: null, ratingCount: null, tripadvisorRank: null }),
    );
    const publish = vi.fn(async () => {});
    const r = await autoPublishList(
      { enabled: async () => true, publish, now: () => NOW },
      base(venues),
    );
    expect(r.published === false && r.missing).toContain("quality_signal");
  });
});

function listOf(venues: Venue[], over: Partial<RefreshableList> = {}): RefreshableList {
  return {
    id: "l1",
    slug: "hoteis-cuiaba",
    origin: "template",
    category: "hotel",
    subcategory: null,
    neighborhood: null,
    criteria:
      "Reunimos hotéis de Cuiabá com dados públicos e ordenamos por nota, ranking e menções.",
    sponsored: false,
    template: TPL,
    items: venues.slice(0, 5).map((v) => ({ venue: v, note: null })),
    ...over,
  };
}

function deps(all: Venue[]) {
  const applied: { id: string; items: GuideItem[]; at: Date; next: Date }[] = [];
  const suspended: { id: string; reason: string }[] = [];
  const d: RefreshDeps = {
    venuesOf: async () => all,
    mentions: async () => new Map(),
    apply: async (id, items, at, next) => void applied.push({ id, items, at, next }),
    suspend: async (id, reason) => void suspended.push({ id, reason }),
    now: () => NOW,
  };
  return { d, applied, suspended };
}

describe("refreshList", () => {
  it("reordena com os dados de hoje, atualiza a data e agenda a próxima em 90 dias", async () => {
    const venues = good(6);
    const list = listOf(venues);
    // Mudou o mercado: o 6º lugar passou a ser o melhor avaliado.
    const updated = venues.map((v, i) =>
      i === 5 ? { ...v, rating: 5, ratingCount: 5000, tripadvisorRank: 1 } : v,
    );
    const { d, applied } = deps(updated);
    const r = await refreshList(d, list);
    expect(r).toMatchObject({ status: "refreshed", added: 1, removed: 1 });
    expect(applied).toHaveLength(1);
    expect(applied[0]!.items[0]!.venueId).toBe(venues[5]!.id);
    expect(applied[0]!.at).toEqual(NOW);
    expect(applied[0]!.next.getTime() - NOW.getTime()).toBe(REFRESH_DAYS * 86_400_000);
  });

  it("mesmos dados: não reordena, mas atualiza a data", async () => {
    const venues = good(5);
    const { d, applied } = deps(venues);
    const r = await refreshList(d, listOf(venues));
    expect(r).toEqual({ status: "refreshed", reordered: false, added: 0, removed: 0 });
    expect(applied).toHaveLength(1);
  });

  it("lugar que saiu do ar sai da lista; se faltar o mínimo, a lista é suspensa para um humano", async () => {
    const venues = good(5);
    const down = venues.map((v, i) => (i === 0 ? { ...v, status: "suspended" as const } : v));
    const { d, applied, suspended } = deps(down);
    const r = await refreshList(d, listOf(venues));
    expect(r.status).toBe("suspended");
    expect(suspended[0]!.reason).toContain("min_venues");
    expect(applied).toHaveLength(0);
  });

  it("lista manual reavalia os mesmos lugares e preserva as notas do editor", async () => {
    const venues = good(4);
    const list = listOf(venues, {
      origin: "manual",
      template: null,
      items: venues.map((v, i) => ({ venue: v, note: i === 1 ? "Nota do editor" : null })),
    });
    const { d, applied } = deps(venues);
    const r = await refreshList(d, list);
    expect(r.status).toBe("refreshed");
    const withNote = applied[0]!.items.find((i) => i.venueId === venues[1]!.id);
    expect(withNote?.editorNote).toBe("Nota do editor");
  });

  it("lista manual com menos de 3 lugares ativos é suspensa", async () => {
    const venues = good(3);
    const down = venues.map((v, i) => (i < 2 ? { ...v, status: "inactive" as const } : v));
    const list = listOf(venues, {
      origin: "manual",
      template: null,
      items: down.map((v) => ({ venue: v, note: null })),
    });
    const { d, suspended } = deps(down);
    expect((await refreshList(d, list)).status).toBe("suspended");
    expect(suspended).toHaveLength(1);
  });

  it("lista sem o texto Como escolhemos não volta ao ar atualizada: suspende", async () => {
    const venues = good(5);
    const { d, suspended } = deps(venues);
    const r = await refreshList(d, listOf(venues, { criteria: "" }));
    expect(r).toEqual({ status: "suspended", reason: "refresh: criteria" });
    expect(suspended).toHaveLength(1);
  });

  it("patrocínio não entra na conta: a ordem é a mesma de uma lista editorial", async () => {
    const venues = good(6);
    const a = deps(venues);
    const b = deps(venues);
    await refreshList(a.d, listOf(venues, { sponsored: false }));
    await refreshList(b.d, listOf(venues, { sponsored: true }));
    expect(a.applied[0]!.items.map((i) => i.venueId)).toEqual(
      b.applied[0]!.items.map((i) => i.venueId),
    );
  });
});

describe("refreshDue", () => {
  it("atualiza as vencidas e invalida lista, lugares e índice", async () => {
    const venues = good(5);
    const { d } = deps(venues);
    const tags: string[][] = [];
    const out = await refreshDue(
      { ...d, due: async () => [listOf(venues)], revalidate: async (t) => void tags.push(t) },
      3,
    );
    expect(out.map((o) => o.slug)).toEqual(["hoteis-cuiaba"]);
    expect(tags[0]).toEqual(
      expect.arrayContaining([
        "guide",
        "guide:list:hoteis-cuiaba",
        `guide:venue:${venues[0]!.slug}`,
      ]),
    );
  });
});

describe("reportVenue (Review Focus 4)", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const make = () => {
    const report = vi.fn(async () => ({
      reportId: "r1",
      suspendedLists: ["a", "b"],
      venueSlug: "hotel-x",
      listSlugs: ["lista-a", "lista-b"],
    }));
    const tags: string[][] = [];
    return { report, tags, deps: { report, revalidate: async (t: string[]) => void tags.push(t) } };
  };

  it("registra, suspende todas as listas que citam o lugar e invalida lugar e listas", async () => {
    const { deps: d, report, tags } = make();
    const r = await reportVenue(d, {
      venueId: ID,
      reason: "O hotel fechou em setembro.",
      contact: "leitor@example.com",
    });
    expect(r).toEqual({ ok: true, reportId: "r1", suspended: 2 });
    expect(report).toHaveBeenCalledWith(ID, "O hotel fechou em setembro.", "leitor@example.com");
    expect(tags[0]).toEqual(
      expect.arrayContaining(["guide:venue:hotel-x", "guide:list:lista-a", "guide:list:lista-b"]),
    );
  });

  it.each([
    [{ venueId: "x", reason: "motivo válido aqui" }, "invalid_venue"],
    [{ venueId: ID, reason: "oi" }, "invalid_reason"],
    [{ venueId: ID, reason: "a".repeat(1001) }, "invalid_reason"],
    [{ venueId: ID, reason: "motivo válido aqui", contact: "não é e-mail" }, "invalid_contact"],
  ])("entrada inválida não chega ao banco: %j", async (input, error) => {
    const { deps: d, report } = make();
    expect(await reportVenue(d, input)).toEqual({ ok: false, error });
    expect(report).not.toHaveBeenCalled();
  });

  it("contato é opcional", async () => {
    const { deps: d, report } = make();
    expect((await reportVenue(d, { venueId: ID, reason: "Endereço errado no mapa." })).ok).toBe(
      true,
    );
    expect(report).toHaveBeenCalledWith(ID, "Endereço errado no mapa.", null);
  });
});
