import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createArticle, loginAs, removeArticles, service, tag } from "./studio";

/*
 * Mídia, licenças, aprovação e geração (E09 a E12 · P4-T7, Review Focus 4): licença vencendo
 * em 20 dias aparece; vencida em matéria publicada gera alerta com troca sugerida; aprovação
 * de imagem; geração recusada em Segurança.
 */
const articles: string[] = [];
const media: string[] = [];
test.afterAll(async () => {
  await removeArticles(articles);
  if (media.length) await service().from("media_assets").delete().in("id", media);
});

async function asset(fields: Record<string, unknown>) {
  const id = randomUUID();
  const { error } = await service()
    .from("media_assets")
    .insert({
      id,
      kind: "licensed",
      storage_path: `teste/${id}.jpg`,
      license: `Banco de teste ${id.slice(0, 6)}`,
      credit: `Banco de teste ${id.slice(0, 6)}`,
      allowed_use: "Editorial",
      status: "approved",
      ...fields,
    });
  if (error) throw error;
  media.push(id);
  return id;
}

const isoDay = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("licença vencendo em 20 dias aparece na tabela de licenças", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/midia/licencas");
  const row = page.getByRole("row", { name: /Banco Cerrado Imagens · contrato 2026-14/ });
  await expect(row).toContainText(/Vence em (19|20|21) dias/);
  await expect(page.getByRole("row", { name: /Arquivo Pantanal Foto/ })).toContainText(
    "Vencida há",
  );
});

test("vencida em matéria publicada gera alerta e a troca resolve", async ({ page }) => {
  const t = tag();
  const art = await createArticle({
    title: `Posto de saúde reabre no Coxipó ${t}`,
    status: "published",
    publish_mode: "human",
    published_at: new Date(Date.now() - 3_600_000).toISOString(),
  });
  articles.push(art);
  const old = await asset({ license_until: isoDay(-2), credit: `Foto vencida ${t}` });
  const fresh = await asset({ license_until: isoDay(200), credit: `Foto nova ${t}` });
  await service().from("article_media").insert({
    article_id: art,
    media_id: old,
    rationale: "teste",
    chosen_by: "teste",
    alt: "Posto",
  });

  await loginAs(page, "marina", "/estudio/midia/licencas");
  const alert = page.getByText(
    `Licença vencida em matéria publicada: "Posto de saúde reabre no Coxipó ${t}". Troque a imagem.`,
  );
  await expect(alert).toBeVisible();
  await page.goto(`/estudio/midia/${old}`);
  await page
    .getByLabel(`Trocar a imagem de "Posto de saúde reabre no Coxipó ${t}"`)
    .selectOption({ label: `Foto nova ${t} · licensed` });
  await page.getByRole("button", { name: "Trocar imagem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imagem trocada" })).toBeVisible();
  const { data } = await service().from("article_media").select("media_id").eq("article_id", art);
  expect(data?.map((d) => d.media_id)).toEqual([fresh]);
});

test("revisor aprova imagem pendente e bloqueio exige motivo", async ({ page }) => {
  const t = tag();
  const id = await asset({ status: "pending", kind: "original", credit: `Foto pendente ${t}` });
  await loginAs(page, "beatriz", "/estudio/midia");
  await page.getByRole("link", { name: `Foto pendente ${t}` }).click();
  await page.getByRole("button", { name: "Bloquear imagem" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Escreva o motivo do bloqueio")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Aprovar imagem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imagem aprovada" })).toBeVisible();
  const { data } = await service().from("media_assets").select("status").eq("id", id).single();
  expect(data?.status).toBe("approved");
});

test("gerar ilustração para Segurança é recusado com as restrições visíveis", async ({ page }) => {
  await loginAs(page, "marina", "/estudio/materias/c2000000-0000-4000-8000-000000000021");
  await page.getByRole("button", { name: "Gerar ilustração" }).click();
  const drawer = page.getByRole("dialog", { name: "Geração de imagem" });
  await expect(drawer.getByText("Não fotorrealista")).toBeVisible();
  await expect(drawer.getByText("Sem pessoas reais identificáveis")).toBeVisible();
  await drawer.getByRole("button", { name: "Sugerir descrição a partir da matéria" }).click();
  await expect(drawer.getByRole("status")).toContainText(
    "Ilustração gerada não é permitida para Segurança, crime, tragédia ou saúde individual.",
  );
});
