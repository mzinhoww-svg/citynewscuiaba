import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { formatDayMonth } from "@/lib/format/date";
import { accountFormReady } from "./account-form";
import { forwardedFor } from "./own-ip";

/*
 * Modo estrito de privacidade (P6 tarefa 5, Review Focus 5; tracking-plan §2, spec §5.2):
 * - quem recusou tudo navega 20 páginas com 0 requisições a /api/events (nem tentativa, nem
 *   beacon) e sem nenhum cookie além de `cn_consent` (e, se logado, a sessão do Supabase);
 * - exportar os dados gera JSON com follows, saved, alerts e profile;
 * - excluir agenda a exclusão em 7 dias e a purga respeita o prazo.
 */
loadEnvConfig(process.cwd());

const ARTICLE = "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro";
const PAGES = [
  "/",
  "/cidade",
  "/politica",
  "/economia",
  "/cultura",
  "/esportes",
  "/servicos",
  "/saude",
  "/agenda",
  "/mobilidade",
  "/fontes",
  "/fontes/mt-agora",
  "/busca?q=viaduto",
  "/panorama",
  "/explorar",
  "/pergunte",
  "/sobre",
  "/privacidade",
  ARTICLE,
  "/materia/defesa-civil-mantem-alerta-de-baixa-umidade",
  "/favoritos",
];
const SESSION_COOKIE = /^sb-[a-z0-9-]+-auth-token/i;
const EVENTS = "/api/events";

/** Tentativas de enviar evento vistas no navegador (fetch, beacon, XHR), mesmo as que falham. */
async function watchEvents(context: BrowserContext) {
  const attempts: string[] = [];
  const requests: string[] = [];
  await context.exposeFunction("__cnAttempt", (how: string, url: string) => {
    attempts.push(`${how} ${url}`);
  });
  await context.addInitScript(() => {
    const w = window as unknown as { __cnAttempt: (how: string, url: string) => void };
    const note = (how: string, url: unknown) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : String(url);
      if (u.includes("/api/events")) void w.__cnAttempt(how, u);
    };
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon)
      navigator.sendBeacon = (url, data) => {
        note("beacon", url);
        return beacon(url, data);
      };
    const f = window.fetch.bind(window);
    window.fetch = (input, init) => {
      note("fetch", input instanceof Request ? input.url : input);
      return f(input, init);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
    ) {
      note("xhr", url);
      // eslint-disable-next-line prefer-rest-params
      return open.apply(this, arguments as never);
    } as typeof open;
  });
  context.on("request", (r) => {
    if (r.url().includes(EVENTS)) requests.push(`${r.method()} ${r.url()}`);
  });
  return { attempts, requests };
}

async function refuseAll(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Só o necessário" }).click();
  await expect(page.getByRole("region", { name: "Sua privacidade" })).toHaveCount(0);
  await expect
    .poll(async () => (await page.context().cookies()).find((c) => c.name === "cn_consent")?.value)
    .toBe("v1|m0|p0");
}

async function visitAll(page: Page): Promise<number> {
  let visited = 0;
  for (const path of PAGES) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), path).toBeLessThan(400);
    // Espera a página hidratar e o medidor de leitura (matéria) montar antes de sair.
    await page.waitForLoadState("load");
    if (path.startsWith("/materia/"))
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    visited++;
  }
  await page.waitForLoadState("networkidle");
  return visited;
}

const cookieNames = async (page: Page) => (await page.context().cookies()).map((c) => c.name);

test.describe("recusou tudo", () => {
  test("20 páginas anônimas: 0 requisições a /api/events e só o cookie cn_consent", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.setExtraHTTPHeaders(forwardedFor());
    const seen = await watchEvents(context);
    await refuseAll(page);
    const visited = await visitAll(page);
    expect(visited).toBeGreaterThanOrEqual(20);
    expect(seen.requests).toEqual([]);
    expect(seen.attempts).toEqual([]);
    expect(await cookieNames(page)).toEqual(["cn_consent"]);
    // Sem Personalização o perfil local não tem identificador, histórico, buscas nem interesses.
    const profile = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === "citynews")) return null;
      return new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("citynews");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("anon")) return resolve(null);
          const get = db.transaction("anon").objectStore("anon").get("profile");
          get.onsuccess = () => resolve((get.result as Record<string, unknown>) ?? null);
          get.onerror = () => resolve(null);
        };
      });
    });
    expect(profile?.anonId ?? null).toBeNull();
    for (const key of ["history", "searches", "interests"])
      expect((profile?.[key] as unknown[] | undefined) ?? [], key).toEqual([]);
  });

  test("controle: quem aceita as métricas é medido (os observadores enxergam os envios)", async ({
    page,
    context,
  }) => {
    await page.setExtraHTTPHeaders(forwardedFor());
    const seen = await watchEvents(context);
    await page.goto("/");
    await page.getByRole("button", { name: "Aceitar métricas e recomendações" }).click();
    await page.goto("/cidade", { waitUntil: "load" });
    await expect.poll(() => seen.requests.length).toBeGreaterThan(0);
    expect(seen.attempts.length).toBeGreaterThan(0);
  });

  test("sem responder ao banner, nada é enviado também", async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.setExtraHTTPHeaders(forwardedFor());
    const seen = await watchEvents(context);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Sua privacidade" })).toBeVisible();
    for (const path of PAGES.slice(0, 8)) await page.goto(path, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    expect(seen.requests).toEqual([]);
    expect(seen.attempts).toEqual([]);
    expect((await cookieNames(page)).every((n) => n === "cn_consent")).toBe(true);
  });
});

