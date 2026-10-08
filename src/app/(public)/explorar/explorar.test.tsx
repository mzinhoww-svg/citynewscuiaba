import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExploreData } from "@/lib/db/queries";

/** UX-W4-T3 · itens 66, 67 e 68 (P-08, P-09, P-10). */
const getExploreData = vi.fn();
vi.mock("@/lib/db/queries", () => ({ getExploreData: () => getExploreData() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/explorar" }));

const { default: ExploreRoute } = await import("./page");

const EMPTY: ExploreData = {
  generatedAt: "2026-10-04T10:00:00Z",
  sections: [{ slug: "cidade", name: "Cidade", href: "/cidade", todayCount: 0 }],
  topics: [],
  collections: [],
  featured: null,
  mostRead: [],
};

async function renderPage() {
  render(await ExploreRoute());
}

function anchors() {
  const nav = screen.getByRole("navigation", { name: "Nesta página" });
  return within(nav)
    .getAllByRole("link")
    .map((a) => a.getAttribute("href")!);
}

describe("/explorar", () => {
  beforeEach(() => getExploreData.mockReset());

  it("cada âncora leva a uma seção que está na página", async () => {
    getExploreData.mockResolvedValue({ ok: true, value: EMPTY });
    const { container } = render(await ExploreRoute());
    const hrefs = anchors();
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(container.querySelector(h), h).not.toBeNull();
    // Sem mais lidas, sem âncora para elas.
    expect(hrefs).not.toContain("#mais-lidas");
  });

  it("com o banco fora, só sobram as âncoras das seções que não dependem dele", async () => {
    getExploreData.mockResolvedValue({ ok: false, error: { kind: "query", message: "x" } });
    const { container } = render(await ExploreRoute());
    const hrefs = anchors();
    for (const h of hrefs) expect(container.querySelector(h), h).not.toBeNull();
    for (const gone of ["#editorias", "#assuntos", "#colecoes", "#mais-lidas"])
      expect(hrefs).not.toContain(gone);
  });

  it('tem a entrada "Perguntar ao CityNews" levando a /pergunte', async () => {
    getExploreData.mockResolvedValue({ ok: true, value: EMPTY });
    await renderPage();
    expect(screen.getByRole("link", { name: /Perguntar ao CityNews/ })).toHaveAttribute(
      "href",
      "/pergunte",
    );
  });

  it("atalhos levam ao destino que o texto promete", async () => {
    getExploreData.mockResolvedValue({ ok: true, value: EMPTY });
    await renderPage();
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/Ônibus e trânsito/)).toBe("/cidade?sub=mobilidade");
    expect(href(/Clima e qualidade do ar/)).toBe("/servicos?sub=clima");
    expect(href(/Programação gratuita/)).toBe("/agenda?gratuito=1");
    expect(href(/^Guia Cuiabá/)).toBe("/guia-cuiaba");
    expect(href(/^Fontes/)).toBe("/fontes");
    expect(href(/^Agenda/)).toBe("/agenda");
    // "Ônibus" não cai no Guia de lugares, e o app não fica sob o título "Fontes e agenda".
    expect(screen.queryByRole("region", { name: "Fontes e agenda" })).toBeNull();
  });
});
