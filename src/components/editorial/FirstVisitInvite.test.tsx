import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const track = vi.fn();
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => track }));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => [{ decided: true, measurement: false, personalization: false }],
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: { follows: [] }, act: anonAct }),
}));
const anonAct = vi.fn(async () => ({ ok: false, error: "storage" }));

import { claimInviteSlot, resetInviteSlotsForTests } from "@/lib/app/slot";
import { firstVisitDecided } from "@/lib/anon/invite-storage";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { ToastProvider } from "../ui/Toast";
import { FirstVisitInvite } from "./FirstVisitInvite";

const TITLE = "Personalize suas fontes e receba uma experiência mais relevante.";
const panel = () => screen.queryByRole("complementary", { name: TITLE });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("cn_qreads", "3");
  resetInviteSlotsForTests();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FirstVisitInvite (item 63)", () => {
  it("no fim da matéria é uma faixa compacta no fluxo, sem cobrir o texto", async () => {
    render(<FirstVisitInvite placement="article-end" />);
    const el = await screen.findByRole("complementary", { name: TITLE });
    expect(el).toHaveAttribute("data-placement", "article-end");
    // No fluxo da página: nada de posição fixa, camada acima do texto ou rolagem própria.
    expect(el.className).not.toMatch(/\b(fixed|sticky|absolute)\b/);
    expect(el.className).not.toMatch(/\bz-/);
    expect(el.innerHTML).not.toMatch(/max-h-/);
    // Compacta: o seletor só abre sob demanda.
    expect(screen.queryByRole("heading", { name: "Locais" })).toBeNull();
    expect(screen.getByRole("button", { name: "Escolher fontes agora" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeVisible();
  });

  it("na home usa a mesma faixa, marcada com o lugar", async () => {
    render(<FirstVisitInvite placement="home" />);
    expect(await screen.findByRole("complementary", { name: TITLE })).toHaveAttribute(
      "data-placement",
      "home",
    );
  });

  it("Agora não fecha e não volta na mesma sessão", async () => {
    const { unmount } = render(<FirstVisitInvite placement="article-end" />);
    await screen.findByRole("complementary", { name: TITLE });
    await userEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(panel()).toBeNull();
    unmount();
    resetInviteSlotsForTests();
    render(<FirstVisitInvite placement="home" />);
    await act(async () => {});
    expect(panel()).toBeNull();
  });

  it("Esc vale como Agora não", async () => {
    render(<FirstVisitInvite placement="article-end" />);
    await screen.findByRole("complementary", { name: TITLE });
    screen.getByRole("button", { name: "Agora não" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(panel()).toBeNull();
  });

  it("expande o seletor sob demanda e Concluir decide de vez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sources: [{ slug: "folha-do-cerrado", name: "Folha do Cerrado", group: "local" }],
        }),
      }),
    );
    render(<FirstVisitInvite placement="article-end" />);
    await screen.findByRole("complementary", { name: TITLE });
    await userEvent.click(screen.getByRole("button", { name: "Escolher fontes agora" }));
    expect(await screen.findByRole("heading", { name: "Locais" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(panel()).toBeNull();
    expect(firstVisitDecided()).toBe(true);
  });

  it("seguir que falha ao gravar avisa por toast e não registra o seguir (item 88)", async () => {
    track.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sources: [{ slug: "folha-do-cerrado", name: "Folha do Cerrado", group: "local" }],
        }),
      }),
    );
    render(
      <ToastProvider>
        <FirstVisitInvite placement="article-end" />
      </ToastProvider>,
    );
    await screen.findByRole("complementary", { name: TITLE });
    await userEvent.click(screen.getByRole("button", { name: "Escolher fontes agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Seguir Folha do Cerrado" }));
    expect(await screen.findByText(ANON_TEXT.actFailed)).toBeVisible();
    expect(anonAct).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalledWith("source_followed", expect.anything(), expect.anything());
    // O seletor continua aberto e a fonte segue sem marcar.
    expect(screen.getByRole("button", { name: "Seguir Folha do Cerrado" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("um convite por vez: com o banner de consentimento na vaga, não aparece", async () => {
    claimInviteSlot("consent", "", Symbol("banner"));
    render(<FirstVisitInvite placement="home" />);
    await act(async () => {});
    expect(panel()).toBeNull();
  });

  it("antes de 3 leituras não aparece", async () => {
    sessionStorage.setItem("cn_qreads", "2");
    render(<FirstVisitInvite placement="home" />);
    await act(async () => {});
    expect(panel()).toBeNull();
  });
});

describe("ponto de montagem", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("na matéria entra depois do corpo e das fontes, nunca no meio do texto", () => {
    const page = src("src/app/(public)/materia/[slug]/page.tsx");
    const at = page.indexOf('<FirstVisitGate placement="article-end"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(page.indexOf("reading-body"));
    expect(at).toBeGreaterThan(page.indexOf("<SourcesList"));
    expect(at).toBeLessThan(page.indexOf("</article>"));
  });

  it("na home tem lugar próprio e a moldura não monta mais o painel flutuante", () => {
    expect(src("src/app/(public)/(inicio)/page.tsx")).toContain('<FirstVisitGate placement="home"');
    expect(src("src/components/editorial/PublicShell.tsx")).not.toContain("FirstVisitGate");
  });
});