const PASSWORD = "senha-forte-123";
const uniqueEmail = (tag: string) =>
  `estrito-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;

async function signUp(page: Page, email: string, next = "%2Fperfil") {
  await page.goto(`/criar-conta?next=${next}`);
  await accountFormReady(page);
  await page.getByLabel("Nome de exibição").fill("Ana Estrita");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/Li e aceito os Termos/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function dismissInvite(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Quer manter suas fontes e notícias salvas em qualquer dispositivo?",
  });
  try {
    await dialog.waitFor({ state: "visible", timeout: 2500 });
    await dialog.getByRole("button", { name: "Agora não" }).click();
    await expect(dialog).toBeHidden();
  } catch {
    /* o convite aparece uma vez por gatilho */
  }
}

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

test.describe("com conta", () => {
  test("logado e sem consentimento: 20 páginas, 0 eventos, só cn_consent e a sessão", async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await page.setExtraHTTPHeaders(forwardedFor());
    const seen = await watchEvents(context);
    await refuseAll(page);
    await signUp(page, uniqueEmail("sessao"));
    await expect(page).toHaveURL(/\/perfil$/);
    await visitAll(page);
    expect(seen.requests).toEqual([]);
    expect(seen.attempts).toEqual([]);
    const names = await cookieNames(page);
    expect(names).toContain("cn_consent");
    const extra = names.filter((n) => n !== "cn_consent" && !SESSION_COOKIE.test(n));
    expect(extra).toEqual([]);
    expect(names.some((n) => SESSION_COOKIE.test(n))).toBe(true);
  });

  test("exportar gera JSON com follows, saved, alerts e profile; excluir agenda em 7 dias", async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    test.skip(browserName === "webkit", "WebKit do Playwright não concede notificações (alerta)");
    test.setTimeout(150_000);
    await page.setExtraHTTPHeaders(forwardedFor());
    await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
    await context.grantPermissions(["notifications"], { origin: baseURL! });

    // Anônimo: segue uma fonte, salva uma matéria e cria um alerta de navegador.
    await page.goto("/fontes/mt-agora");
    await ready(page);
    await page.getByRole("button", { name: "Seguir MT Agora" }).click();
    await expect(page.getByRole("button", { name: "Seguir MT Agora" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dismissInvite(page);
    await page.goto(ARTICLE);
    await ready(page);
    const save = page.getByRole("button", { name: "Salvar", exact: true });
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await dismissInvite(page);
    await page.goto("/alertas");
    await ready(page);
    await page.getByLabel("Alvo").selectOption("cpa");
    await page.getByRole("button", { name: "Criar alerta" }).click();
    await expect(page.getByText(/Alerta criado/)).toBeVisible();
    await dismissInvite(page);

    // Cria a conta e leva tudo (fontes, alertas e salvos) para ela.
    const email = uniqueEmail("dados");
    await signUp(page, email);
    await expect(page).toHaveURL(/\/entrar\/migrar/);
    await page.getByRole("button", { name: "Levar selecionados" }).click();
    await expect(page.getByText(/sincronizad/)).toBeVisible();
    await page.goto("/perfil");
    await expect(page.getByText(email)).toBeVisible();

    // Exportar dados.
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Baixar meus dados/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("citynews-minha-conta.json");
    const raw = await readFile((await file.path())!, "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["profile", "follows", "saved", "alerts"])
      expect(Object.keys(json), key).toContain(key);
    expect((json.follows as { target_id: string }[]).map((f) => f.target_id)).toContain("mt-agora");
    expect(
      (json.saved as { content_ref: string }[]).some((s) => s.content_ref.includes("article:")),
    ).toBe(true);
    expect((json.alerts as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect((json.profile as { display_name: string }).display_name).toBe("Ana Estrita");
    // Nada de credencial na exportação.
    expect(raw).not.toMatch(
      /encrypted_password|password_hash|manage_token|refresh_token|access_token/i,
    );

    // Excluir: agenda em 7 dias, sem apagar já.
    const before = Date.now();
    await page.getByRole("link", { name: "Excluir conta" }).click();
    await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
    await page.getByRole("button", { name: "Excluir conta em 7 dias" }).click();
    await expect(page.getByText(/Exclusão agendada para/)).toBeVisible();
    await expect(page.getByText(/Até lá, a conta continua funcionando/)).toBeVisible();

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const id = users.data.users.find((u) => u.email === email)?.id ?? "";
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const profile = await db.from("profiles").select("delete_requested_at").eq("id", id).single();
    const requestedAt = Date.parse(profile.data!.delete_requested_at!);
    expect(requestedAt).toBeGreaterThan(before - 60_000);
    expect(requestedAt).toBeLessThan(Date.now() + 1000);
    // A data mostrada é a do pedido + 7 dias (fuso de Cuiabá).
    const due = formatDayMonth(new Date(requestedAt + 7 * 86_400_000).toISOString());
    await expect(page.getByText(`Exclusão agendada para ${due}.`)).toBeVisible();

    // A purga só apaga depois de 7 dias.
    await db.rpc("purge_deleted_accounts", { p_days: 7 });
    expect((await db.from("profiles").select("id").eq("id", id)).data).toHaveLength(1);
    await db
      .from("profiles")
      .update({ delete_requested_at: new Date(Date.now() - 8 * 86_400_000).toISOString() })
      .eq("id", id);
    await db.rpc("purge_deleted_accounts", { p_days: 7 });
    expect((await db.from("profiles").select("id").eq("id", id)).data).toHaveLength(0);
    expect((await db.from("follows").select("owner_ref").eq("owner_ref", id)).data).toHaveLength(0);
    expect(
      (await db.from("saved_items").select("owner_ref").eq("owner_ref", id)).data,
    ).toHaveLength(0);
    expect((await db.from("alerts").select("owner_ref").eq("owner_ref", id)).data).toHaveLength(0);
  });
});
