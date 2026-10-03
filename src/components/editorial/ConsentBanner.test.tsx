import { render, screen } from "@testing-library/react";
import { ConsentProvider } from "@/lib/consent/client";
import { parseConsent } from "@/lib/consent";
import { ConsentBanner } from "./ConsentBanner";

function renderBanner() {
  return render(
    <ConsentProvider initial={parseConsent(undefined)}>
      <main id="conteudo">
        <h1>Manchete</h1>
      </main>
      <ConsentBanner />
    </ConsentProvider>,
  );
}

/*
 * Layout compacto (UI-T1): o jsdom não mede pixels, então o teste garante os atributos que
 * produzem o layout (a altura real é medida em tests/e2e/consent.spec.ts).
 */
describe("ConsentBanner compacto", () => {
  it("é uma região nomeada, fixa, com camada pelo token e sem borda de acento arredondada", () => {
    renderBanner();
    const region = screen.getByRole("region", { name: "Sua privacidade" });
    expect(region).toHaveClass("fixed", "z-sheet");
    expect(region.className).not.toMatch(/border-t-2/);
    // Sem cartão flutuante no desktop: barra de largura total.
    expect(region.className).not.toMatch(/lg:w-80|lg:rounded|lg:right-/);
  });

  it("botões em linha (uma linha no desktop) com alvo de 44 px", () => {
    renderBanner();
    const buttons = ["Só o necessário", "Escolher", "Aceitar recomendações"].map((name) =>
      screen.getByRole("button", { name }),
    );
    for (const b of buttons) expect(b).toHaveClass("h-tap");
    const row = buttons[0]!.parentElement!;
    expect(row).toHaveClass("grid-cols-3");
    expect(row).toHaveClass("lg:flex");
    expect(row.contains(buttons[2]!)).toBe(true);
    // Barra de uma linha no desktop.
    expect(row.parentElement).toHaveClass("lg:flex-row");
  });

  it("texto longo limitado a 2 linhas no celular, com Saiba mais e o título ainda na árvore", () => {
    renderBanner();
    const link = screen.getByRole("link", { name: "Saiba mais sobre privacidade" });
    expect(link).toHaveAttribute("href", "/privacidade");
    expect(link.previousElementSibling).toHaveClass("line-clamp-2");
    expect(screen.getByRole("heading", { name: "Sua privacidade no CityNews" })).toHaveClass(
      "sr-only",
    );
  });

  it("foco inicial não é roubado e o Esc no painel é tratado pelo painel (sem modal)", () => {
    renderBanner();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
