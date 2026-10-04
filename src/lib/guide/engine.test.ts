import { describe, expect, it, vi } from "vitest";
import {
  proposeNextTemplate,
  type EngineStore,
  type ProposeDeps,
  type ProposalWrite,
  type TemplateRow,
} from "./engine";
import { venue } from "./testing";
import type { Venue } from "./types";

const NOW = new Date("2026-10-05T09:00:00Z");

const TPL: TemplateRow = {
  id: "t1",
  weights: null,
  slug: "padarias-cuiaba",
  title: "As 5 melhores padarias de Cuiabá",
  noun: "padarias",
  category: "padaria",
  subcategory: null,
  neighborhood: null,
  take: 5,
  minVenues: 5,
};

function store(venues: Venue[], template: TemplateRow | null = TPL) {
  const created: ProposalWrite[] = [];
  const marked: string[] = [];
  const s: EngineStore = {
    nextTemplate: async () => template,
    venuesFor: async () => venues,
    mentions: async () => new Map(),
    createProposal: async (w) => {
      created.push(w);
      return { listId: "l1", proposalId: "p1" };
    },
    markProposed: async (id) => void marked.push(id),
  };
  return { s, created, marked };
}

const good = () =>
  [4.9, 4.8, 4.7, 4.6, 4.5, 4.4].map((rating) =>
    venue({ rating, ratingCount: 300, tripadvisorRank: 3 }),
  );

describe("proposeNextTemplate", () => {
  it("cria a proposta do próximo modelo com os 5 melhores e marca o modelo como proposto", async () => {
    const { s, created, marked } = store(good());
    const r = await proposeNextTemplate({ store: s, now: () => NOW });
    expect(r).toMatchObject({
      status: "proposed",
      template: "padarias-cuiaba",
      items: 5,
      autoPublishable: true,
      published: false,
    });
    expect(created).toHaveLength(1);
    expect(created[0]!.proposal.items).toHaveLength(5);
    expect(created[0]!.templateId).toBe("t1");
    expect(marked).toEqual(["t1"]);
  });

  it("sem modelo disponível não faz nada", async () => {
    const { s, created } = store(good(), null);
    expect(await proposeNextTemplate({ store: s, now: () => NOW })).toEqual({ status: "none" });
    expect(created).toHaveLength(0);
  });

  it("menos de 3 lugares elegíveis: não cria proposta vazia, só adia o modelo", async () => {
    const { s, created, marked } = store(good().slice(0, 2));
    expect(await proposeNextTemplate({ store: s, now: () => NOW })).toEqual({ status: "none" });
    expect(created).toHaveLength(0);
    expect(marked).toEqual(["t1"]);
  });

  it("proposta com 4 lugares é criada, mas não é publicável sozinha", async () => {
    const { s } = store(good().slice(0, 4));
    const r = await proposeNextTemplate({ store: s, now: () => NOW });
    expect(r).toMatchObject({ status: "proposed", items: 4, autoPublishable: false });
    expect(r.status === "proposed" && r.missing).toContain("min_venues");
  });

  it("chama afterPropose (publicação automática) com a proposta e os lugares", async () => {
    const { s } = store(good());
    const afterPropose = vi.fn(
      async (r: Parameters<NonNullable<ProposeDeps["afterPropose"]>>[0]) => ({
        published: r.listId === "l1",
      }),
    );
    const r = await proposeNextTemplate({ store: s, now: () => NOW, afterPropose });
    expect(afterPropose).toHaveBeenCalledOnce();
    expect(afterPropose.mock.calls[0]![0]).toMatchObject({
      listId: "l1",
      template: { slug: "padarias-cuiaba" },
    });
    expect(r.status === "proposed" && r.published).toBe(true);
  });
});
