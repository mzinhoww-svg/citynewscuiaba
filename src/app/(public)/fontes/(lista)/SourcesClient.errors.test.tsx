import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { SOURCES_PAGE } from "@/content/pt-BR/sources";
import type { AnonProfile } from "@/lib/anon/types";
import { DEFAULT_REC_CONFIG } from "@/lib/ranking";
import type { Result } from "@/lib/result";
import type { SourceListEntry } from "@/lib/sources/screen";

/* UX-W5-T3 (item 88): a gravação no perfil local falha; Fontes avisa por toast e não finge. */

const PROFILE: AnonProfile = {
  anonId: null,
  createdAt: "2026-10-01T12:00:00Z",
  follows: [],
  saved: [],
  history: [],
  searches: [],
  interests: [],
  hidden: [],
  collections: [],
  alerts: [],
};
const FAIL: Result<unknown, "storage"> = { ok: false, error: "storage" };
const OK: Result<unknown, "storage"> = { ok: true, value: undefined };
const act = vi.fn(async (): Promise<Result<unknown, "storage">> => FAIL);
const send = vi.fn(async () => undefined);
const current = { profile: PROFILE };
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: current.profile, degraded: false, ready: true, act }),
}));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => [{ personalization: false, metrics: false, decided: true }, vi.fn()],
}));
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => send }));
const requestLoginInvite = vi.fn();
vi.mock("@/lib/anon/invite", () => ({
  requestLoginInvite: (...a: unknown[]) => requestLoginInvite(...a),
}));

import { SourcesClient } from "./SourcesClient";

const ENTRY: SourceListEntry = {
  slug: "folha",
  name: "Folha do Cerrado",
  href: "/fontes/folha",
  categories: ["cidade"],
  locality: "cuiaba",
  popularity: 1,
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
  lastUpdatedAt: "2026-10-01T11:00:00Z",
};

function renderClient() {
  return render(
    <ToastProvider>
      <SourcesClient
        entries={[ENTRY]}
        items={[]}
        config={DEFAULT_REC_CONFIG}
        query={{ tab: "popular", period: "semana" }}
        initialPersonalization={false}
        now="2026-10-01T12:00:00Z"
      />
    </ToastProvider>,
  );
}

const expectToast = async () => expect(await screen.findByText(ANON_TEXT.actFailed)).toBeVisible();

describe("SourcesClient: falha ao gravar no perfil local", () => {
  beforeEach(() => {
    current.profile = PROFILE;
    act.mockReset();
    act.mockResolvedValue(FAIL);
    send.mockClear();
    requestLoginInvite.mockClear();
  });

  it("seguir: avisa e não registra o seguir nem chama o convite", async () => {
    renderClient();
    await userEvent.click(screen.getAllByRole("button", { name: "Seguir Folha do Cerrado" })[0]!);
    await expectToast();
    expect(send).not.toHaveBeenCalledWith("source_followed", expect.anything(), expect.anything());
    expect(requestLoginInvite).not.toHaveBeenCalled();
  });

  it("ocultar: avisa e não anuncia que a fonte saiu das listas", async () => {
    renderClient();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Mais opções de Folha do Cerrado" })[0]!,
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Não tenho interesse" }));
    await expectToast();
    expect(screen.queryByText(SOURCES_PAGE.hiddenDone("Folha do Cerrado"))).toBeNull();
  });

  it("desfazer o ocultar que falha avisa", async () => {
    act.mockResolvedValueOnce(OK);
    renderClient();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Mais opções de Folha do Cerrado" })[0]!,
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Não tenho interesse" }));
    await userEvent.click(await screen.findByRole("button", { name: SOURCES_PAGE.undo }));
    await expectToast();
  });

  it("mostrar de novo uma fonte oculta avisa quando falha", async () => {
    current.profile = {
      ...PROFILE,
      hidden: [{ sourceSlug: "folha", reason: "not_interested", at: "2026-10-01T10:00:00Z" }],
    };
    renderClient();
    await userEvent.click(
      screen.getByRole("button", { name: SOURCES_PAGE.showAgainLabel("Folha do Cerrado") }),
    );
    await expectToast();
  });
});
