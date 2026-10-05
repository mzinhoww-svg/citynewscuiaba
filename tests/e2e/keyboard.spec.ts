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
    const outlined = (s: CSSStyleDeclaration) =>
      s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
    // R4/R5 + A-123: em campo com `control-field` o anel é do contêiner; o do controle some de
    // propósito (evita anel duplo). Desde a UX-W2-T2 vale também para select e textarea. Só o
    // contorno do contêiner conta, não a sombra do foco interno.
    const field = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)
      ? el.closest(".control-field")
      : null;
    // R7 + UX-W1-T9: no `card-link` o anel é do `::after`, que cobre o card inteiro.
    const card = el.classList.contains("card-link");
    const ring =
      outlined(cs) ||
      cs.boxShadow !== "none" ||
      (field !== null && outlined(getComputedStyle(field))) ||
      (card && outlined(getComputedStyle(el, "::after")));
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

/** Captura com prazo próprio: no WebKit sem foco de janela a captura pode travar; traz a aba à frente e repete uma vez. */
async function shot(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  try {
    return await page.screenshot({ clip, animations: "disabled", timeout: 8_000 });
  } catch {
    await page.bringToFront();
    return await page.screenshot({ clip, timeout: 8_000 });
  }
}

/** Foco visível: anel calculado e imagem diferente sem o foco. */
async function expectVisibleFocus(page: Page, f?: Focus): Promise<Focus> {
  let at = await settledFocus(page, f);
  // Folha e diálogos entram deslizando (320 ms): a caixa medida no meio do deslize não é a da
  // captura, que congela a animação no fim. Espera as animações finitas que contêm o foco
  // terminarem e lê o foco de novo.
  const waited = await page.evaluate(async () => {
    const active = document.activeElement;
    const running = document.getAnimations().filter((a) => {
      const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      return (
        a.effect?.getComputedTiming().iterations !== Infinity &&
        target !== null &&
        active !== null &&
        target.contains(active)
      );
    });
    await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
    return running.length;
  });
  if (waited > 0) at = await settledFocus(page);
  const name = `<${at.tag}> "${at.text || at.label}"`;
  expect(at.ring, `foco invisível em ${name}`).toBe(true);
  expect(at.inView, `foco fora da tela em ${name}`).toBe(true);
  expect(at.covered, `foco coberto por ${at.coveredBy} em ${name}`).toBe(false);
  if (at.tag === "body") return at;
  const box = await page.evaluate(() => {
    const el = document.activeElement!;
    // R4/R5 + A-123: o anel de um input em `.control-field` é pintado no contêiner; a captura
    // precisa cobrir o contêiner, senão o contorno cai fora do recorte.
    // No `card-link` o anel contorna o card (o bloco posicionado que contém o `::after`).
    const host =
      (el.tagName === "INPUT" && el.closest(".control-field")) ||
      (el.classList.contains("card-link") && (el as HTMLElement).offsetParent) ||
      el;
    const r = host.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const pad = 8;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(box.width + 2 * pad, 1200),
    height: Math.min(box.height + 2 * pad, 400),
  };
  // O anel de foco é pintado no quadro seguinte (no WebKit e no celular o primeiro quadro ainda
  // sai sem ele): espera dois quadros antes de cada captura, e repete uma vez antes de reprovar.
  // No WebKit sem foco de janela (CI) o requestAnimationFrame pode nunca disparar: um temporizador
  // de reserva libera a espera para o teste não travar até o limite de 30 s.
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) => {
          const fallback = setTimeout(done, 150);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              clearTimeout(fallback);
              done();
            }),
          );
        }),
    );
  await frames();
  const withFocus = await shot(page, clip);
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    (window as unknown as { __kbFocus?: HTMLElement }).__kbFocus = el;
    el.blur();
  });
  await frames();
  let without = await shot(page, clip);
  if (Buffer.compare(withFocus, without) === 0) {
    await page.waitForTimeout(250);
    await frames();
    without = await shot(page, clip);
  }
  expect(
    Buffer.compare(withFocus, without) !== 0,
    `o foco de ${name} não muda a imagem (indicador ausente)`,
  ).toBe(true);
  // Devolve o foco ao mesmo elemento. Não usa Shift+Tab e Tab: no WebKit o blur zera o ponto de
  // partida da navegação e o Tab volta ao início da página (e, num menu, o Tab o fecha).
  await page.evaluate(() => {
    (window as unknown as { __kbFocus?: HTMLElement }).__kbFocus?.focus();
  });
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

  // Na matéria o Next leva o foco ao conteúdo novo; seguimos só com Tab até "Informar problema"
  // (entrada única, no bloco "De onde veio" depois do texto: UX item 74), conferindo o foco a
  // cada parada.
  await tabUntil(page, (x) => x.text === "Informar problema", { max: 160 });
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
// Estados globais empilhados (UI-T7, Review Focus 3)

