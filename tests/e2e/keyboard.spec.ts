import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";
import { expectHydrated } from "./helpers/hydration";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";
import { forwardedFor } from "./own-ip";

/*
 * Navegação só por teclado (WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11; DESIGN.md §9 e R5):
 *  1. da home até ler uma matéria, com foco sempre visível e nunca coberto;
 *  2. no Estúdio, aprovar um item da fila só com teclado;
 *  3. diálogos e menus: foco preso enquanto abertos, Esc fecha e o foco volta ao gatilho.
 * O foco visível é medido de dois jeitos: o estilo calculado (anel de pelo menos 2 px) e a
 * imagem (o recorte em volta do elemento muda quando ele perde o foco).
 */
type Focus = {
  tag: string;
  href: string | null;
  text: string;
  label: string;
  ring: boolean;
  inView: boolean;
  covered: boolean;
  coveredBy: string;
};

async function focused(page: Page): Promise<Focus> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return {
        tag: "body",
        href: null,
        text: "",
        label: "",
        ring: true,
        inView: true,
        covered: false,
        coveredBy: "",
      };
    }
    const cs = getComputedStyle(el);
    const ring =
      (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== "none";
    const r = el.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
    // 2.4.11: um cabeçalho fixo ou a barra inferior não podem esconder o elemento com foco por
    // inteiro (parte coberta, num contêiner grande, é aceitável): coberto = todos os pontos da
    // parte visível caem em outro elemento.
    const vis = {
      l: Math.max(r.left, 0),
      t: Math.max(r.top, 0),
      r: Math.min(r.right, window.innerWidth - 1),
      b: Math.min(r.bottom, window.innerHeight - 1),
    };
    const pts = [
      [(vis.l + vis.r) / 2, (vis.t + vis.b) / 2],
      [vis.l + 2, vis.t + 2],
      [vis.r - 2, vis.t + 2],
      [vis.l + 2, vis.b - 2],
      [vis.r - 2, vis.b - 2],
    ] as const;
    const hit = (x: number, y: number) => {
      const top = document.elementFromPoint(x, y);
      return Boolean(top && (el.contains(top) || top.contains(el)));
    };
    const covered = inView && !pts.some(([x, y]) => hit(x, y));
    const [px, py] = pts[0];
    const cover = document.elementFromPoint(px, py);
    const coveredBy =
      covered && cover
        ? `${cover.tagName.toLowerCase()}.${String(cover.className).slice(0, 60)}`
        : "";
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute("href"),
      text: (el.textContent ?? "").trim().slice(0, 60),
      label: el.getAttribute("aria-label") ?? "",
      ring,
      inView,
      covered,
      coveredBy,
    };
  });
}

/** Lê o foco depois que a rolagem que o leva à vista termina (pode levar alguns quadros). */
async function settledFocus(page: Page, f?: Focus): Promise<Focus> {
  let at = f ?? (await focused(page));
  for (let i = 0; i < 15 && (!at.inView || at.covered); i++) {
    await page.waitForTimeout(100);
    at = await focused(page);
  }
  return at;
}

