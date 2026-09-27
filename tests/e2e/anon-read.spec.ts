import { expect, test, type Page } from "@playwright/test";

/*
 * docs/testing.md §2, item 1: visitante lê sem conta e sem convite bloqueante. Busca (P3) e
 * Fontes (P2) ainda não existem neste branch: a visita precisa responder sem erro de servidor
 * e sem bloqueio; o conteúdo delas é testado nas fases que as entregam.
 */
const PAGES = [
  { path: "/", h1: true },
  { path: "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro", h1: true },
  { path: "/assunto/obra-do-viaduto-na-miguel-sutil", h1: true },
  { path: "/agenda", h1: true },
  { path: "/busca?q=onibus", h1: true },
  { path: "/fontes", h1: true },
];

async function expectNotBlocked(page: Page) {
  // Nada modal aberto: nem <dialog open> modal nem aria-modal visível.
  await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(0);
  const modal = await page.evaluate(() =>
    [...document.querySelectorAll("dialog")].some((d) => d.open && d.matches(":modal")),
  );
  expect(modal).toBe(false);
  // O h1 não está coberto por banner ou convite: o ponto central dele é o próprio h1.
  const h1 = page.getByRole("heading", { level: 1 }).first();
  await expect(h1).toBeVisible();
  await h1.scrollIntoViewIfNeeded();
  const covered = await h1.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
    return !(hit && (el === hit || el.contains(hit)));
  });
  expect(covered).toBe(false);
}

for (const p of PAGES) {
  test(`anônimo lê ${p.path} sem convite bloqueante`, async ({ page, context }) => {
    await context.clearCookies();
    const r = await page.goto(p.path);
    expect(r!.status()).toBeLessThan(500);
    await expectNotBlocked(page);
    // Nenhum redirecionamento para login.
    expect(page.url()).not.toContain("/entrar");
  });
}

test("anônimo percorre home → matéria → assunto sem cookie de sessão", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/");
  await page.getByRole("heading", { level: 1 }).getByRole("link").click();
  await expect(page).toHaveURL(/\/materia\//);
  await expectNotBlocked(page);
  const topic = page.getByRole("navigation", { name: "Você está em" }).getByRole("link").nth(2);
  if (await topic.count()) {
    await topic.click();
    await expect(page).toHaveURL(/\/assunto\//);
    await expectNotBlocked(page);
  }
  const cookies = await context.cookies();
  expect(cookies.filter((c) => /sb-|session/i.test(c.name))).toEqual([]);
});
