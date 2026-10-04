import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, type StaffKey } from "../e2e/helpers/studio-login";

/*
 * Roteiro exploratório do painel de fontes (FS-T9, docs/testing.md §3 e A-026: Playwright no
 * lugar do agent-browser). Cada passo verifica o esperado e captura a tela em 390 e 1280 px em
 * docs/reports/painel-fontes/*.png, para a revisão visual independente contra DESIGN.md. Roda no
 * projeto `fixtures` (análise por link sem rede) e só com CN_ROTEIRO=1:
 *   CN_ROTEIRO=1 pnpm exec playwright test tests/roteiro/fontes.spec.ts --project=fixtures --no-deps
 * Efeitos no banco: um pedido de aprovação pendente no Placar MT (Diego); nada mais é salvo.
 */
test.skip(!process.env.CN_ROTEIRO, "roteiro exploratório: rode com CN_ROTEIRO=1");
test.describe.configure({ mode: "serial" });

const DIR = "docs/reports/painel-fontes";
const BASE = "/estudio/control/fontes";
const SEED = {
  folha: "c5000000-0000-4000-8000-000000000001",
  radioPantanal: "c5000000-0000-4000-8000-000000000005",
  placar: "c5000000-0000-4000-8000-000000000009",
} as const;
const WIDTHS = [390, 1280] as const;

async function shot(page: Page, name: string, fullPage = true) {
  await mkdir(DIR, { recursive: true });
  const w = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `${DIR}/${name}-${w}.png`, fullPage });
}

/** Repete `visit` nas duas larguras; `after` roda em cada uma antes da captura. */
async function both(
  page: Page,
  name: string,
  visit: (page: Page) => Promise<void>,
  opts: { fullPage?: boolean } = {},
) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 800 });
    await visit(page);
    await shot(page, name, opts.fullPage ?? true);
  }
}

async function enter(page: Page, who: StaffKey, baseURL: string | undefined) {
  await page.context().clearCookies();
  await loginAs(page.context(), who, baseURL);
}

test("01–03 · lista com dados, filtro vazio e arquivadas", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await both(page, "01-lista", async (p) => {
    await p.goto(BASE);
    await expect(p.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  });
  await both(page, "02-lista-filtro-vazio", async (p) => {
    await p.goto(`${BASE}?q=fonte-que-nao-existe`);
    await expect(p.getByText("Nenhuma fonte com esses filtros.")).toBeVisible();
  });
  await both(page, "03-lista-arquivadas", async (p) => {
    await p.goto(`${BASE}?status=archived`);
    await expect(p.getByRole("heading", { level: 1, name: "Fontes" })).toBeVisible();
  });
});

test("04 · seleção em lote e configurações da coleta", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await both(
    page,
    "04-lista-lote",
    async (p) => {
      await p.goto(`${BASE}?status=active`);
      // Marcar antes da hidratação perde o clique: repete até a barra de lote aparecer.
      await expect(async () => {
        await p
          .getByRole("checkbox", { name: /^Selecionar (?!todas)/ })
          .first()
          .check();
        await expect(p.getByText(/1 fonte selecionada/)).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
    },
    { fullPage: false },
  );
  await both(
    page,
    "05-configuracoes-coleta",
    async (p) => {
      await p.goto(BASE);
      await p.getByRole("button", { name: "Configurações da coleta" }).click();
      await expect(p.getByRole("dialog")).toBeVisible();
    },
    { fullPage: false },
  );
});

test("06 · erro: fonte inexistente (404 amigável)", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await both(page, "06-erro-404", async (p) => {
    await p.goto(`${BASE}/00000000-0000-4000-8000-000000000000`);
    await expect(p.getByRole("heading", { level: 1, name: "Fonte não encontrada" })).toBeVisible();
  });
});

