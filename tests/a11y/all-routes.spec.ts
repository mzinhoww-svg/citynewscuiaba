import { loadEnvConfig } from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { controlFixture, type ControlFixture } from "../e2e/control";
import { forwardedFor } from "../e2e/own-ip";
import { service, STAFF } from "../e2e/studio";
import { addSessionCookies, loginAs, sessionCookiesFor } from "../e2e/helpers/studio-login";
import { signNewsletterToken } from "../../src/lib/newsletter/token";
import { expectNoSeriousViolations, settle, smallTargets, structureFindings } from "./axe";
import {
  FIRST_VISIT_ROUTES,
  PUBLIC_ROUTES,
  READER_ROUTES,
  STAFF_BY_ROLE,
  STUDIO_ROUTES,
  rolesFor,
  type Ids,
} from "./routes";

/*
 * Varredura de acessibilidade de TODAS as rotas de docs/screens.md (WCAG 2.2 AA, axe com 0
 * violações serious/critical), com os dados do seed, nos temas claro e escuro. Os dois tamanhos
 * (390 e 1280 px) vêm dos projetos `mobile` e `desktop` do playwright.config.ts.
 *
 *  - Público sem sessão (P01–P26, C02–C06), com `cn_consent` gravado para medir a página e não o
 *    banner; a primeira visita (banner aberto) tem grupo próprio.
 *  - Conta: leitor logado nas telas que mudam com a sessão.
 *  - Estúdio, Control Center e Administração: cada rota com cada papel que a matriz de permissões
 *    (src/lib/auth/permissions.ts) deixa entrar. Tema claro com todos os papéis; tema escuro com
 *    o primeiro papel da rota (o papel só troca o conteúdo, não as cores). No WebKit do CI
 *    (`mobile-webkit`) roda só o primeiro papel: o motor é o que muda, não a matriz de papéis.
 *
 * Ficam em outros specs, por medirem outra dimensão: a vitrine /design-system (design-system.spec),
 * o painel de fontes do admin em 360/768/1280 px (control-sources.spec) e /app, convites e A09
 * do admin em 3 larguras (pwa.spec). Diálogos e menus abertos, com axe: tests/e2e/keyboard.spec.ts.
 */
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const SCHEMES = ["light", "dark"] as const;

/** Espera a tela carregar de verdade (a fronteira de erro também passaria no axe). */
async function expectRendered(page: Page, expectedPath?: string) {
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).not.toHaveText(
    /Não foi possível carregar|Algo deu errado/,
  );
  // DESIGN.md §9: um h1 e um main por página, tabelas com th scope.
  await expect(page.locator("h1:visible").first()).toBeVisible();
  expect(await structureFindings(page)).toEqual([]);
  if (expectedPath) {
    // Sem redirecionamento para /entrar: o papel realmente entrou na tela.
    const want = new URL(expectedPath, "http://x").pathname;
    expect(new URL(page.url()).pathname, "redirecionado: papel sem acesso à rota").toBe(want);
  }
}

// ---------------------------------------------------------------------------------------------
// Público sem sessão

test.describe("público sem sessão", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    // IP próprio por teste: as visitas a /pergunte contam no limite de 20 perguntas por hora.
    await context.setExtraHTTPHeaders(forwardedFor());
    await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
  });
  for (const scheme of SCHEMES) {
    test.describe(`tema ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      for (const path of PUBLIC_ROUTES) {
        test(`@a11y ${path}`, async ({ page }) => {
          await page.goto(path);
          await expectRendered(page);
          await expectNoSeriousViolations(page);
        });
      }
    });
  }
});

test.describe("primeira visita, com o banner de consentimento", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(forwardedFor());
  });
  for (const scheme of SCHEMES) {
    test.describe(`tema ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      for (const path of FIRST_VISIT_ROUTES) {
        test(`@a11y ${path}`, async ({ page }) => {
          await page.goto(path);
          await expectRendered(page);
          await expect(
            page.getByRole("region", { name: /privacidade|consentimento/i }),
          ).toBeVisible();
          await expectNoSeriousViolations(page);
        });
      }
    });
  }
});

