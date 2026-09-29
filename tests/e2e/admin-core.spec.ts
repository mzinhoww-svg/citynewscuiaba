import { expect, test } from "@playwright/test";
import { loginAs, service, STAFF, tag } from "./studio";

/*
 * Administração (P5-T8): convidar usuário ("Convite pendente"), conceder `admin` pedindo a
 * aprovação `role.admin` (outra pessoa decide), mesclar tags duplicadas preservando os vínculos e
 * reordenar módulos da home por teclado (Alt + setas) e publicar. Cada teste cria os próprios
 * dados (projetos desktop e mobile rodam em paralelo). A home publicada é estado global: o teste
 * que publica roda só no desktop e restaura a versão anterior; o mobile confere os botões de
 * subir e descer sem salvar nada.
 */
const created = { users: [] as string[], invites: [] as string[], tags: [] as string[] };

test.afterAll(async () => {
  const db = service();
  for (const id of created.users) {
    await db.from("approvals").delete().eq("kind", "role.admin").eq("target_ref", id);
    await db.from("user_roles").delete().eq("user_id", id);
    await db.from("profiles").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  if (created.invites.length) await db.from("staff_invites").delete().in("email", created.invites);
  if (created.tags.length) {
    await db.from("article_tags").delete().in("tag_id", created.tags);
    await db.from("tags").delete().in("id", created.tags);
  }
});

async function tempPerson(name: string) {
  const db = service();
  const email = `${tag()}-admin-core@citynews.local`;
  const u = await db.auth.admin.createUser({
    email,
    password: "senha-de-teste-123",
    email_confirm: true,
  });
  if (u.error) throw u.error;
  created.users.push(u.data.user.id);
  const p = await db.from("profiles").insert({ id: u.data.user.id, display_name: name });
  if (p.error) throw p.error;
  return { id: u.data.user.id, email, name };
}

test("convidar usuário mostra Convite pendente e o registro fica na fila", async ({ page }) => {
  const email = `${tag()}-convidada@exemplo.test`;
  created.invites.push(email);
  await loginAs(page, "helena", "/estudio/admin/usuarios");
  await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Papel inicial").selectOption("jornalista");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite enviado" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row.getByText("Convite pendente")).toBeVisible();
  const db = await service()
    .from("staff_invites")
    .select("status, email_status")
    .eq("email", email)
    .single();
  expect(db.data).toEqual({ status: "pending", email_status: "queued" });

  await row.getByRole("button", { name: `Cancelar convite de ${email}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Convite cancelado" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(0);
});

test("conceder admin pede a aprovação role.admin e só vale depois de outra pessoa aprovar", async ({
  page,
}) => {
  const t = tag();
  const person = await tempPerson(`Pessoa Admin ${t}`);
  const why = `Nova pessoa de TI ${t}`;

  await loginAs(page, "helena", "/estudio/admin/papeis");
  await page
    .getByLabel("Pessoa", { exact: true })
    .selectOption({ label: `${person.name} (${person.email})` });
  await page.getByLabel("Papel", { exact: true }).selectOption("admin");
  // Sem justificativa, o pedido é recusado.
  await page.getByRole("button", { name: "Conceder papel" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Escreva a justificativa" }),
  ).toBeVisible();

  await page
    .getByLabel("Pessoa", { exact: true })
    .selectOption({ label: `${person.name} (${person.email})` });
  await page.getByLabel("Papel", { exact: true }).selectOption("admin");
  await page.getByLabel(/^Justificativa/).fill(why);
  await page.getByRole("button", { name: "Conceder papel" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "A aprovação precisa ser de outra pessoa" }),
  ).toBeVisible();
  const pending = await service()
    .from("approvals")
    .select("id, status, requested_by")
    .eq("kind", "role.admin")
    .eq("target_ref", person.id);
  expect(pending.data).toEqual([
    expect.objectContaining({ status: "pending", requested_by: STAFF.helena.id }),
  ]);
  const none = await service().from("user_roles").select("role").eq("user_id", person.id);
  expect(none.data).toEqual([]);

  await page.context().clearCookies();
  await loginAs(page, "marina", "/estudio/control/aprovacoes");
  await page
    .getByRole("article")
    .filter({ hasText: why })
    .getByRole("button", { name: /^Aprovar:/ })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Aprovação registrada." })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, "helena", "/estudio/admin/papeis");
  await page
    .getByLabel("Pessoa", { exact: true })
    .selectOption({ label: `${person.name} (${person.email})` });
  await page.getByLabel("Papel", { exact: true }).selectOption("admin");
  await page.getByRole("button", { name: "Conceder papel" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Papel concedido." })).toBeVisible();
  const role = await service().from("user_roles").select("role").eq("user_id", person.id);
  expect(role.data).toEqual([{ role: "admin" }]);
  const history = page.getByRole("table", { name: "Últimas alterações de papéis" });
  await expect(history.getByRole("row").filter({ hasText: person.name }).first()).toBeVisible();
});

test("mesclar tags duplicadas preserva os vínculos", async ({ page }) => {
  const t = tag();
  const db = service();
  const ins = await db
    .from("tags")
    .insert([
      { name: `Obras ${t}`, slug: `obras-${t}` },
      { name: `Obra ${t}`, slug: `obra-${t}` },
    ])
    .select("id, slug");
  if (ins.error) throw ins.error;
  const from = ins.data.find((x) => x.slug === `obras-${t}`)!.id;
  const into = ins.data.find((x) => x.slug === `obra-${t}`)!.id;
  created.tags.push(from, into);
  const arts = (await db.from("articles").select("id").limit(3)).data ?? [];
  expect(arts.length).toBe(3);
  await db.from("article_tags").insert([
    { article_id: arts[0]!.id, tag_id: from },
    { article_id: arts[1]!.id, tag_id: from },
    { article_id: arts[1]!.id, tag_id: into },
    { article_id: arts[2]!.id, tag_id: into },
  ]);

  await loginAs(page, "helena", "/estudio/admin/taxonomia");
  const suggestion = page.getByRole("button", { name: new RegExp(`^Mesclar a tag Obras ${t}`) });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(
    page.getByRole("status").filter({ hasText: /Tags mescladas\. \d+ vínculos? preservados?/ }),
  ).toBeVisible();
  await expect(page.locator(`tr[data-tag="obras-${t}"]`)).toHaveCount(0);
  await expect(page.locator(`tr[data-tag="obra-${t}"]`)).toContainText("3");

  const links = await db.from("article_tags").select("article_id").eq("tag_id", into);
  expect(new Set(links.data?.map((l) => l.article_id))).toEqual(new Set(arts.map((a) => a.id)));
  expect(links.data).toHaveLength(3);
  expect((await db.from("tags").select("id").eq("id", from)).data).toEqual([]);
});

test("quem não é admin não abre a Administração", async ({ page }) => {
  await loginAs(page, "juliana");
  await page.goto("/estudio/admin/usuarios");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
  await page.goto("/estudio/admin/home");
  await expect(page).toHaveURL(/motivo=sem-permissao/);
});

test.describe("home", () => {
  // Estado global (versão publicada): um teste por vez, no mesmo processo.
  test.describe.configure({ mode: "serial" });

  test("reordenar módulos da home por teclado (Alt + setas) e publicar", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Alt + setas é atalho de teclado; o mobile confere os botões, sem publicar",
    );
    const db = service();
    const before =
      (await db.from("home_layouts").select("id, modules").eq("status", "published")).data ?? [];
    try {
      await loginAs(page, "helena", "/estudio/admin/home");
      const items = page
        .getByRole("list", { name: "Módulos da home, em ordem" })
        .getByRole("listitem");
      const keys = () =>
        items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.module));
      const first = (await keys()).slice(0, 3);
      await items.nth(1).focus();
      await page.keyboard.press("Alt+ArrowUp");
      await expect.poll(keys).toEqual([first[1], first[0], first[2], ...(await keys()).slice(3)]);
      await expect(items.nth(0)).toBeFocused();
      await expect(
        page.getByRole("status").filter({ hasText: /movido para a posição 1 de/ }),
      ).toBeAttached();
      await page.keyboard.press("Alt+ArrowDown");
      await page.keyboard.press("Alt+ArrowDown");
      await expect
        .poll(async () => (await keys()).slice(0, 3))
        .toEqual([first[0], first[2], first[1]]);

      await page.getByRole("button", { name: "Publicar na home" }).click();
      const done = page.getByRole("status").filter({ hasText: /Versão \d+ publicada/ });
      await expect(done).toBeVisible();
      const version = Number(/Versão (\d+)/.exec((await done.textContent()) ?? "")?.[1]);
      const row = await db
        .from("home_layouts")
        .select("modules, status")
        .eq("version", version)
        .single();
      expect((row.data?.modules as { key: string }[]).slice(0, 3).map((m) => m.key)).toEqual([
        first[0],
        first[2],
        first[1],
      ]);

      // A home pública lê a versão publicada (mesmo bloco em ordem nova) e a página do editor a mostra.
      await page.reload();
      await expect
        .poll(async () => (await keys()).slice(0, 3))
        .toEqual([first[0], first[2], first[1]]);
      await page.goto("/");
      await expect(page.locator("main")).toBeVisible();
    } finally {
      // Restaura a versão publicada de antes (ou nenhuma), sem apagar histórico.
      await db.from("home_layouts").update({ status: "archived" }).eq("status", "published");
      await db.from("home_layouts").delete().eq("status", "draft");
      if (before[0])
        await db.from("home_layouts").update({ status: "published" }).eq("id", before[0].id);
    }
  });

  test("no celular, subir e descer pelos botões muda a ordem e anuncia a posição", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "botões de subir e descer: fluxo de toque, conferido no mobile");
    await loginAs(page, "helena", "/estudio/admin/home");
    const items = page
      .getByRole("list", { name: "Módulos da home, em ordem" })
      .getByRole("listitem");
    const keys = () =>
      items.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.module));
    const first = (await keys()).slice(0, 2);
    await expect(page.getByRole("button", { name: /^Subir / }).first()).toBeDisabled();
    await items
      .nth(0)
      .getByRole("button", { name: /^Descer / })
      .click();
    await expect.poll(async () => (await keys()).slice(0, 2)).toEqual([first[1], first[0]]);
    await expect(
      page.getByRole("status").filter({ hasText: /movido para a posição 2 de/ }),
    ).toBeAttached();
  });

  test("a home pública lê a versão publicada e volta ao padrão ao republicar o layout padrão", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "estado global da home: conferido uma vez, no desktop");
    const position = () =>
      page.evaluate(() => {
        const a = document.getElementById("home-newsletter");
        const b = document.getElementById("home-nearby");
        if (!a || !b) return "ausente";
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? "newsletter-antes"
          : "nearby-antes";
      });
    const publish = async () => {
      await page.getByRole("button", { name: "Publicar na home" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: /Versão \d+ publicada/ }),
      ).toBeVisible();
    };
    try {
      await loginAs(page, "helena", "/estudio/admin/home");
      await page.getByRole("button", { name: "Voltar ao layout padrão" }).click();
      await publish();
      await expect
        .poll(async () => {
          await page.goto("/");
          return position();
        })
        .toBe("nearby-antes");

      // Newsletter sobe até antes de "Perto de você", e a home pública passa a mostrá-la primeiro.
      await page.goto("/estudio/admin/home");
      const items = page
        .getByRole("list", { name: "Módulos da home, em ordem" })
        .getByRole("listitem");
      await items.filter({ has: page.getByText("Formulário de inscrição.") }).focus();
      for (let i = 0; i < 6; i++) await page.keyboard.press("Alt+ArrowUp");
      await publish();
      await expect
        .poll(async () => {
          await page.goto("/");
          return position();
        })
        .toBe("newsletter-antes");
    } finally {
      // Republica o layout padrão (efeito igual a não ter versão) e devolve o ponteiro anterior.
      await page.goto("/estudio/admin/home");
      await page.getByRole("button", { name: "Voltar ao layout padrão" }).click();
      await page.getByRole("button", { name: "Publicar na home" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: /Versão \d+ publicada/ }),
      ).toBeVisible();
    }
  });
});
