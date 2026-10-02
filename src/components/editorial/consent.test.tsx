import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";
import { getAnonStore } from "@/lib/anon/store";
import { ConsentProvider } from "@/lib/consent/client";
import { parseConsent, readConsentCookie } from "@/lib/consent";
import { ConsentBanner, PrivacyPreferences } from "../index";

function clearCookie() {
  document.cookie = "cn_consent=; Path=/; Max-Age=0";
}

beforeEach(clearCookie);

function renderBanner(initial = parseConsent(undefined)) {
  return render(
    <ConsentProvider initial={initial}>
      <main id="conteudo">
        <h1>Manchete</h1>
      </main>
      <ConsentBanner />
    </ConsentProvider>,
  );
}

it("primeira visita: região com as três escolhas, sem ser modal", () => {
  renderBanner();
  const region = screen.getByRole("region", { name: "Sua privacidade" });
  expect(region).not.toHaveAttribute("aria-modal");
  for (const name of ["Só o necessário", "Escolher", "Aceitar recomendações"])
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Saiba mais sobre privacidade" })).toHaveAttribute(
    "href",
    "/privacidade",
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("quem já escolheu não vê o banner", () => {
  renderBanner(parseConsent("v1|m0|p0"));
  expect(screen.queryByRole("region", { name: "Sua privacidade" })).toBeNull();
});

it("Só o necessário grava m0|p0, fecha e devolve o foco ao conteúdo", async () => {
  renderBanner();
  await userEvent.click(screen.getByRole("button", { name: "Só o necessário" }));
  expect(readConsentCookie(document.cookie)).toMatchObject({
    decided: true,
    metrics: false,
    personalization: false,
  });
  expect(screen.queryByRole("region", { name: "Sua privacidade" })).toBeNull();
  expect(document.activeElement?.id).toBe("conteudo");
});

it("Aceitar recomendações grava m1|p1 e cria o anonId; Só o necessário apaga", async () => {
  const { unmount } = renderBanner();
  await userEvent.click(screen.getByRole("button", { name: "Aceitar recomendações" }));
  expect(readConsentCookie(document.cookie)).toMatchObject({
    metrics: true,
    personalization: true,
  });
  await waitFor(async () => expect((await getAnonStore().get()).anonId).toMatch(/^[0-9a-f-]{36}$/));
  unmount();
  clearCookie();
  renderBanner();
  await userEvent.click(screen.getByRole("button", { name: "Só o necessário" }));
  await waitFor(async () => expect((await getAnonStore().get()).anonId).toBeNull());
});

it("Escolher abre o painel com foco no título, Esc volta sem prender o foco", async () => {
  renderBanner();
  await userEvent.click(screen.getByRole("button", { name: "Escolher" }));
  // O painel é carregado sob demanda (B-018).
  const title = await screen.findByRole("heading", { name: "Escolha o que o CityNews pode usar" });
  await waitFor(() => expect(document.activeElement).toBe(title));
  expect(screen.getByRole("switch", { name: "Métricas agregadas" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(screen.getByRole("switch", { name: "Personalização" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(screen.getByText("Sempre ativos")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Escolha o que o CityNews pode usar" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Escolher" }));
});

it("Escolher e salvar grava só o que foi ligado", async () => {
  renderBanner();
  await userEvent.click(screen.getByRole("button", { name: "Escolher" }));
  await userEvent.click(await screen.findByRole("switch", { name: "Métricas agregadas" }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar escolhas" }));
  expect(readConsentCookie(document.cookie)).toMatchObject({
    decided: true,
    metrics: true,
    personalization: false,
  });
  expect(screen.queryByRole("region", { name: "Sua privacidade" })).toBeNull();
});

it("preferências em /privacidade mostram e trocam a escolha atual", async () => {
  render(
    <ConsentProvider initial={parseConsent("v1|m1|p0")}>
      <PrivacyPreferences />
    </ConsentProvider>,
  );
  const perso = screen.getByRole("switch", { name: "Personalização" });
  expect(screen.getByRole("switch", { name: "Métricas agregadas" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(perso).toHaveAttribute("aria-checked", "false");
  await userEvent.click(perso);
  await userEvent.click(screen.getByRole("button", { name: "Salvar escolhas" }));
  expect(readConsentCookie(document.cookie)).toMatchObject({
    metrics: true,
    personalization: true,
  });
  expect(screen.getByRole("status")).toHaveTextContent("Escolhas salvas.");
});
