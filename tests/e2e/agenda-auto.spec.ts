import { expect, test, type Page } from "@playwright/test";
import { forwardedFor } from "./own-ip";
import { service, tag } from "./studio";

/*
 * AUT-T7 (A14): sugestão de evento do leitor com data futura, local conhecido e sem link entra
 * na Agenda na hora; local desconhecido segue para a fila da redação.
 */

const emails: string[] = [];
test.afterAll(async () => {
  const db = service();
  if (emails.length === 0) return;
  const { data } = await db
    .from("event_submissions")
    .select("id, event_id")
    .in("contact_email", emails);
  const ids = (data ?? []).map((s) => s.id);
  const events = (data ?? []).flatMap((s) => (s.event_id ? [s.event_id] : []));
  if (ids.length) {
    await db
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        ids.map((i) => `submission:${i}`),
      );
    await db.from("event_submissions").delete().in("id", ids);
  }
  if (events.length) await db.from("event_listings").delete().in("id", events);
});

/** Daqui a 5 dias, 19h (campo datetime-local, relógio de Cuiabá). */
function startsAt(): string {
  const d = new Date(Date.now() + 5 * 86_400_000);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Cuiaba" }).format(d);
  return `${day}T19:00`;
}

async function suggest(page: Page, title: string, venue: string, email: string) {
  await page.setExtraHTTPHeaders(forwardedFor());
  await page.goto("/agenda/sugerir");
  await page.getByLabel("Nome do evento").fill(title);
  await page.getByLabel("Data e hora de início").fill(startsAt());
  await page.getByLabel("Local", { exact: true }).fill(venue);
  await page.getByLabel("Entrada gratuita").check();
  await page.getByLabel("E-mail do responsável").fill(email);
  await page.getByLabel(/Autorizo o CityNews/).check();
  await page.getByRole("button", { name: "Enviar sugestão" }).click();
}

test("local conhecido e sem link entra na Agenda na hora", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cria evento no banco: só no projeto desktop");
  const t = tag();
  const title = `Sarau de teste ${t}`;
  const email = `auto-${t}@exemplo.com`;
  emails.push(email);
  await suggest(page, title, "Arena Pantanal", email);
  await expect(page.getByRole("status")).toContainText("Evento publicado na Agenda");

  const { data } = await service()
    .from("event_listings")
    .select("slug, origin")
    .eq("title", title)
    .single();
  expect(data?.origin).toBe("reader");
  await page.goto(`/agenda/${data!.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("local desconhecido segue para a redação", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "cria sugestão no banco: só no projeto desktop");
  const t = tag();
  const email = `fila-${t}@exemplo.com`;
  emails.push(email);
  await suggest(page, `Encontro de teste ${t}`, "Casa do Zé Desconhecida", email);
  await expect(page.getByRole("status")).toContainText("revisa em até 48 h");
  const { data } = await service()
    .from("event_submissions")
    .select("status")
    .eq("contact_email", email)
    .single();
  expect(data?.status).toBe("pending");
});
