import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANON_TEXT, RECS_PAGE_TEXT } from "@/content/pt-BR/privacy";
import type { Result } from "@/lib/result";

/** Item 88: a gravação no perfil local falha e a tela avisa por toast, sem rejeição solta. */
const profile = {
  saved: [],
  follows: [],
  history: [],
  searches: [],
  interests: [{ key: "Cidade", evidence: "3 leituras", weak: false }],
  alerts: [],
};
const act = vi.fn(async (): Promise<Result<unknown, "storage">> => ({
  ok: false,
  error: "storage",
}));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile, degraded: false, ready: true, act }),
}));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => [{ personalization: true, metrics: false, decided: true }, vi.fn()],
  useConsentKnown: () => true,
}));
vi.mock("@/lib/offline/sw", () => ({
  clearOffline: vi.fn(async () => true),
  cacheSaved: vi.fn(async () => undefined),
}));
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => vi.fn(async () => undefined) }));
vi.mock("@/lib/anon/invite", () => ({ requestLoginInvite: vi.fn() }));
vi.mock("@/lib/push/invite", () => ({ requestNotificationInvite: vi.fn() }));
vi.mock("./NotificationInviteSlot", () => ({ NotificationInviteSlot: () => null }));

import { ToastProvider } from "../ui/Toast";
import { FollowTopicButton } from "./FollowTopicButton";
import { RecommendationControls } from "./RecommendationControls";
import { SaveButton } from "./SaveButton";
import { SaveEventButton } from "./SaveEventButton";

beforeEach(() => act.mockClear());

async function expectToast() {
  expect(await screen.findByText(ANON_TEXT.actFailed)).toBeVisible();
}

describe("erros do perfil local aparecem por toast", () => {
  it("SaveButton", async () => {
    render(
      <ToastProvider>
        <div id="m" />
        <SaveButton contentRef="article:1" title="T" href="/materia/t" targetId="m" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await expectToast();
    expect(screen.queryByText("Salvo neste aparelho.")).not.toBeInTheDocument();
  });

  it("SaveEventButton", async () => {
    render(
      <ToastProvider>
        <SaveEventButton contentRef="event:1" title="Show" href="/agenda/show" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Salvar Show" }));
    await expectToast();
  });

  it("FollowTopicButton", async () => {
    render(
      <ToastProvider>
        <FollowTopicButton slug="chuva" title="Chuva" />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Seguir assunto Chuva" }));
    await expectToast();
  });

  it("RecommendationControls: remover, apagar e redefinir não anunciam sucesso falso", async () => {
    render(
      <ToastProvider>
        <RecommendationControls />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: RECS_PAGE_TEXT.remove("Cidade") }));
    await expectToast();
    await userEvent.click(screen.getByRole("button", { name: RECS_PAGE_TEXT.clear }));
    await userEvent.click(screen.getByRole("button", { name: RECS_PAGE_TEXT.reset }));
    expect(act).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(RECS_PAGE_TEXT.removed)).not.toBeInTheDocument();
    expect(screen.queryByText(RECS_PAGE_TEXT.cleared)).not.toBeInTheDocument();
    expect(screen.queryByText(RECS_PAGE_TEXT.resetDone)).not.toBeInTheDocument();
  });
});
