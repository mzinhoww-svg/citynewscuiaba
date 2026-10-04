import { expect, test } from "@playwright/test";
import { expectHydrated } from "./helpers/hydration";
import { createArticle, loginAs, removeArticles, service } from "./studio";

/*
 * Decisão rápida (UX-W3-T1, itens 45 e 46): no celular a barra de decisão fica no rodapé, visível
 * sem rolar; "Aprovar e ir para o próximo" segue para o próximo item da mesma aba e filtros e
 * mantém a origem (`?de=`) para o "Voltar".
 */
const created: string[] = [];
const sections: string[] = [];
test.afterAll(async () => {
  await removeArticles(created);
  if (sections.length) await service().from("sections").delete().in("slug", sections);
});

/** Slug só com letras (o filtro de editoria aceita `[a-z-]`). */
const letters = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );

/** Item do pipeline em revisão, com checklist completo (dá para aprovar). */
async function pipelineItem(section: string, title: string) {
  const id = await createArticle({
    title,
    section_slug: section,
    status: "in_review",
    agent_id: "write",
    review_reason: "Regra de teste: assunto pede revisão humana",
    tags: ["teste"],
    neighborhoods: ["porto"],
    seo_title: title.slice(0, 60),
    seo_description: "Descrição de teste para a fila do Estúdio com tamanho suficiente.",
  });
  created.push(id);
  return id;
}

test("celular: Aprovar e Pedir ajuste ficam no rodapé, visíveis sem rolar", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "barra fixa só abaixo de xl");
  const id = await pipelineItem("cidade", `Item para a barra fixa ${letters()}`);
  await loginAs(page, "marina");
  await page.goto(`/estudio/fila/${id}`);
  const approve = page.getByRole("button", { name: "Aprovar e publicar" });
  await expectHydrated(approve);
  await expect(approve).toBeInViewport();
  await expect(page.getByRole("button", { name: "Pedir ajuste" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Mais ações" })).toBeInViewport();
});

test("aprovar e ir para o próximo mantém a aba e os filtros", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "um projeto basta para o fluxo");
  const slug = `fluxo-${letters()}`;
  const s = await service()
    .from("sections")
    .insert({ slug, name: `Fluxo ${slug}`, autonomy_category: "cidade" } as never);
  if (s.error) throw s.error;
  sections.push(slug);
  const a = await pipelineItem(slug, `Primeiro da sequência ${slug}`);
  const b = await pipelineItem(slug, `Segundo da sequência ${slug}`);

  await loginAs(page, "marina");
  await page.goto(`/estudio/fila?aba=exceptions&editoria=${slug}`);
  const links = page.getByRole("link", { name: /da sequência/ });
  await expect(links).toHaveCount(2);
  const firstHref = (await links.first().getAttribute("href")) ?? "";
  const first = firstHref.includes(a) ? a : b;
  const second = first === a ? b : a;
  expect(firstHref).toContain("de=");

  await links.first().click();
  await expect(page).toHaveURL(new RegExp(`/estudio/fila/${first}`));
  const next = page.getByRole("button", { name: "Aprovar e ir para o próximo" });
  await expectHydrated(next);
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/estudio/fila/${second}\\?de=`));
  const origin = new URL(page.url()).searchParams.get("de") ?? "";
  expect(origin).toContain("aba=exceptions");
  expect(origin).toContain(`editoria=${slug}`);

  const back = page.getByRole("link", { name: "Voltar para a fila" });
  await expect(back).toHaveAttribute("href", origin);
  const { data } = await service().from("articles").select("status").eq("id", first).single();
  expect(data?.status).toBe("published");
});