/** Foco visível: anel calculado e imagem diferente sem o foco. */
async function expectVisibleFocus(page: Page, f?: Focus): Promise<Focus> {
  const at = await settledFocus(page, f);
  const name = `<${at.tag}> "${at.text || at.label}"`;
  expect(at.ring, `foco invisível em ${name}`).toBe(true);
  expect(at.inView, `foco fora da tela em ${name}`).toBe(true);
  expect(at.covered, `foco coberto por ${at.coveredBy} em ${name}`).toBe(false);
  if (at.tag === "body") return at;
  const box = await page.evaluate(() => {
    const r = document.activeElement!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const pad = 8;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(box.width + 2 * pad, 1200),
    height: Math.min(box.height + 2 * pad, 400),
  };
  const withFocus = await page.screenshot({ clip, animations: "disabled" });
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const without = await page.screenshot({ clip, animations: "disabled" });
  expect(
    Buffer.compare(withFocus, without) !== 0,
    `o foco de ${name} não muda a imagem (indicador ausente)`,
  ).toBe(true);
  // Devolve o foco ao mesmo elemento (com o indicador de teclado).
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  return at;
}

/** Tab até `match` aceitar o elemento em foco; confere o foco visível a cada parada. */
async function tabUntil(
  page: Page,
  match: (f: Focus) => boolean,
  { max = 120, visual = false }: { max?: number; visual?: boolean } = {},
): Promise<Focus> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await focused(page);
    if (visual) await expectVisibleFocus(page, f);
    else {
      const at = await settledFocus(page, f);
      const name = `<${at.tag}> "${at.text || at.label}"`;
      expect(at.ring, `foco invisível em ${name}`).toBe(true);
      expect(at.inView, `foco fora da tela em ${name}`).toBe(true);
      expect(at.covered, `foco coberto por ${at.coveredBy} em ${name}`).toBe(false);
    }
    if (match(f)) return f;
  }
  throw new Error(`o foco não chegou ao elemento esperado em ${max} Tabs`);
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.setExtraHTTPHeaders(forwardedFor());
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
});

