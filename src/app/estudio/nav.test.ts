import { studioNav } from "./nav";

const labels = (roles: Parameters<typeof studioNav>[0]) =>
  studioNav(roles).flatMap((g) => g.items.map((i) => i.label));
const findItem = (nav: ReturnType<typeof studioNav>, label: string) =>
  nav.flatMap((g) => g.items).find((i) => i.label === label);

it("jornalista vê a Redação, mas não Control Center nem Governança", () => {
  const nav = studioNav([{ role: "jornalista", sections: [] }]);
  expect(nav.map((g) => g.label)).toEqual(["Redação"]);
  expect(labels([{ role: "jornalista", sections: [] }])).toContain("Fila de matérias");
});

it("admin vê Governança e não vê a fila editorial", () => {
  const items = labels([{ role: "admin", sections: [] }]);
  expect(items).toContain("Usuários");
  expect(items).not.toContain("Fila de matérias");
});

it("analista vê Notificações apontando para o Funil; jornalista não vê", () => {
  expect(findItem(studioNav([{ role: "analista", sections: [] }]), "Notificações")?.href).toBe(
    "/estudio/admin/notificacoes/funil",
  );
  expect(
    findItem(studioNav([{ role: "jornalista", sections: [] }]), "Notificações"),
  ).toBeUndefined();
  expect(
    findItem(
      studioNav([{ role: "editor_chefe", sections: [] }], { pendingPush: 2 }),
      "Notificações (2)",
    ),
  ).toBeDefined();
});

it("editor com editoria entra por push.request; a contagem só aparece para quem aprova", () => {
  const editor = studioNav([{ role: "editor", sections: ["cidade"] }], { pendingPush: 3 });
  expect(findItem(editor, "Notificações")?.href).toBe("/estudio/admin/notificacoes");
  expect(findItem(editor, "Notificações (3)")).toBeUndefined();
  expect(findItem(studioNav([{ role: "editor", sections: [] }]), "Notificações")).toBeUndefined();
  expect(
    findItem(studioNav([{ role: "admin", sections: [] }], { pendingPush: 0 }), "Notificações")
      ?.icon,
  ).toBe("bell");
});

it("Guia Cuiabá aparece para admin, editor-chefe e editor da editoria; não para jornalista nem editor de outra editoria", () => {
  const guide = (roles: Parameters<typeof studioNav>[0]) =>
    findItem(studioNav(roles), "Guia Cuiabá");
  expect(guide([{ role: "admin", sections: [] }])?.href).toBe("/estudio/admin/guia");
  expect(guide([{ role: "editor_chefe", sections: [] }])).toBeDefined();
  expect(guide([{ role: "editor", sections: ["guia-cuiaba"] }])).toBeDefined();
  expect(guide([{ role: "editor", sections: ["cidade"] }])).toBeUndefined();
  expect(guide([{ role: "jornalista", sections: [] }])).toBeUndefined();
  expect(guide([{ role: "leitura", sections: [] }])).toBeUndefined();
});
