import { expect, test, type Page } from "@playwright/test";

/*
 * CSS global em camada (UX-W1-T9, item 18): as regras globais de tokens.css (anel de foco,
 * `text-wrap` de títulos e parágrafos) ficam em `@layer base`, então os utilitários vencem:
 *  - `card-link` mostra um anel só, em volta do card (o `::after`), não também no título;
 *  - em `control-field` o anel é do contêiner e o do `input` some sem `!important`;
 *  - `truncate` num `<p>` corta em uma linha (o `text-wrap: pretty` global não o desfaz).
 */

/** Tab até o elemento em foco ter a classe `cls` (no máximo `max` paradas). */
async function tabToClass(page: Page, cls: string, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(
      (c) => document.activeElement?.classList.contains(c) ?? false,
      cls,
    );
    if (hit) return;
  }
  throw new Error(`nenhum .${cls} alcançado em ${max} Tabs`);
}

test("card-link: um anel só, em volta do card @a11y", async ({ page }) => {
  await page.goto("/");
  await tabToClass(page, "card-link");
  const rings = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const card = el.offsetParent as HTMLElement | null;
    const on = (s: CSSStyleDeclaration) =>
      s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const chain: { who: string; ring: boolean }[] = [
      { who: "link", ring: on(getComputedStyle(el)) },
      { who: "link::after", ring: on(getComputedStyle(el, "::after")) },
    ];
    for (let n = el.parentElement; n && n !== card?.parentElement; n = n.parentElement) {
      chain.push({ who: n.tagName.toLowerCase(), ring: on(getComputedStyle(n)) });
    }
    return chain;
  });
  expect(rings.filter((r) => r.ring).map((r) => r.who)).toEqual(["link::after"]);
});

test("control-field: anel no contêiner, não no input @a11y", async ({ page }) => {
  await page.goto("/busca");
  const input = page.locator(".control-field input").first();
  await input.focus();
  const styles = await input.evaluate((el) => {
    const field = el.closest(".control-field") as HTMLElement;
    return {
      input: getComputedStyle(el).outlineStyle,
      field: getComputedStyle(field).outlineStyle,
    };
  });
  expect(styles.input).toBe("none");
  expect(styles.field).not.toBe("none");
});

test("truncate em <p> corta em uma linha", async ({ page }) => {
  await page.goto("/design-system");
  const p = page.getByTestId("ds-truncate");
  await expect(p).toBeVisible();
  const s = await p.evaluate((el) => ({
    whiteSpace: getComputedStyle(el).whiteSpace,
    overflowing: el.scrollWidth > el.clientWidth,
  }));
  expect(s.whiteSpace).toBe("nowrap");
  expect(s.overflowing).toBe(true);
});
