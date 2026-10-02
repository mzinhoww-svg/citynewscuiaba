import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { parseConsent } from "@/lib/consent";
import { ConsentProvider } from "@/lib/consent/client";
import { ConsentBanner, ReadTracker } from "../index";

const beacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>(() => true);

beforeEach(() => {
  beacon.mockClear();
  Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  document.cookie = "cn_consent=; Path=/; Max-Age=0";
});
afterEach(() => vi.useRealTimers());

function sent(): { name: string; anonId: string | null; consent: { personalization: boolean } }[] {
  return beacon.mock.calls.map(([, body]) => JSON.parse(String(body)));
}

function readPage(cookie: string) {
  return render(
    <ConsentProvider initial={parseConsent(cookie)}>
      <article id="materia">texto</article>
      <ReadTracker contentId="article:abc-1" targetId="materia" />
    </ConsentProvider>,
  );
}

it("leitura qualificada vira article_read com métricas, sem identificador", async () => {
  vi.useFakeTimers();
  readPage("v1|m1|p0");
  await act(async () => {
    vi.advanceTimersByTime(61_000);
  });
  const events = sent();
  expect(events.map((e) => e.name)).toEqual(["article_read"]);
  expect(events[0]!.anonId).toBeNull();
});

it("leitura curta não envia nada", async () => {
  vi.useFakeTimers();
  readPage("v1|m1|p0");
  await act(async () => {
    vi.advanceTimersByTime(20_000);
  });
  expect(beacon).not.toHaveBeenCalled();
});

it("Só o necessário: nenhuma chamada", async () => {
  vi.useFakeTimers();
  readPage("v1|m0|p0");
  await act(async () => {
    vi.advanceTimersByTime(120_000);
  });
  expect(beacon).not.toHaveBeenCalled();
});

it("Aceitar recomendações envia personalization_enabled com anonId", async () => {
  render(
    <ConsentProvider initial={parseConsent(undefined)}>
      <main id="conteudo" />
      <ConsentBanner />
    </ConsentProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Aceitar recomendações" }));
  await waitFor(() => expect(sent().map((e) => e.name)).toContain("privacy_settings_updated"));
  const enabled = sent().find((e) => e.name === "personalization_enabled")!;
  expect(enabled.anonId).toMatch(/^[0-9a-f-]{36}$/);
  expect(enabled.consent.personalization).toBe(true);
});

it("Só o necessário no banner não envia nada", async () => {
  render(
    <ConsentProvider initial={parseConsent(undefined)}>
      <main id="conteudo" />
      <ConsentBanner />
    </ConsentProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Só o necessário" }));
  await new Promise((r) => setTimeout(r, 50));
  expect(beacon).not.toHaveBeenCalled();
});
