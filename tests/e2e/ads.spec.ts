import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousViolations } from "../a11y/axe";
import { service } from "./studio";

/*
 * ADS-T2 · Campos de banner nas páginas (plano banners-padrão, decisões do dono de 04/10/2026):
 * formato próprio no tablet, lateral abaixo do "Agora"/"Mais lidas", rodapé fixo empilhado sobre a
 * barra inferior. Usa Gastronomia (fora dos roteiros de acessibilidade) e uma matéria própria; as
 * peças são segmentadas para Gastronomia, então não aparecem na home nem nas outras editorias.
 * O cache dos campos é de 60 s: cada verificação recarrega até a peça aparecer.
 */

const run = randomUUID().slice(0, 8);
const SECTION = "gastronomia";
const slug = `teste-anuncio-${run}`;
const href = `https://padaria.example/${run}`;
const created = {
  creatives: [] as string[],
  placements: {} as Record<string, string>,
  article: "",
};

const FORMATS: [string, number, number][] = [
  ["TOP", 970, 250],
  ["TOP", 728, 90],
  ["TOP", 320, 100],
  ["RAIL-A", 300, 250],
  ["RAIL-B", 300, 600],
  ["ART-1", 728, 90],
  ["ART-1", 320, 100],
  ["ART-2", 728, 250],
  ["ART-2", 300, 250],
  ["STICKY", 320, 50],
];

const paragraph = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.beforeAll(async () => {
  const db = service();
  for (const [slot, width, height] of FORMATS) {
    const c = await db
      .from("ad_creatives")
      .insert({
        slot,
        name: `E2E ${slot} ${width}x${height} ${run}`,
        status: "active",
        creative: {
          kind: "display",
          slot,
          width,
          height,
          imageUrl: `https://img.example/${slot}-${width}x${height}.png`,
          alt: `Padaria do Porto ${slot} ${width}x${height}`,
          href,
          weight: 1,
        },
      })
      .select("id")
      .single();
    if (c.error) throw c.error;
    created.creatives.push(c.data.id);
    const p = await db
      .from("ad_placements")
      .insert({
        creative_id: c.data.id,
        slot,
        starts_on: "2026-01-01",
        ends_on: "2099-12-31",
        allowed_sections: [SECTION],
        status: "active",
      })
      .select("id")
      .single();
    if (p.error) throw p.error;
    created.placements[`${slot}-${width}x${height}`] = p.data.id;
  }
  const id = randomUUID();
  const a = await db.from("articles").insert({
    id,
    slug,
    kind: "original",
    section_slug: SECTION,
    title: `Feira da Orla ganha barracas novas ${run}`,
    dek: "Peixe na brasa e doces de caju no Porto.",
    body: {
      type: "doc",
      content: [1, 2, 3, 4, 5, 6].map((n) => paragraph(`Parágrafo ${n} da matéria de teste.`)),
    },
    status: "published",
    publish_mode: "human",
    published_at: new Date().toISOString(),
  });
  if (a.error) throw a.error;
  created.article = id;
});

test.afterAll(async () => {
  const db = service();
  await db.from("ad_placements").delete().in("id", Object.values(created.placements));
  await db.from("ad_creatives").delete().in("id", created.creatives);
  if (created.article) await db.from("articles").delete().eq("id", created.article);
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
});

// Página em ISR (60 s na editoria) + lista de peças em cache (60 s): peça nova aparece em até
// ~2 min, como em produção. Os testes esperam esse tempo, sem mexer no cache.
test.setTimeout(240_000);
const CACHE_WAIT = { timeout: 200_000, intervals: [3_000, 5_000, 10_000] };

/** Recarrega até o campo aparecer. */
async function openWithSlot(page: Page, url: string, slot: string) {
  await expect
    .poll(async () => {
      await page.goto(url);
      return page.locator(`[data-ad-slot="${slot}"]`).count();
    }, CACHE_WAIT)
    .toBeGreaterThan(0);
}

/** Recarrega e rola até o fim até o rodapé fixo aparecer. */
async function openWithSticky(page: Page, url: string) {
  await expect
    .poll(async () => {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      return page.locator("[data-ad-sticky]").count();
    }, CACHE_WAIT)
    .toBeGreaterThan(0);
}

