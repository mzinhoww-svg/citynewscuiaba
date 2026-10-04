import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { accountFormReady } from "./account-form";
import { skipInvite } from "./invite";
import { lastLinkFor } from "./mailbox";
import { forwardedFor } from "./own-ip";

/*
 * Conta opcional (C02 a C06, P2-T11): entrar com erro claro e saída sem login, bloqueio depois
 * de 5 falhas, criar conta, link mágico, recuperação neutra e migração do perfil local sem
 * duplicar (Review Focus 4). Cada teste tem IP próprio (limites por conexão).
 */
const PASSWORD = "senha-forte-123";
const ARTICLES = [
  "/materia/qualidade-do-ar-em-cuiaba-fica-ruim-pelo-terceiro-dia",
  "/materia/defesa-civil-mantem-alerta-de-baixa-umidade",
  "/materia/mutirao-de-emprego-oferece-800-vagas-no-centro",
];

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "cn_consent", value: "v1|m0|p0", url: baseURL! }]);
  await page.setExtraHTTPHeaders(forwardedFor());
});

const uniqueEmail = (tag: string) =>
  `leitor-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;

async function ready(page: Page) {
  await expect(page.locator('[data-ready="true"]').first()).toBeAttached();
}

async function follow(page: Page, slug: string, name: string, invite: boolean) {
  await page.goto(`/fontes/${slug}`);
  await ready(page);
  await page.getByRole("button", { name: `Seguir ${name}` }).click();
  await expect(page.getByRole("button", { name: `Seguir ${name}` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (invite) await skipInvite(page);
}

async function save(page: Page, path: string, invite: boolean) {
  await page.goto(path);
  await ready(page);
  const b = page.getByRole("button", { name: "Salvar", exact: true });
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", "true");
  if (invite) await skipInvite(page);
}

async function signUp(page: Page, email: string, name = "Leitora de Teste") {
  await accountFormReady(page);
  await page.getByLabel("Nome de exibição").fill(name);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByLabel(/Li e aceito os Termos/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await accountFormReady(page);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("erro de login é claro e há saída sem login", async ({ page }) => {
  await page.goto("/entrar");
  await accountFormReady(page);
  await page.getByLabel("E-mail", { exact: true }).fill("paulo.rezende@email.com");
  await page.getByLabel("Senha", { exact: true }).fill("errada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  await expect(
    page.getByText("Restam 4 tentativas antes do bloqueio de 15 minutos."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar sem entrar" })).toBeVisible();
  // O e-mail digitado continua no campo.
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue("paulo.rezende@email.com");
});

test("5 falhas bloqueiam o acesso com senha por 15 minutos", async ({ page }) => {
  const email = uniqueEmail("bloqueio");
  await page.goto("/entrar");
  for (let i = 4; i >= 1; i--) {
    await signIn(page, email, "errada");
    await expect(
      page.getByText(
        i === 1
          ? "Resta 1 tentativa antes do bloqueio de 15 minutos."
          : `Restam ${i} tentativas antes do bloqueio de 15 minutos.`,
      ),
    ).toBeVisible();
  }
  await signIn(page, email, "errada");
  await expect(page.getByText(/Muitas tentativas\. Por segurança/)).toBeVisible();
  // Mesmo com a senha certa de outra conta, continua bloqueado para este e-mail.
  await signIn(page, email, PASSWORD);
  await expect(page.getByText(/Muitas tentativas\. Por segurança/)).toBeVisible();
});

test("criar conta valida os campos e mostra a força da senha em texto", async ({ page }) => {
  await page.goto("/criar-conta");
  await accountFormReady(page);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Digite um nome de exibição (até 80 caracteres).")).toBeVisible();
  await expect(page.getByText("Confira o e-mail. Exemplo: ana@exemplo.com")).toBeVisible();
  await expect(page.getByText("A senha precisa ter pelo menos 8 caracteres.")).toBeVisible();
  await expect(page.getByText("Para criar a conta, aceite os termos.")).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("abc");
  await expect(page.getByText("Muito curta: use pelo menos 8 caracteres")).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("Abcdefg1!xyz");
  await expect(page.getByText("Força da senha: forte")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar sem entrar" })).toBeVisible();
});

test("anônimo cria conta e migra", async ({ page }) => {
  await follow(page, "mt-agora", "MT Agora", true);
  await follow(page, "placar-mt", "Placar MT", false);
  await save(page, ARTICLES[0]!, true);
  await save(page, ARTICLES[1]!, false);
  await save(page, ARTICLES[2]!, false);

  // Convite depois de salvar leva ao cadastro (novo gatilho vencido para este teste).
  await page.evaluate(() => localStorage.removeItem("cn_invites"));
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/criar-conta\?next=%2Fmateria%2F/);

  await signUp(page, uniqueEmail("migra"));
  await expect(page).toHaveURL(/\/entrar\/migrar/);
  await expect(
    page.getByRole("heading", { name: "Levar o que está neste navegador para a sua conta?" }),
  ).toBeVisible();
  await expect(page.getByLabel(/Fontes, temas e alertas/)).toBeChecked();
  await expect(page.getByLabel(/Matérias salvas e coleções/)).toBeChecked();
  await expect(page.getByLabel(/Histórico de leitura/)).not.toBeChecked();
  await expect(page.getByLabel(/Conversas do Perguntar ao CityNews/)).toBeDisabled();
  await expect(page.getByText("3 itens")).toBeVisible();

  await page.getByRole("button", { name: "Levar selecionados" }).click();
  await expect(page.getByText("2 fontes e 3 salvos sincronizados")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/materia\//);
  // Com conta, salvar não convida mais.
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Salvo neste aparelho.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("conta já tem 1 das 2 fontes: não duplica e informa 2 fontes (Review Focus 4)", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("conflito");
  await follow(page, "mt-agora", "MT Agora", true);
  await page.goto("/criar-conta");
  await signUp(page, email);
  await page.getByRole("button", { name: "Levar selecionados" }).click();
  await expect(page.getByText("1 fonte sincronizada")).toBeVisible();

  // Sai (limpa a sessão), segue outra fonte neste navegador e entra de novo.
  await context.clearCookies({ name: /^sb-/ });
  await follow(page, "placar-mt", "Placar MT", false);
  await page.goto("/entrar");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/entrar\/migrar/);
  await page.getByRole("button", { name: "Levar selecionados" }).click();
  await expect(page.getByText("2 fontes sincronizadas")).toBeVisible();
});

test("sem nada neste navegador, entrar segue direto para o destino", async ({ page }) => {
  const email = uniqueEmail("direto");
  await page.goto("/criar-conta?next=%2Fagenda");
  await signUp(page, email);
  await expect(page).toHaveURL(/\/agenda$/);
});

test("equipe entra pelo mesmo formulário e volta para o Estúdio", async ({ page }) => {
  await page.goto("/estudio");
  await expect(page).toHaveURL(/\/entrar\?next=%2Festudio/);
  await signIn(page, "helena.costa@citynews.local", "citynews-local-123");
  await expect(page).toHaveURL(/\/estudio$/);
});

test("link mágico: mensagem neutra e o link abre a sessão", async ({ page, context }) => {
  const email = uniqueEmail("magico");
  await page.goto("/criar-conta?next=%2Fexplorar");
  await signUp(page, email);
  await expect(page).toHaveURL(/\/explorar$/);
  await context.clearCookies({ name: /^sb-/ });

  await page.goto("/entrar?next=%2Fagenda");
  await accountFormReady(page);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Entrar sem senha" }).click();
  await expect(page.getByText(`Se houver conta com ${email}, enviamos um link`)).toBeVisible();

  const link = await lastLinkFor(email);
  test.skip(!link, "sem caixa de saída do Auth neste ambiente");
  await page.goto(link!);
  await expect(page).toHaveURL(/\/agenda$/);
  // Sessão aberta: /entrar manda para o destino.
  await page.goto("/entrar?next=%2Fexplorar");
  await expect(page).toHaveURL(/\/explorar$/);
});

test("recuperar senha responde de forma neutra e o link permite nova senha", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("recupera");
  await page.goto("/criar-conta?next=%2Fexplorar");
  await signUp(page, email);
  await expect(page).toHaveURL(/\/explorar$/);
  await context.clearCookies({ name: /^sb-/ });

  // E-mail sem conta recebe a mesma resposta que um com conta.
  await page.goto("/recuperar-senha");
  await accountFormReady(page);
  await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("ninguem"));
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Se houver conta com este e-mail, enviamos um link")).toBeVisible();

  await page.goto("/entrar");
  await accountFormReady(page);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("link", { name: "Esqueci a senha" }).click();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Se houver conta com este e-mail, enviamos um link")).toBeVisible();

  const link = await lastLinkFor(email);
  test.skip(!link, "sem caixa de saída do Auth neste ambiente");
  await page.goto(link!);
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  await accountFormReady(page);
  await page.getByLabel("Nova senha", { exact: true }).fill("outra-senha-456");
  await page.getByLabel("Confirme a nova senha").fill("diferente-789");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("As senhas não são iguais.")).toBeVisible();
  await page.getByLabel("Nova senha", { exact: true }).fill("outra-senha-456");
  await page.getByLabel("Confirme a nova senha").fill("outra-senha-456");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/perfil\?senha=alterada$/);
});

test("confirmar e-mail: link vencido explica e oferece reenviar", async ({ page }) => {
  await page.goto("/confirmar?token=lixo&type=signup");
  await page.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await expect(page.getByText("Este link expirou ou já foi usado")).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("reenvio"));
  await page.getByRole("button", { name: "Reenviar link" }).click();
  await expect(
    page.getByText("Se houver cadastro pendente com este e-mail, enviamos um novo link."),
  ).toBeVisible();

  await page.goto("/redefinir-senha");
  await expect(page.getByText("Este link expirou ou já foi usado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pedir novo link" })).toBeVisible();
});

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
for (const path of ["/recuperar-senha", "/confirmar?estado=expirado"]) {
  test(`${path} sem violações graves de acessibilidade @a11y`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad, JSON.stringify(bad.map((v) => [v.id, v.nodes.map((n) => n.target)]))).toEqual([]);
  });
}
