import { expect, test } from "@playwright/test";
import { forwardedFor } from "./own-ip";

/**
 * Status HTTP com blocos em `<Suspense>` (item 87, A-037): o `notFound()` e o 410 do proxy
 * acontecem antes de qualquer streaming, então a resposta não vira 200 com a página de erro.
 * Pedidos sem JavaScript (só HTTP), como faz um robô de busca.
 */
test.use({ extraHTTPHeaders: forwardedFor() });

const CASES: { path: string; status: number }[] = [
  { path: "/materia/nao-existe", status: 404 },
  { path: "/materia/Slug_Invalido", status: 404 },
  { path: "/materia/materia-arquivada-seed", status: 410 },
  { path: "/editoria-que-nao-existe", status: 404 },
  { path: "/editoria-que-nao-existe?periodo=7d", status: 404 },
  { path: "/materia/prefeitura-detalha-novo-plano-de-onibus-cpa-centro", status: 200 },
  { path: "/cidade", status: 200 },
  { path: "/agenda", status: 200 },
  { path: "/agenda?view=cal", status: 200 },
];

for (const { path, status } of CASES) {
  test(`${path} responde ${status}`, async ({ request }) => {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status()).toBe(status);
  });
}

test("a barra de navegação pendente não fica na página depois que a rota chega", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("progressbar", { name: "Carregando a página" })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Editorias" })
    .getByRole("link", { name: "Cidade" })
    .click();
  await expect(page).toHaveURL(/\/cidade$/);
  await expect(page.getByRole("heading", { level: 1, name: "Cidade" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Carregando a página" })).toHaveCount(0);
});