test.describe("desktop e tablet", () => {
  test.skip(({ isMobile }) => isMobile, "visão de desktop e tablet");

  test("editoria: faixa de topo, lateral abaixo de Mais lidas, rótulo e link patrocinado", async ({
    page,
  }) => {
    await openWithSlot(page, `/${SECTION}`, "TOP");
    const top = page.locator('[data-ad-slot="TOP"]');
    const box = top.locator('[data-ad-device="desktop"]');
    await expect(box).toBeVisible();
    expect(await box.evaluate((e) => (e as HTMLElement).style.aspectRatio)).toBe("970 / 250");
    await expect(top.getByText("Publicidade").first()).toBeVisible();
    const link = top.getByRole("link", { name: "Padaria do Porto TOP 970x250" });
    await expect(link).toHaveAttribute("rel", "sponsored noopener");
    await expect(link).toHaveAttribute(
      "href",
      `/api/ads/click/${created.placements["TOP-970x250"]}?s=${SECTION}`,
    );
    await expect(page.locator('[data-ad-slot="RAIL-A"] [data-ad-device="desktop"]')).toBeVisible();
    await expect(page.locator('[data-ad-slot="RAIL-B"] [data-ad-device="desktop"]')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("tablet (820 px) usa o formato próprio 728×90 e esconde a lateral", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1100 });
    await openWithSlot(page, `/${SECTION}`, "TOP");
    const tablet = page.locator('[data-ad-slot="TOP"] [data-ad-device="tablet"]');
    await expect(tablet).toBeVisible();
    expect(await tablet.evaluate((e) => (e as HTMLElement).style.aspectRatio)).toBe("728 / 90");
    await expect(page.locator('[data-ad-slot="TOP"] [data-ad-device="desktop"]')).toBeHidden();
    await expect(page.locator('[data-ad-slot="RAIL-A"] [data-ad-device="desktop"]')).toBeHidden();
  });

  test("matéria: ART-1 depois do 4º parágrafo e ART-2 no fim, sem salto de layout", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openWithSlot(page, `/materia/${slug}`, "ART-1");
    const before = await page.evaluate(() => {
      const body = document.querySelector(".reading-body")!;
      const ad = body.querySelector('[data-ad-slot="ART-1"]')!;
      const kids = [...body.children];
      return kids.slice(0, kids.indexOf(ad)).filter((k) => /Parágrafo/.test(k.textContent ?? ""))
        .length;
    });
    expect(before).toBe(4);
    await expect(page.locator('[data-ad-slot="ART-2"]')).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThanOrEqual(0.1);
  });

  test("Política e a home não recebem as peças segmentadas", async ({ page }) => {
    await openWithSlot(page, `/${SECTION}`, "TOP");
    await page.goto("/politica");
    await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByAltText(/Padaria do Porto/)).toHaveCount(0);
  });

  test("o clique conta e leva ao anunciante (302)", async ({ request }) => {
    const r = await request.get(
      `/api/ads/click/${created.placements["TOP-970x250"]}?s=${SECTION}`,
      {
        maxRedirects: 0,
        headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0" },
      },
    );
    expect(r.status()).toBe(302);
    expect(r.headers()["location"]).toBe(href);
  });
});

test.describe("celular", () => {
  test.skip(({ isMobile }) => !isMobile, "visão de celular");

  test("formato de celular e rodapé fixo empilhado sobre a barra, dispensável na sessão", async ({
    page,
  }) => {
    await openWithSlot(page, `/materia/${slug}`, "ART-1");
    const mobile = page.locator('[data-ad-slot="ART-1"] [data-ad-device="mobile"]');
    await expect(mobile).toBeVisible();
    expect(await mobile.evaluate((e) => (e as HTMLElement).style.aspectRatio)).toBe("320 / 100");
    // Antes de rolar, o rodapé não existe (só depois de 40% da página).
    await expect(page.locator("[data-ad-sticky]")).toHaveCount(0);

    await openWithSticky(page, `/materia/${slug}`);
    const sticky = page.locator("[data-ad-sticky]");
    await expect(sticky).toBeVisible();
    const bar = await sticky.boundingBox();
    const nav = await page.getByRole("navigation", { name: "Principal" }).last().boundingBox();
    expect(bar && nav && bar.y + bar.height <= nav.y + 1).toBe(true);

    await page.getByRole("button", { name: "Fechar publicidade" }).click();
    await expect(sticky).toHaveCount(0);
    await page.reload();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator("[data-ad-sticky]")).toHaveCount(0);
  });
});
