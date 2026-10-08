import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { HOME } from "@/content/pt-BR/portal-home";
import { NowList } from "./NowList";

/* UX-W4-T4 (item 72): sem separador solto e estado vazio. */

const base = {
  id: "a1",
  slug: "obra",
  href: "/materia/obra",
  kind: "original",
  title: "Obra na avenida do CPA termina em novembro",
  section: { slug: "cidade", name: "Cidade" },
  status: "published",
  publishedAt: "2026-09-27T17:48:00Z",
  updatedAt: "2026-09-27T17:48:00Z",
  labels: { shown: [], hidden: [] },
  sourceCount: 0,
} as unknown as ArticleSummary;

const now = new Date("2026-09-27T18:12:00Z");

/** Separadores visíveis no celular: os que não levam `max-sm:hidden`. */
function mobileSeparators(li: HTMLElement) {
  return [...li.querySelectorAll('span[aria-hidden="true"]')].filter(
    (s) => s.textContent?.includes("·") && !s.classList.contains("max-sm:hidden"),
  );
}

describe("NowList (UX-W4-T4, item 72)", () => {
  it("sem origem em texto: no celular o horário não termina em separador", () => {
    render(<NowList items={[base]} now={now} />);
    const [li] = screen.getAllByRole("listitem");
    expect(mobileSeparators(li!)).toHaveLength(0);
  });

  it("com origem em texto: o separador fica entre o horário e a origem", () => {
    render(<NowList items={[{ ...base, kind: "normalized", sourceCount: 2 }]} now={now} />);
    const [li] = screen.getAllByRole("listitem");
    expect(mobileSeparators(li!)).toHaveLength(1);
  });

  it("lista vazia: mostra o estado vazio, sem lista sem itens", () => {
    render(<NowList items={[]} now={now} />);
    const region = screen.getByRole("region", { name: "Agora" });
    expect(within(region).queryByRole("list")).toBeNull();
    expect(within(region).getByText(HOME.nowEmpty)).toBeInTheDocument();
    expect(within(region).getByText("Próximo ciclo em 18 min")).toBeInTheDocument();
  });
});
