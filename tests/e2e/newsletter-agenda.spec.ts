import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  buildAgendaEdition,
  rangeOfEdition,
  type EditionEvent,
} from "@/lib/newsletter/agenda-edition";
import { renderEditionEmail } from "@/lib/newsletter/email-html";
import type { Json } from "@/lib/db/types";
import { addDays } from "@/lib/format/date";
import { cronSecret, serviceClient } from "./helpers/pipeline";

/**
 * Edição da newsletter "Agenda do fim de semana" na web (ARD-T5, spec §6). A edição é gravada
 * direto no banco (mesmo formato que o job grava: itens montados por `buildAgendaEdition`),
 * numa sexta distante e própria de cada projeto (desktop e mobile rodam em paralelo). Os links
 * apontam para um evento do seed. Axe em 360, 768 e 1280 e vocabulário público.
 */
const FRIDAYS: Record<string, string> = { desktop: "2040-01-06", mobile: "2040-01-13" };
const DRAFTS: Record<string, string> = { desktop: "2040-02-03", mobile: "2040-02-10" };
/** Semana sem eventos: a rodada do job grava rascunho e revalida a tag `newsletter`. */
const EMPTY_WEEKS: Record<string, string> = { desktop: "2040-03-02", mobile: "2040-03-09" };
const SEED_EVENT = "noite-de-rasqueado-no-sesc-arsenal";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const FORBIDDEN =
  /normaliz|\bIA\b|inteligência artificial|gerad[oa]s?\b|revisad[oa]s?\b|automaticamente|automátic[oa]s?\b|\bagentes?\b/i;

let friday = "";
let draft = "";
let empty = "";

function events(date: string): EditionEvent[] {
  const at = (h: number) => new Date(`${date}T${String(h).padStart(2, "0")}:00:00-04:00`);
  const sat = new Date(at(12).getTime() + 86_400_000);
  const base: Omit<EditionEvent, "title" | "startsAt"> = {
    slug: SEED_EVENT,
    endsAt: null,
    venue: "Praça Fictícia",
    neighborhood: "Centro",
    priceCents: 0,
    isFree: true,
    priceUnknown: false,
    origin: "organizer",
    sourceName: "Casa Fictícia",
    confirmedByName: null,
    confirmed: true,
    confirmedAt: "2026-10-01T00:00:00Z",
  };
  return [
    { ...base, title: "Rasqueado na praça", startsAt: at(20).toISOString() },
    {
      ...base,
      slug: `${SEED_EVENT}-x`,
      title: "Feira de artesanato",
      startsAt: sat.toISOString(),
      priceUnknown: true,
      isFree: false,
      priceCents: null,
    },
    {
      ...base,
      slug: `${SEED_EVENT}-y`,
      title: "Teatro de bonecos",
      startsAt: new Date(sat.getTime() + 3 * 3_600_000).toISOString(),
      priceCents: 3000,
      isFree: false,
      origin: "newsroom",
      sourceName: null,
    },
  ];
}

async function upsert(date: string, status: "draft" | "aguardando_provedor") {
  const range = {
    ...rangeOfEdition(date),
    start: new Date(`${date}T00:00:00-04:00`),
    end: new Date(new Date(`${date}T00:00:00-04:00`).getTime() + 3 * 86_400_000 - 1000),
  };
  const e = buildAgendaEdition(events(date), range, { siteUrl: "http://localhost:3000" });
  const r = renderEditionEmail(e, { siteUrl: "http://localhost:3000" });
  const res = await serviceClient()
    .from("newsletter_editions")
    .upsert(
      {
        list: "agenda-fds",
        edition_date: date,
        subject: r.subject,
        html: r.html,
        text: r.text,
        items: e.items as unknown as NonNullable<Json>,
        status,
        published_at: status === "draft" ? null : new Date().toISOString(),
      },
      { onConflict: "list,edition_date" },
    );
  if (res.error) throw res.error;
}

test.beforeAll(async ({ playwright }, info) => {
  friday = FRIDAYS[info.project.name] ?? "2040-01-20";
  draft = DRAFTS[info.project.name] ?? "2040-02-17";
  empty = EMPTY_WEEKS[info.project.name] ?? "2040-03-16";
  await upsert(friday, "aguardando_provedor");
  await upsert(draft, "draft");
  // O job de verdade numa semana vazia: rascunho (nada publicado) e cache `newsletter` limpo,
  // para a amostra de /newsletter ler o banco atual (e não mostrar as edições de 2040).
  const api = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const now = encodeURIComponent(`${addDays(empty, -1)}T11:45:00-04:00`);
  const run = await api.post(`/api/jobs/newsletter-agenda?now=${now}`, {
    headers: { authorization: `Bearer ${cronSecret()}` },
  });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ status: "draft", editionDate: empty });
  await api.dispose();
});

test.afterAll(async () => {
  await serviceClient()
    .from("newsletter_editions")
    .delete()
    .eq("list", "agenda-fds")
    .in("edition_date", [friday, draft, empty]);
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

test("página da edição: dias, itens com link para a Agenda, axe e vocabulário", async ({
  page,
}) => {
  const res = await page.goto(`/newsletter/agenda/${friday}`);
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Agenda do fim de semana" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Agenda do fim de semana/);
  const fri = page.getByRole("region", { name: /^Sexta-feira/ });
  await expect(fri.getByRole("link", { name: "Rasqueado na praça" })).toHaveAttribute(
    "href",
    `/agenda/${SEED_EVENT}`,
  );
  await expect(fri.getByText("Com informações de Casa Fictícia")).toBeVisible();
  const sat = page.getByRole("region", { name: /^Sábado/ });
  await expect(sat.getByRole("listitem")).toHaveCount(2);
  await expect(sat.getByText("Consulte a fonte")).toBeVisible();
  await expect(
    page.getByText("Confirme horários e valores na fonte oficial antes de sair de casa."),
  ).toBeVisible();

  const body = await page.innerText("body");
  expect(body).not.toMatch(FORBIDDEN);
  expect(await page.title()).not.toMatch(FORBIDDEN);

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, `${width}px`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }

  await fri.getByRole("link", { name: "Rasqueado na praça" }).click();
  await expect(page).toHaveURL(new RegExp(`/agenda/${SEED_EVENT}$`));
});

test("rascunho, data sem edição e data inválida: 404", async ({ page }) => {
  for (const path of [
    `/newsletter/agenda/${draft}`,
    `/newsletter/agenda/${empty}`,
    "/newsletter/agenda/2039-12-30",
    "/newsletter/agenda/sexta",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("/newsletter: edição com data adiante nunca vira a amostra da última edição", async ({
  page,
}) => {
  await page.goto("/newsletter");
  await expect(page.getByText("Amostra da última edição").first()).toBeVisible();
  for (const date of [friday, draft, empty])
    await expect(page.locator(`a[href="/newsletter/agenda/${date}"]`)).toHaveCount(0);
});
