import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/fontes" }));
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => vi.fn() }));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: null, degraded: false, ready: true, act: vi.fn() }),
}));

import { SOURCES_PAGE as T } from "@/content/pt-BR/sources-list";
import { DEFAULT_REC_CONFIG } from "@/lib/ranking";
import type { SourceListEntry } from "@/lib/sources/screen";
import { SourcesClient } from "./SourcesClient";

function entry(slug: string, popularity: number): SourceListEntry {
  return {
    slug,
    name: slug.toUpperCase(),
    href: `/fontes/${slug}`,
    categories: ["cidade"],
    locality: "cuiaba",
    popularity,
    individual: 0,
    recency: 0.5,
    engagement: 0.5,
    operational: 1,
    diversity: 0.5,
    trend: 0.5,
    followed: false,
    pinned: false,
    excluded: false,
    blocked: false,
    isNewForUser: true,
    localHighlight: false,
    verified: false,
    recentVisit: false,
    similar: false,
    reach: 18_000,
    trendDirection: "stable",
    itemsToday: 3,
    lastUpdatedAt: "2026-09-27T17:00:00Z",
  };
}

const entries = [entry("folha", 1), entry("agora", 0.6), entry("fora", 0.2)];

/** Cards prontos do servidor (item 86): o cliente só escolhe quais mostrar e em que ordem. */
const items = [
  { id: "i1", sourceSlug: "agora", card: <p>card agora 1</p> },
  { id: "i2", sourceSlug: "folha", card: <p>card folha 1</p> },
  { id: "i3", sourceSlug: "sumida", card: <p>card de fonte fora do ranking</p> },
];

function renderClient(tab: "popular" | "trending" = "popular") {
  return render(
    <SourcesClient
      entries={entries}
      items={items}
      config={DEFAULT_REC_CONFIG}
      query={{ tab, period: "semana" }}
      initialPersonalization={false}
      now="2026-09-27T18:00:00Z"
    />,
  );
}

describe("Fontes em destaque · cliente (item 86)", () => {
  it("mostra os cards de itens vindos do servidor, na ordem do ranking", () => {
    renderClient();
    const section = screen.getByRole("region", { name: T.itemsTitle });
    const cards = within(section)
      .getAllByText(/^card /)
      .map((n) => n.textContent);
    expect(cards).toEqual(["card folha 1", "card agora 1"]);
    expect(within(section).queryByText("card de fonte fora do ranking")).toBeNull();
  });

  it("os itens só aparecem na aba Mais acessadas", async () => {
    renderClient();
    await userEvent.click(screen.getByRole("tab", { name: T.tabs.trending }));
    expect(screen.queryByRole("region", { name: T.itemsTitle })).toBeNull();
    expect(screen.queryByText("card folha 1")).toBeNull();
  });

  it("o cliente não carrega o card de agregado nem os textos da página de uma fonte", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/(public)/fontes/(lista)/SourcesClient.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/AggregatedCard/);
    expect(src).not.toMatch(/@\/content\/pt-BR\/sources"/);
  });
});
