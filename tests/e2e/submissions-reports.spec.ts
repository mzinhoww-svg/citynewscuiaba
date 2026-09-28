import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs, service, tag } from "./studio";

/*
 * Sugestões de evento e denúncias (E13, E14 · P4-T8): aprovar sugestão cria evento com origem
 * "reader"; rejeitar exige motivo e avisa o remetente; denúncia respondida sai da fila e
 * registra a resposta.
 */
const submissions: string[] = [];
const reports: string[] = [];
const events: string[] = [];
const emails: string[] = [];
test.afterAll(async () => {
  const db = service();
  if (submissions.length) {
    const { data } = await db.from("event_submissions").select("event_id").in("id", submissions);
    events.push(...(data ?? []).flatMap((d) => (d.event_id ? [d.event_id] : [])));
    await db.from("event_submissions").delete().in("id", submissions);
  }
  if (events.length) await db.from("event_listings").delete().in("id", events);
  if (reports.length) await db.from("reports").delete().in("id", reports);
  if (emails.length) await db.from("reader_emails").delete().in("to_email", emails);
});

async function submission(title: string, email: string) {
  const id = randomUUID();
  await service()
    .from("event_submissions")
    .insert({
      id,
      contact_email: email,
      payload: {
        title,
        startsAt: "2026-11-14T19:00:00-04:00",
        endsAt: null,
        venue: "Praça Popular",
        neighborhood: "centro-sul",
        priceCents: null,
        ageRating: "livre",
        link: null,
        description: "Evento de teste",
      },
    });
  submissions.push(id);
  return id;
}

test("aprovar sugestão cria evento de leitor confirmado", async ({ page }) => {
  const t = tag();
  const id = await submission(`Roda de samba de teste ${t}`, `e2e-p4-${t}@exemplo.com`);
  await loginAs(page, "otavio", "/estudio/agenda/sugestoes");
  const card = page.getByRole("article", { name: `Roda de samba de teste ${t}` });
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(card.getByText("Categoria").first()).toBeVisible();
  await card.getByLabel("Categoria").selectOption({ label: "Música" });
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sugestão aprovada" })).toBeVisible();

  const db = service();
  const { data: s } = await db
    .from("event_submissions")
    .select("status, event_id")
    .eq("id", id)
    .single();
  expect(s?.status).toBe("approved");
  const { data: e } = await db
    .from("event_listings")
    .select("origin, category, confirmed_at, title")
    .eq("id", s!.event_id!)
    .single();
  expect(e).toMatchObject({
    origin: "reader",
    category: "musica",
    title: `Roda de samba de teste ${t}`,
  });
  expect(e?.confirmed_at).toBeTruthy();
});

test("rejeitar sugestão exige motivo e o motivo vai ao remetente", async ({ page }) => {
  const t = tag();
  const email = `e2e-p4-${t}@exemplo.com`;
  emails.push(email);
  const sid = await submission(`Bazar de teste ${t}`, email);
  await loginAs(page, "marina", "/estudio/agenda/sugestoes");
  const card = page.getByRole("article", { name: `Bazar de teste ${t}` });
  await card.getByRole("button", { name: "Rejeitar" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Escreva o motivo, que vai para quem sugeriu")).toBeVisible();
  await page
    .getByLabel("Motivo (enviado ao remetente)")
    .fill("Evento de venda, fora da linha da agenda");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sugestão rejeitada" })).toBeVisible();
  const { data } = await service()
    .from("reader_emails")
    .select("kind, body, ref")
    .eq("to_email", email)
    .single();
  expect(data?.kind).toBe("event_rejected");
  expect(data?.ref).toBe(`submission:${sid}`);
  expect(data?.body).toContain("Evento de venda, fora da linha da agenda");
});

test("denúncia respondida sai da fila e registra resposta", async ({ page }) => {
  const t = tag();
  const id = randomUUID();
  await service()
    .from("reports")
    .insert({
      id,
      content_ref: "article:c2000000-0000-4000-8000-000000000012",
      kind: "broken_link",
      message: `Link quebrado de teste ${t}`,
      contact_email: `e2e-p4-${t}@exemplo.com`,
    });
  reports.push(id);
  emails.push(`e2e-p4-${t}@exemplo.com`);
  await loginAs(page, "carlos", "/estudio/denuncias?tipo=broken_link");
  const card = page.getByRole("article").filter({ hasText: `Link quebrado de teste ${t}` });
  await card.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(card.getByText("Escreva a resposta")).toBeVisible();
  await card.getByLabel(/Resposta ao leitor/).fill("Corrigimos o link. Obrigado pelo aviso.");
  await card.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Denúncia respondida" })).toBeVisible();
  await expect(page.getByText(`Link quebrado de teste ${t}`)).toHaveCount(0);

  const { data } = await service()
    .from("reports")
    .select("status, response, responded_by")
    .eq("id", id)
    .single();
  expect(data).toMatchObject({
    status: "answered",
    response: "Corrigimos o link. Obrigado pelo aviso.",
    responded_by: "c1000000-0000-4000-8000-000000000009",
  });
  const { data: mail } = await service()
    .from("reader_emails")
    .select("kind, ref")
    .eq("to_email", `e2e-p4-${t}@exemplo.com`)
    .single();
  expect(mail).toMatchObject({ kind: "report_response", ref: `report:${id}` });
});
