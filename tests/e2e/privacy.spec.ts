import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { accountFormReady } from "./account-form";
import { forwardedFor } from "./own-ip";

/*
 * Perfil (P20) e Como usamos suas recomendações (P21), P2-T12: controles locais sem conta,
 * perfil do navegador e, com conta, dados, exportar e excluir (digitando EXCLUIR).
 */
const ANON_ID = "8c1f7a52-6f7e-4d3b-9a51-1d1b9d9c2a10";

/** Grava um perfil local com personalização e interesses (IndexedDB `citynews`/`anon`). */
async function seedAnonWithInterests(page: Page, keys: string[]) {
  // Página estática (sem React): nada do app grava o perfil ao mesmo tempo.
  await page.goto("/offline.html");
  await page.evaluate(
    async ({ keys, anonId }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("citynews");
        req.onupgradeneeded = () => req.result.createObjectStore("anon");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const now = new Date().toISOString();
      const profile = {
        anonId,
        createdAt: now,
        follows: [{ kind: "source", id: "mt-agora", at: now }],
        saved: [],
        history: [{ ref: "article:1", section: "cidade", at: now, seconds: 70, scrollPct: 90 }],
        searches: ["ônibus"],
        interests: keys.map((key, i) => ({
          key,
          evidence: `${3 - i} leituras em ${key} nos últimos 30 dias`,
          weak: i > 0,
        })),
        hidden: [{ sourceSlug: "brasil-hoje", reason: "not_interested", at: now }],
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
    },
    { keys, anonId: ANON_ID },
  );
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m1|p1", url: baseURL! }]);
});

test("remover interesse, redefinir e desativar", async ({ page }) => {
  await seedAnonWithInterests(page, ["Política local", "Mobilidade"]);
  await page.goto("/privacidade/recomendacoes");
  await expect(page.getByText("Política local", { exact: true })).toBeVisible();
  await expect(page.getByText(/sinal fraco: ainda não usado/)).toBeVisible();
  await page.getByRole("button", { name: "Remover Política local" }).click();
  await expect(page.getByText("Política local")).toHaveCount(0);
  await expect(page.getByText("Mobilidade", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redefinir recomendações" }).click();
  await expect(page.getByRole("status")).toContainText("Recomendações redefinidas");
  await expect(page.getByText("Nenhum interesse considerado ainda.")).toBeVisible();
  await page.getByRole("button", { name: "Desativar recomendações personalizadas" }).click();
  await expect(
    page.getByRole("switch", { name: "Recomendações pelo que você lê" }),
  ).toHaveAttribute("aria-checked", "false");
  // A escolha vale para o site todo (cookie cn_consent).
  const cookie = (await page.context().cookies()).find((c) => c.name === "cn_consent");
  expect(cookie?.value).toBe("v1|m1|p0");
});

test("perfil sem conta mostra o navegador, atalhos e o convite opcional", async ({ page }) => {
  await seedAnonWithInterests(page, ["Mobilidade"]);
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Seu perfil neste navegador" })).toBeVisible();
  // As contagens deste navegador ficam nas linhas de Favoritos e Alertas.
  const activity = page.getByRole("navigation", { name: "Seu CityNews" });
  await expect(activity.getByRole("link", { name: /Favoritos/ })).toContainText("1 seguido");
  await expect(activity.getByRole("link", { name: /Alertas/ })).toBeVisible();
  await expect(page.getByText(/Se você limpar os dados do navegador/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar conta para sincronizar" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Preferências" })
      .getByRole("link", { name: "Privacidade e recomendações" }),
  ).toBeVisible();
  // O identificador local é detalhe técnico: fica recolhido até a pessoa pedir.
  await expect(page.getByText(ANON_ID)).toBeHidden();
  await page.getByText("Detalhes técnicos").click();
  await expect(page.getByText(ANON_ID)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar dados deste navegador" }).click();
  expect((await download).suggestedFilename()).toBe("citynews-este-navegador.json");
});

async function newAccount(page: Page, tag: string): Promise<string> {
  const email = `perfil-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/criar-conta?next=%2Fperfil");
  await accountFormReady(page);
  await page.getByLabel("Nome de exibição").fill("Ana Cuiabana");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-forte-123");
  await page.getByLabel(/Li e aceito os Termos/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  return email;
}

test("excluir conta exige digitar EXCLUIR", async ({ page }) => {
  await newAccount(page, "excluir");
  // A exclusão tem tela própria, longe das ações do dia a dia.
  await page.getByRole("link", { name: "Excluir conta" }).click();
  await expect(page).toHaveURL(/\/perfil\/excluir$/);
  await expect(page.getByRole("heading", { name: "O que acontece" })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Excluir conta em 7 dias" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("excluir");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/Exclusão agendada para/)).toBeVisible();
  // Com a exclusão agendada, a linha mostra a data e não abre o fluxo de novo.
  await expect(page.getByRole("link", { name: "Excluir conta" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar exclusão" }).click();
  await expect(page.getByText("Exclusão cancelada. Sua conta continua ativa.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Excluir conta" })).toBeVisible();
});

test("conta: dados, bairro, exportar e sair", async ({ page }) => {
  const email = await newAccount(page, "dados");
  await expect(page.getByText(email)).toBeVisible();
  // Nome e bairro se editam numa folha; "Salvar" só ativa quando algo muda.
  await page.getByRole("button", { name: "Editar perfil" }).click();
  const sheet = page.getByRole("dialog", { name: "Editar perfil" });
  await accountFormReady(page);
  await expect(sheet.getByRole("button", { name: "Salvar" })).toBeDisabled();
  await sheet.getByLabel("Nome de exibição").fill("Ana do Porto");
  await sheet.getByLabel("Bairro principal").selectOption("Porto");
  await sheet.getByRole("button", { name: "Salvar" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Dados salvos.")).toBeVisible();
  await page.reload();
  const account = page.getByRole("region", { name: "Sua conta" });
  await expect(account.getByText("Ana do Porto")).toBeVisible();
  await expect(account.getByText("Porto", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar perfil" }).click();
  await expect(sheet.getByLabel("Nome de exibição")).toHaveValue("Ana do Porto");
  await expect(sheet.getByLabel("Bairro principal")).toHaveValue("Porto");
  await sheet.getByRole("button", { name: "Cancelar" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Baixar meus dados/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("citynews-minha-conta.json");
  const json = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(json.account.email).toBe(email);
  expect(json.profile.display_name).toBe("Ana do Porto");

  // Sair dos outros aparelhos mantém este navegador conectado.
  await page.getByRole("link", { name: /Sessões/ }).click();
  await expect(page).toHaveURL(/\/perfil\/seguranca#sessoes$/);
  await page.getByRole("button", { name: "Sair dos outros aparelhos" }).click();
  await expect(page.getByText(/Você saiu dos outros aparelhos/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Senha e sessões" })).toBeVisible();

  // Volta pelo link da tela, como a pessoa faria. Recarregar a página depois do download feito
  // no navegador derrubava a aba no WebKit do Playwright ("Page crashed").
  await page.locator("main").getByRole("link", { name: "Perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page.getByText(/Você saiu da conta/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar conta para sincronizar" })).toBeVisible();
});
