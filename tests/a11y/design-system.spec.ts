import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * A vitrine roda sobre o build de produção com CN_SHOW_DS=1 (playwright.config.ts).
 * Critério do plano P0-T9b: 0 violações serious/critical do axe.
 */
const blocking = (impact: string | null | undefined) =>
  impact === "serious" || impact === "critical";

/**
 * Espera a página (ou o elemento) parar: nenhuma animação ou transição finita presente. O axe
 * mede a cor pintada; no meio de um fade ou de uma troca de tema ela é intermediária e o
 * contraste sai falso. Não basta filtrar `playState === "running"`: o WebKit marca o fade como
 * `finished` e o mantém em getAnimations() com a opacidade congelada no último quadro (0,2 a
 * 0,9) até o quadro seguinte; o axe media aí o texto do diálogo a ~71% (#d5675f, 3,53:1). Só
 * quando a animação sai da lista o estilo final (Erro #c4281c, 5,7:1) está aplicado.
 */
async function settled(page: Page, selector?: string) {
  await expect
    .poll(() =>
      page.evaluate((sel) => {
        const roots = sel ? [...document.querySelectorAll(sel)] : [];
        if (sel && roots.length === 0) return -1;
        const anims = sel
          ? roots.flatMap((r) => r.getAnimations({ subtree: true }))
          : document.getAnimations();
        return anims.filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
          .length;
      }, selector),
    )
    .toBe(0);
}

test("vitrine do design system sem violações serious/critical @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await expect(
    page.getByRole("heading", { level: 1, name: "Vitrine do design system" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("vitrine no modo escuro sem violações serious/critical @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("radio", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // A troca de tema não anima cores (src/lib/theme/apply.ts); o axe só mede com a página parada:
  // nenhuma transição de CSS em andamento (cores intermediárias dariam contraste falso).
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-switching", /.*/);
  await settled(page);
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => blocking(v.impact));
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
});

test("diálogo modal abre, prende o foco e fecha com Esc @a11y", async ({ page }) => {
  await page.goto("/design-system");
  await page.getByRole("button", { name: "Abrir diálogo" }).click();
  const dialog = page.getByRole("dialog", { name: "Tem certeza de que deseja sair?" }).last();
  await expect(dialog).toBeVisible();
  // Fade de entrada do diálogo (motion-safe:animate-fade-in): mede só com ele parado.
  await settled(page, "dialog[open]");
  const results = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("mostrar senha funciona pelo teclado", async ({ page }) => {
  await page.goto("/design-system");
  const field = page.getByLabel("Senha", { exact: true });
  await field.focus();
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Mostrar senha" });
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(field).toHaveAttribute("type", "text");
});

test("fontes: menu de ocultar abre com teclado e fica sem violações @a11y", async ({ page }) => {
  await page.goto("/design-system");
  const trigger = page.getByRole("button", { name: "Mais opções de Placar MT" }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Por que ocultar Placar MT?" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Não tenho interesse" })).toBeFocused();
  const results = await new AxeBuilder({ page }).include("#ds-fontes").analyze();
  expect(results.violations.filter((v) => blocking(v.impact))).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