test.describe("links assinados de newsletter e alerta", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.setExtraHTTPHeaders(forwardedFor());
    await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
  });
  const links = () => {
    const email = "a11y@exemplo.com";
    const nl = (exp: number, extra = "") =>
      `/newsletter/preferencias?token=${encodeURIComponent(
        signNewsletterToken("newsletter", email, ["diaria", "agenda-fds"], exp),
      )}${extra}`;
    return [
      ["preferências", nl(3600)],
      ["confirmar inscrição", nl(3600, "&confirmar=1")],
      ["link expirado", nl(-10)],
      [
        "alerta a confirmar",
        `/alertas/confirmar?token=${encodeURIComponent(
          signNewsletterToken("alert", email, ["alert:coxipo"], 3600),
        )}`,
      ],
    ] as const;
  };
  for (const scheme of SCHEMES) {
    test.describe(`tema ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      for (const [name] of links()) {
        test(`@a11y ${name}`, async ({ page }) => {
          const url = links().find(([n]) => n === name)![1];
          await page.goto(url);
          await expectRendered(page);
          await expectNoSeriousViolations(page);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Reflow, movimento reduzido e alvos de toque nas telas-chave

const KEY_ROUTES = [
  "/",
  "/cidade",
  "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro",
  "/busca?q=viaduto",
  "/fontes",
  "/agenda",
  "/pergunte",
  "/perfil",
  "/entrar",
];

test.describe("reflow, movimento reduzido e alvos de toque", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.setExtraHTTPHeaders(forwardedFor());
    await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
  });
  for (const path of KEY_ROUTES) {
    test(`@a11y ${path} sem rolagem horizontal em 320 px (WCAG 1.4.10)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      await expectRendered(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "a página rola na horizontal em 320 px").toBeLessThanOrEqual(0);
    });

    test(`@a11y ${path} sem movimento contínuo com prefers-reduced-motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      await expectRendered(page);
      await settle(page);
      const moving = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => {
            const t = a.effect?.getComputedTiming();
            return { iterations: t?.iterations, duration: Number(t?.duration) };
          })
          // Com movimento reduzido tudo dura 1 ms e roda uma vez (tokens.css); nada infinito.
          .filter((a) => a.iterations === Infinity || a.duration > 50),
      );
      expect(moving).toEqual([]);
    });

    test(`@a11y ${path} com alvos de toque de pelo menos 44 px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === "desktop", "alvo de toque vale no celular");
      await page.goto(path);
      await expectRendered(page);
      expect(await smallTargets(page)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Conta (leitor logado)

test.describe("leitor com conta", () => {
  const email = `a11y-leitor-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
  const password = "citynews-local-123";
  let userId: string;

  test.beforeAll(async () => {
    const { data, error } = await service().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Leitora de Acessibilidade" },
    });
    if (error) throw error;
    userId = data.user.id;
  });
  test.afterAll(async () => {
    if (userId) await service().auth.admin.deleteUser(userId);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.setExtraHTTPHeaders(forwardedFor());
    await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
    await addSessionCookies(context, await sessionCookiesFor(email, password), baseURL!);
  });

  for (const scheme of SCHEMES) {
    test.describe(`tema ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      for (const path of READER_ROUTES) {
        test(`@a11y ${path}`, async ({ page }) => {
          await page.goto(path);
          await expectRendered(page);
          await expectNoSeriousViolations(page);
        });
      }
      test("@a11y /entrar/migrar com dados locais para levar", async ({ page }) => {
        // Página estática (sem React): nada do app grava o perfil ao mesmo tempo.
        await page.goto("/offline.html");
        await page.evaluate(async () => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open("citynews");
            req.onupgradeneeded = () => req.result.createObjectStore("anon");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const now = new Date().toISOString();
          const profile = {
            anonId: "8c1f7a52-6f7e-4d3b-9a51-1d1b9d9c2a10",
            createdAt: now,
            follows: [{ kind: "source", id: "mt-agora", at: now }],
            saved: [],
            history: [],
            searches: ["ônibus"],
            interests: [],
            hidden: [],
            collections: [],
            alerts: [],
          };
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("anon", "readwrite");
            tx.objectStore("anon").put(profile, "profile");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        });
        await page.goto("/entrar/migrar");
        await expectRendered(page);
        await expectNoSeriousViolations(page);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Estúdio, Control Center e Administração, com cada papel

test.describe("Estúdio, Control Center e Administração", () => {
  let fx: ControlFixture;
  const ids: Ids = { runId: "", experimentId: "", correctionId: "", pushSendId: "" };
  let pushSendCreated = false;

  test.beforeAll(async () => {
    fx = await controlFixture();
    ids.runId = fx.runId;
    ids.experimentId = fx.experimentId;
    const db = service();
    const { data: c } = await db.from("corrections").select("id").limit(1).single();
    ids.correctionId = c!.id;
    const { data: article } = await db
      .from("articles")
      .select("id")
      .eq("status", "published")
      .limit(1)
      .single();
    const { data: send, error } = await db
      .from("push_sends")
      .insert({
        kind: "highlight",
        article_id: article!.id,
        title: "Envio de teste de acessibilidade",
        body: "Texto do aviso de teste.",
        origin_label: "ORIGINAL CITYNEWS",
        url: "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro",
        tag: "a11y",
        status: "sent",
        requested_by: STAFF.marina.id,
        approved_by: STAFF.helena.id,
        approved_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.pushSendId = send!.id;
    pushSendCreated = true;
  });
  test.afterAll(async () => {
    await fx?.cleanup();
    if (pushSendCreated) await service().from("push_sends").delete().eq("id", ids.pushSendId);
  });

  for (const scheme of SCHEMES) {
    test.describe(`tema ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      for (const route of STUDIO_ROUTES) {
        const roles = rolesFor(route);
        // Escuro: só o primeiro papel da rota.
        for (const [i, role] of (scheme === "dark" ? roles.slice(0, 1) : roles).entries()) {
          test(`@a11y ${route.name} · ${role}`, async ({ page, context }, testInfo) => {
            // WebKit (CI) confere o motor de renderização, não a matriz de papéis: só o primeiro.
            test.skip(
              testInfo.project.name === "mobile-webkit" && i > 0,
              "matriz de papéis só no Chromium",
            );
            await context.setExtraHTTPHeaders(forwardedFor());
            await loginAs(context, STAFF_BY_ROLE[role]);
            const path = route.path(ids);
            await page.goto(path);
            await expectRendered(page, path);
            await expectNoSeriousViolations(page);
          });
        }
      }
    });
  }
});
