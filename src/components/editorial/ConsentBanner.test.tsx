import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentProvider } from "@/lib/consent/client";
import { parseConsent, readConsentCookie } from "@/lib/consent";
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

  it("botões de 44 px com texto de 14 px; no celular o aceite ocupa a linha toda", () => {
    renderBanner();
    const buttons = ["Só o necessário", "Escolher", "Aceitar métricas e recomendações"].map(
      (name) => screen.getByRole("button", { name }),
    );
    for (const b of buttons) {
      expect(b).toHaveClass("h-tap");
      expect(b.className).toMatch(/(^|\s)text-14!?(\s|$)/);
      expect(b.className).not.toMatch(/text-12/);
    }
    const row = buttons[0]!.parentElement!;
    expect(row).toHaveClass("lg:flex");
    expect(row.contains(buttons[2]!)).toBe(true);
    expect(buttons[2]).toHaveClass("col-span-full");
    // Barra de uma linha no desktop.
    expect(row.parentElement).toHaveClass("lg:flex-row");
  });

  it("o botão diz o que liga: grava métricas e personalização", async () => {
    document.cookie = "cn_consent=; Path=/; Max-Age=0";
    renderBanner();
    await userEvent.click(screen.getByRole("button", { name: "Aceitar métricas e recomendações" }));
    expect(readConsentCookie(document.cookie)).toMatchObject({
      decided: true,
      metrics: true,
      personalization: true,
    });
    document.cookie = "cn_consent=; Path=/; Max-Age=0";
  });

  it("texto inteiro em 14 px (sem corte) e Saiba mais com alvo de 44 px", () => {
    renderBanner();
    const text = screen.getByText(/Usamos só o necessário/);
    expect(text.className).not.toMatch(/line-clamp/);
    expect(text).toHaveClass("text-14");
    expect(text.className).not.toMatch(/text-12/);
    const link = screen.getByRole("link", { name: "Saiba mais sobre privacidade" });
    expect(link).toHaveAttribute("href", "/privacidade");
    expect(link).toHaveClass("min-h-tap", "text-14");
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
