import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
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
  await expect(page.getByText(ANON_ID)).toBeVisible();
  await expect(page.getByText(/1 fonte ou tema seguido/)).toBeVisible();
  await expect(page.getByText(/Se você limpar os dados do navegador/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar conta para sincronizar" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Atalhos" });
  for (const l of ["Favoritos", "Alertas", "Privacidade e recomendações"])
    await expect(nav.getByRole("link", { name: l })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar dados deste navegador" }).click();
  expect((await download).suggestedFilename()).toBe("citynews-este-navegador.json");
});

async function newAccount(page: Page, tag: string): Promise<string> {
  const email = `perfil-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/criar-conta?next=%2Fperfil");
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
  await page.getByRole("button", { name: "Excluir conta" }).click();
  const dialog = page.getByRole("dialog", { name: "Excluir sua conta?" });
  const confirm = dialog.getByRole("button", { name: "Excluir conta" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("excluir");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/Exclusão agendada para/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar exclusão" }).click();
  await expect(page.getByText("Exclusão cancelada. Sua conta continua ativa.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir conta" })).toBeVisible();
});

test("conta: dados, bairro, exportar e sair", async ({ page }) => {
  const email = await newAccount(page, "dados");
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel("Nome de exibição").fill("Ana do Porto");
  await page.getByLabel("Bairro principal").selectOption("Porto");
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(page.getByText("Dados salvos.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue("Ana do Porto");
  await expect(page.getByLabel("Bairro principal")).toHaveValue("Porto");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar dados" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("citynews-minha-conta.json");
  const json = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(json.account.email).toBe(email);
  expect(json.profile.display_name).toBe("Ana do Porto");

  await page.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
  await expect(page.getByText(/Você saiu da conta/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar conta para sincronizar" })).toBeVisible();
});
