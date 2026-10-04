import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gotoSettled } from "./helpers/nav";
import { cronSecret, drain } from "./helpers/pipeline";
import { loginAs } from "./helpers/studio-login";
import { createArticle, removeArticles, service, STAFF, tag } from "./studio";

/*
 * REV-T1 · Fila de revisão: selecionar tudo e "Publicar mesmo assim". Fixtures próprias numa
 * editoria por projeto (desktop, mobile e webkit rodam em paralelo no mesmo banco); só as
 * matérias do teste aparecem na lista filtrada.
 */
const SECTION: Record<string, string> = {
  desktop: "gastronomia",
  mobile: "entretenimento",
  "mobile-webkit": "clima",
};
const created: string[] = [];
const jobs: string[] = [];

test.afterAll(async () => {
  const db = service();
  for (const j of jobs) await db.from("decisions").delete().eq("object_ref", `forced_publish:${j}`);
  if (jobs.length) await db.from("forced_publish_jobs").delete().in("id", jobs);
  await removeArticles(created);
});

const emptyDoc = { type: "doc", content: [] };

test("selecionar tudo, ler os riscos, cancelar não muda nada e confirmar publica o que dá", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.slow();
  const section = SECTION[testInfo.project.name] ?? "gastronomia";
  const t = tag();
  const mk = async (title: string, extra: Record<string, unknown> = {}) => {
    const id = await createArticle({
      title: `${title} ${t}`,
      section_slug: section,
      status: "in_review",
      kind: "normalized",
      agent_id: "write",
      ...extra,
    });
    created.push(id);
    return id;
  };
  const a = await mk("Obra na avenida");
  const b = await mk("Feira do bairro");
  const empty = await mk("Sem texto algum", { body: emptyDoc });

  await loginAs(context, "marina");
  await gotoSettled(page, `/estudio/fila?aba=all&estado=in_review&editoria=${section}`);
  await expect(page.getByRole("link", { name: `Obra na avenida ${t}` })).toBeVisible();

  // Cabeçalho marca as em revisão da página; só há 3 em revisão, então não oferece "todas as N".
  const header = page.getByRole("checkbox", {
    name: "Selecionar todas as matérias em revisão desta página",
  });
  await header.check();
  await expect(
    page.getByRole("checkbox", { name: `Selecionar "Obra na avenida ${t}"` }),
  ).toBeChecked();
  await expect(page.getByText("3 matérias selecionadas nesta página.")).toBeVisible();

  // Diálogo: riscos, responsabilidade, foco fora do botão de publicar.
  await page.getByRole("button", { name: "Publicar mesmo assim" }).click();
  const dialog = page.getByRole("dialog", { name: "Publicar mesmo assim" });
  await expect(dialog.getByText(/sem foto aprovada/)).toBeVisible();
  await expect(
    dialog.getByText(/Você assume a responsabilidade pela publicação destas matérias\./),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Publicar 2 matérias" })).not.toBeFocused();
  await expect(dialog.getByText(/1 matéria fica de fora/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).include("dialog").analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
    [],
  );

  // Cancelar (e Esc) não muda nada.
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Publicar mesmo assim" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const still = await service().from("articles").select("status").in("id", [a, b, empty]);
  expect(still.data?.every((r) => r.status === "in_review")).toBe(true);

  // Confirmar: enfileira (não publica na hora) e mostra o andamento.
  await page.getByRole("button", { name: "Publicar mesmo assim" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publicar 2 matérias" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(/Publicando \d+ de 2/)
      .first(),
  ).toBeVisible();
  const job = await service()
    .from("forced_publish_jobs")
    .select("id, total, requested_by")
    .eq("requested_by", STAFF.marina.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .single();
  jobs.push(job.data!.id);
  expect(job.data?.total).toBe(2);

  // O worker (drain) processa o lote; a tela mostra o resultado parcial.
  const d = await drain(baseURL!, cronSecret());
  expect(d.status).toBe(200);
  await expect(
    page.getByRole("dialog").getByText("2 matérias publicadas; 1 ficou de fora."),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("dialog").getByText(/Sem texto algum/)).toBeVisible();

  const rows = await service()
    .from("articles")
    .select("id, status, publish_mode")
    .in("id", [a, b, empty]);
  const byId = new Map(rows.data?.map((r) => [r.id, r]));
  expect(byId.get(a)).toMatchObject({ status: "published", publish_mode: "auto" });
  expect(byId.get(b)).toMatchObject({ status: "published" });
  expect(byId.get(empty)?.status).toBe("in_review");
});