/** Simula uma página servida do cache: o SW "responde" que ela foi salva há 1 h. */
async function fakeCachedPage(page: Page) {
  await page.addInitScript(() => {
    const fake = {
      controller: {
        postMessage(_msg: unknown, ports: MessagePort[]) {
          ports[0]?.postMessage({ cachedAt: new Date(Date.now() - 3_600_000).toISOString() });
        },
      },
      register: async () => ({}),
      ready: new Promise(() => {}),
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, "serviceWorker", { value: fake, configurable: true });
  });
}

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const bottom = (b: Box) => b.y + b.height;
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < bottom(b) - 0.5 && b.y < bottom(a) - 0.5;

test("360×640 com consentimento pendente e aviso offline: fixos empilhados, linha fina e manchete visível", async ({
  page,
  context,
}, info) => {
  // Medida do celular (toque, barra inferior): o projeto desktop só encolhe a janela.
  test.skip(!info.project.name.startsWith("mobile"), "layout do celular");
  // A faixa Urgente não entra aqui: o seed não tem urgente e a home guarda os dados por 60 s
  // (tag `home`); a altura dela é conferida no teste do componente (UrgentBar, home.test.tsx).
  await context.clearCookies();
  await page.setViewportSize({ width: 360, height: 640 });
  await fakeCachedPage(page);
  await page.goto("/");
  const consent = page.getByRole("region", { name: /privacidade/i });
  const nav = page.getByRole("navigation", { name: "Principal" });
  const offline = page.getByRole("status").filter({ hasText: /Salva às/ });
  const header = page.getByRole("banner");
  for (const el of [consent, nav, offline, header]) await expect(el).toBeVisible();

  const c = await boxOf(consent);
  const n = await boxOf(nav);
  const o = await boxOf(offline);
  const h = await boxOf(header);
  // Fixos empilhados: banner acima da barra inferior, sem sobreposição entre os três.
  expect(bottom(c)).toBeLessThanOrEqual(n.y + 1);
  expect(overlap(c, n)).toBe(false);
  expect(overlap(h, c)).toBe(false);
  expect(overlap(h, n)).toBe(false);
  // Banner legível (A-147): até 180 px, como em consent.spec; soma dos fixos de baixo ≤ 40%.
  expect(c.height).toBeLessThanOrEqual(180);
  expect(c.height + n.height).toBeLessThanOrEqual(640 * 0.4);
  // O aviso de cópia antiga é uma linha fina.
  expect(o.height).toBeLessThanOrEqual(36);
  // Nada está coberto por outro fixo: o centro de cada um acerta nele mesmo.
  for (const [name, box, sel] of [
    ["banner", c, "section"],
    ["barra inferior", n, "nav"],
  ] as const) {
    const hit = await page.evaluate(
      ([x, y, s]) => document.elementFromPoint(x, y)?.closest(s) !== null,
      [box.x + box.width / 2, box.y + box.height / 2, sel] as const,
    );
    expect(hit, `${name} coberto`).toBe(true);
  }
  // A manchete aparece na janela livre entre o cabeçalho e o banner.
  const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(h1.y).toBeGreaterThanOrEqual(bottom(h) - 1);
  expect(h1.y).toBeLessThan(c.y - 24);
});

test("404 a 360×640 com consentimento pendente: busca e volta ao início ficam acima do banner", async ({
  page,
  context,
}, info) => {
  test.skip(!info.project.name.startsWith("mobile"), "layout do celular");
  await context.clearCookies();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/materia/nao-existe");
  const consent = (await page.getByRole("region", { name: /privacidade/i }).boundingBox())!;
  const search = (await page.getByRole("searchbox").boundingBox())!;
  const back = (await page.getByRole("link", { name: "Voltar ao início" }).boundingBox())!;
  expect(bottom(search)).toBeLessThanOrEqual(consent.y);
  expect(bottom(back)).toBeLessThanOrEqual(consent.y);
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
  // Entrada única (UX item 74): no bloco "De onde veio"; a versão visível na largura atual.
  const trigger = page
    .getByRole("region", { name: "De onde veio" })
    .getByRole("button", { name: "Informar problema" })
    .first();
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

test("gaveta Geração de imagem (E12): foco preso, Esc fecha e o foco volta @a11y", async ({
  page,
}) => {
  const t = tag();
  const id = await createArticle({ title: `Matéria para ilustrar ${t}`, status: "in_review" });
  created.push(id);
  await loginAs(page, "marina", `/estudio/materias/${id}`);
  const trigger = page.getByRole("button", { name: "Gerar ilustração" });
  await expectHydrated(trigger);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Geração de imagem" });
  await expect(dialog).toBeVisible();
  await expectFocusTrapped(page, dialog);
  await expectNoSeriousViolations(page, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectFocusOn(trigger, "Gerar ilustração");
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
  // O WebKit só mostra :focus-visible no foco por script se o foco anterior veio do teclado
  // (o gatilho focado por script não conta): devolve o foco ao gatilho com Shift+Tab e Tab.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
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
