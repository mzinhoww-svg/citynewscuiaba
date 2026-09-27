import { expect, test, type Page } from "@playwright/test";

/*
 * Roteiro P1 (docs/testing.md §3): navegar só com teclado da home até ler uma matéria, com
 * foco sempre visível (DESIGN.md R5: anel sólido de 3 px em todo :focus-visible).
 */
type Focus = { tag: string; href: string | null; text: string; ring: boolean; inView: boolean };

async function focused(page: Page): Promise<Focus> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { tag: "body", href: null, text: "", ring: true, inView: true };
    }
    const cs = getComputedStyle(el);
    const ring =
      (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== "none";
    const r = el.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute("href"),
      text: (el.textContent ?? "").trim().slice(0, 60),
      ring,
      inView,
    };
  });
}

test("só teclado: da home até ler uma matéria, com foco sempre visível", async ({ page }) => {
  await page.goto("/");
  // Primeira parada: "Pular para o conteúdo".
  await page.keyboard.press("Tab");
  let f = await focused(page);
  expect(f.text).toBe("Pular para o conteúdo");
  expect(f.ring && f.inView).toBe(true);

  // Tab até a manchete (link para /materia/…), conferindo o anel a cada parada.
  let steps = 0;
  while (!(f.href ?? "").startsWith("/materia/") && steps < 80) {
    await page.keyboard.press("Tab");
    f = await focused(page);
    expect(f.ring, `foco invisível em <${f.tag}> "${f.text}"`).toBe(true);
    expect(f.inView, `foco fora da tela em <${f.tag}> "${f.text}"`).toBe(true);
    steps++;
  }
  expect(f.href).toMatch(/^\/materia\//);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/materia\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Na matéria o Next leva o foco ao conteúdo novo; seguimos só com Tab até os controles
  // da matéria (Informar problema), conferindo o anel a cada parada.
  steps = 0;
  do {
    await page.keyboard.press("Tab");
    f = await focused(page);
    expect(f.ring, `foco invisível em <${f.tag}> "${f.text}"`).toBe(true);
    expect(f.inView, `foco fora da tela em <${f.tag}> "${f.text}"`).toBe(true);
    steps++;
  } while (f.text !== "Informar problema" && steps < 60);
  expect(f.text).toBe("Informar problema");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