test("só teclado: da home até ler uma matéria, com foco sempre visível", async ({ page }) => {
  await page.goto("/");
  await expectHydrated(page.getByRole("link", { name: "Pular para o conteúdo" }));
  // Primeira parada: "Pular para o conteúdo".
  await page.keyboard.press("Tab");
  let f = await focused(page);
  expect(f.text).toBe("Pular para o conteúdo");
  await expectVisibleFocus(page, f);

  // Tab até a manchete (link para /materia/…), com o foco conferido em cada parada.
  f = await tabUntil(page, (x) => (x.href ?? "").startsWith("/materia/"), { visual: true });
  expect(f.href).toMatch(/^\/materia\//);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/materia\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Na matéria o Next leva o foco ao conteúdo novo; seguimos só com Tab até os controles da
  // matéria (Informar problema), conferindo o foco a cada parada.
  await tabUntil(page, (x) => x.text === "Informar problema", { max: 80 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("só teclado: a busca da home leva a uma matéria", async ({ page }) => {
  await page.goto("/busca");
  await expectHydrated(page.getByRole("search").getByRole("combobox").first());
  await tabUntil(page, (x) => x.tag === "input");
  await page.keyboard.type("viaduto");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/busca\?q=viaduto/);
  const f = await tabUntil(page, (x) => (x.href ?? "").startsWith("/materia/"), { max: 100 });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/materia\//);
  expect(f.href).toBeTruthy();
});

// ---------------------------------------------------------------------------------------------
// Estúdio

const created: string[] = [];
test.afterAll(async () => {
  await removeArticles(created);
});

test("Estúdio: aprovar um item da fila só com o teclado", async ({ page }) => {
  const t = tag();
  const title = `Cobertura de teclado ${t}`;
  const id = await createArticle({
    title,
    section_slug: "cultura",
    status: "in_review",
    kind: "normalized",
    agent_id: "write",
    review_reason: "Regras mandaram revisar",
    tags: ["teatro"],
    neighborhoods: ["porto"],
    seo_title: "Cobertura de teclado no Porto",
    seo_description: "Teste de navegação por teclado na fila do Estúdio, em Cuiabá.",
  });
  created.push(id);

  await loginAs(page, "marina", "/estudio/fila");
  await expectHydrated(page.getByRole("main"));
  // Da fila até a revisão do item: só Tab e Enter.
  await tabUntil(page, (x) => (x.href ?? "").endsWith(`/estudio/fila/${id}`), {
    max: 200,
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/estudio/fila/${id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(title);

  // Da revisão até "Aprovar e publicar", e Enter aprova.
  const approve = page.getByRole("button", { name: "Aprovar e publicar" });
  await expect(approve).toBeEnabled();
  await expectHydrated(approve);
  await tabUntil(page, (x) => x.text === "Aprovar e publicar", { max: 200 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /publicad/i })).toBeVisible();
  const { data } = await service().from("articles").select("status").eq("id", id).single();
  expect(data?.status).toBe("published");
});

// ---------------------------------------------------------------------------------------------
// Diálogos e menus

/**
 * Com o diálogo aberto, Tab e Shift+Tab nunca levam o foco à página atrás dele (2.1.2). O
 * `<dialog>` modal nativo deixa o foco passar pela interface do navegador ao sair do último
 * controle (`activeElement` vira `body`); isso não é uma armadilha, e o Tab seguinte volta ao
 * primeiro controle do diálogo.
 */
async function expectFocusTrapped(page: Page, dialog: Locator) {
  const where = () =>
    dialog.evaluate((d) => {
      const a = document.activeElement;
      if (!a || a === document.body) return "navegador";
      return d.contains(a) ? "diálogo" : "página";
    });
  const seen = new Set<string>();
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(key);
      const w = await where();
      expect(w, `o foco foi para a página atrás do diálogo (${key} ${i + 1})`).not.toBe("página");
      if (w === "diálogo") {
        const f = await focused(page);
        seen.add(`${f.tag}:${f.text || f.label}`);
        await expectVisibleFocus(page, f);
      }
    }
  }
  expect(seen.size, "o diálogo tem controles alcançáveis por Tab").toBeGreaterThanOrEqual(2);
}

async function expectFocusOn(trigger: Locator, what: string) {
  await expect(trigger, `o foco não voltou para ${what}`).toBeFocused();
}

test("diálogo Informar problema: foco preso, Esc fecha e o foco volta ao botão @a11y", async ({
  page,
}) => {
  await page.goto("/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  const trigger = page.getByRole("button", { name: "Informar problema" });
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await expectNoSeriousViolations(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocusOn(trigger, "Informar problema");
});

test("diálogo Compartilhar: foco preso e devolvido @a11y", async ({ page }) => {
  await page.goto("/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro");
  const trigger = page.getByRole("button", { name: "Compartilhar" }).first();
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocusOn(trigger, "Compartilhar");
});

test("diálogo Rejeitar no Estúdio: foco preso, Esc fecha e o foco volta @a11y", async ({
  page,
}) => {
  const t = tag();
  const id = await createArticle({
    title: `Item para o diálogo ${t}`,
    kind: "normalized",
    agent_id: "write",
    status: "in_review",
    review_reason: "Regras mandaram revisar",
  });
  created.push(id);
  await loginAs(page, "marina", `/estudio/fila/${id}`);
  const trigger = page.getByRole("button", { name: "Rejeitar", exact: true });
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await expectNoSeriousViolations(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocusOn(trigger, "Rejeitar");
});

test("diálogo Publicar no editor: foco preso, Esc fecha e o foco volta @a11y", async ({ page }) => {
  const t = tag();
  const id = await createArticle({
    title: `Matéria para publicar ${t}`,
    section_slug: "cultura",
    status: "in_review",
    tags: ["teatro"],
    neighborhoods: ["porto"],
    seo_title: "Matéria para publicar",
    seo_description: "Teste do diálogo de publicação por teclado, em Cuiabá.",
  });
  created.push(id);
  await loginAs(page, "marina", `/estudio/materias/${id}`);
  const trigger = page.getByRole("button", { name: "Publicar", exact: true });
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Publicação e agendamento" });
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await expectNoSeriousViolations(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocusOn(trigger, "Publicar");
});

test("menu de ações da fonte: setas navegam, Esc fecha e o foco volta ao gatilho @a11y", async ({
  page,
}) => {
  await loginAs(page, "diego", "/estudio/control/fontes");
  const trigger = page.getByRole("button", { name: /Ações de .*Folha do Cerrado/ }).first();
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu").first();
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await expectVisibleFocus(page);
  // Só o menu: com a rolagem do foco, uma linha da lista pode ficar sob o cabeçalho fixo e o axe
  // conta o alvo como parcialmente coberto (a página inteira é medida em all-routes.spec.ts).
  await expectNoSeriousViolations(page, '[role="menu"]');
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expectFocusOn(trigger, "o gatilho do menu");
});