test("07–09 · nova fonte: endereço, análise com prévia e sugestões, robots proíbe", async ({
  page,
  baseURL,
}) => {
  await enter(page, "helena", baseURL);
  await both(page, "07-nova-endereco", async (p) => {
    await p.goto(`${BASE}/nova`);
    await expect(p.getByRole("heading", { level: 1, name: "Nova fonte" })).toBeVisible();
  });
  await both(page, "08-nova-analise", async (p) => {
    await p.goto(`${BASE}/nova`);
    // Feed direto (critério 4): reconhecido sem buscar a home; Cadência MT não está no seed.
    await p.getByLabel("Endereço da fonte").fill("https://cadencia.example/feed");
    await p.getByRole("button", { name: "Analisar" }).click();
    const status = p.getByRole("status");
    await expect(status).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });
    await expect(p.getByRole("list", { name: "Prévia dos últimos itens" })).toBeVisible();
  });
  await both(page, "09-nova-robots-proibe", async (p) => {
    await p.goto(`${BASE}/nova`);
    await p.getByLabel("Endereço da fonte").fill("https://proibido.example/");
    await p.getByRole("button", { name: "Analisar" }).click();
    await expect(p.getByRole("alert").filter({ hasText: "robots.txt" })).toBeVisible();
  });
});

test("10–15 · detalhe: cada aba", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  const tabs: [string, string, string][] = [
    ["10-detalhe-resumo", "", "Componentes da saúde"],
    ["11-detalhe-configuracao", "/configuracao", "Identificação"],
    ["12-detalhe-coleta", "/coleta", "Como coletamos"],
    ["13-detalhe-recomendacao", "/recomendacao", "Recomendação"],
    ["14-detalhe-historico", "/historico", "Histórico"],
    ["15-detalhe-itens", "/itens", "Últimos itens coletados"],
  ];
  for (const [name, path, heading] of tabs) {
    await both(page, name, async (p) => {
      await p.goto(`${BASE}/${SEED.folha}${path}`);
      await expect(p.getByRole("heading", { level: 1, name: "Folha do Cerrado" })).toBeVisible();
      // A aba carrega em streaming (loading.tsx): espera o conteúdo, não o esqueleto.
      await expect(p.getByRole("heading", { name: heading }).first()).toBeVisible();
    });
  }
});

test("16–17 · diálogos de excluir e bloquear", async ({ page, baseURL }) => {
  await enter(page, "helena", baseURL);
  await both(
    page,
    "16-dialogo-excluir",
    async (p) => {
      await p.goto(`${BASE}/${SEED.radioPantanal}`);
      await p.getByRole("button", { name: "Excluir fonte" }).click();
      await expect(p.getByRole("dialog")).toBeVisible();
      await p.getByRole("dialog").getByLabel("Motivo").fill("Sem atualização há meses");
      await p
        .getByRole("dialog")
        .getByLabel(/para confirmar/)
        .fill("Radio Pantanal");
      await expect(p.getByText("O nome digitado não confere.")).toBeVisible();
    },
    { fullPage: false },
  );
  await both(
    page,
    "17-dialogo-bloquear",
    async (p) => {
      await p.goto(`${BASE}/${SEED.folha}`);
      await p.getByRole("button", { name: "Bloquear", exact: true }).click();
      await p.getByRole("dialog").getByRole("radio", { name: "Pedido do veículo" }).check();
      await expect(p.getByText("remove todas as reproduções da fonte")).toBeVisible();
    },
    { fullPage: false },
  );
});

test("18–19 · pedido de aprovação e diálogo de aprovar", async ({ page, baseURL }) => {
  await enter(page, "diego", baseURL);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/${SEED.placar}/configuracao`);
  const policy = page.getByLabel("Política de imagem");
  if ((await policy.inputValue()) === "none") {
    await policy.selectOption("reproduction");
    await expect(page.getByText("Mudança crítica", { exact: true }).first()).toBeVisible();
    await page
      .getByLabel("Justificativa da mudança crítica")
      .fill("Acordo de reprodução assinado (roteiro exploratório)");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("status")).toContainText(/aguarda aprovação|Nenhuma/);
  }
  await both(page, "18-aprovacao-pedido", async (p) => {
    await p.goto(`${BASE}/${SEED.placar}`);
    await expect(p.getByText(/Aguardando aprovação/)).toBeVisible();
  });
  await enter(page, "marina", baseURL);
  await both(
    page,
    "19-aprovacao-dialogo",
    async (p) => {
      await p.goto(`${BASE}/${SEED.placar}`);
      await p.getByRole("button", { name: "Revisar" }).first().click();
      await expect(p.getByRole("dialog")).toBeVisible();
    },
    { fullPage: false },
  );
});
