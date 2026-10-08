import { studioNav } from "./nav";

const labels = (roles: Parameters<typeof studioNav>[0]) =>
  studioNav(roles).flatMap((g) => g.items.map((i) => i.label));
const findItem = (nav: ReturnType<typeof studioNav>, label: string) =>
  nav.flatMap((g) => g.items).find((i) => i.label === label);

it("jornalista vê a Redação, mas não Control Center nem Administração", () => {
  const nav = studioNav([{ role: "jornalista", sections: [] }]);
  expect(nav.map((g) => g.label)).toEqual(["Redação"]);
  expect(labels([{ role: "jornalista", sections: [] }])).toContain("Fila de matérias");
});

it("admin vê Administração e não vê a fila editorial", () => {
  const items = labels([{ role: "admin", sections: [] }]);
  expect(items).toContain("Usuários");
  expect(items).not.toContain("Fila de matérias");
});

it("analista vê Notificações push apontando para o Funil; jornalista não vê", () => {
  expect(findItem(studioNav([{ role: "analista", sections: [] }]), "Notificações push")?.href).toBe(
    "/estudio/admin/notificacoes/funil",
  );
  expect(
    findItem(studioNav([{ role: "jornalista", sections: [] }]), "Notificações push"),
  ).toBeUndefined();
  expect(
    findItem(
      studioNav([{ role: "editor_chefe", sections: [] }], { pendingPush: 2 }),
      "Notificações push (2)",
    ),
  ).toBeDefined();
});

it("editor com editoria entra por push.request; a contagem só aparece para quem aprova", () => {
  const editor = studioNav([{ role: "editor", sections: ["cidade"] }], { pendingPush: 3 });
  expect(findItem(editor, "Notificações push")?.href).toBe("/estudio/admin/notificacoes");
  expect(findItem(editor, "Notificações push (3)")).toBeUndefined();
  expect(
    findItem(studioNav([{ role: "editor", sections: [] }]), "Notificações push"),
  ).toBeUndefined();
  expect(
    findItem(studioNav([{ role: "admin", sections: [] }], { pendingPush: 0 }), "Notificações push")
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

it("Notificações push é item de primeiro nível da Redação (descobrível), não do grupo admin", () => {
  const nav = studioNav([{ role: "editor_chefe", sections: [] }]);
  const redacao = nav.find((g) => g.label === "Redação");
  expect(redacao?.items.map((i) => i.label)).toContain("Notificações push");
  expect(
    nav.find((g) => g.label === "Administração")?.items.map((i) => i.label) ?? [],
  ).not.toContain("Notificações push");
});

it("a central da equipe aparece para qualquer papel do Estúdio", () => {
  for (const role of ["jornalista", "moderador", "analista", "leitura"] as const)
    expect(findItem(studioNav([{ role, sections: [] }]), "Notificações da equipe")?.href).toBe(
      "/estudio/notificacoes",
    );
});

// UX-W3-T3 · itens 50, 51 e 60: menu reorganizado, ícones únicos, contagens e nomes em pt-BR.
const ALL: Parameters<typeof studioNav>[0] = [
  { role: "admin", sections: [] },
  { role: "editor_chefe", sections: [] },
  { role: "operador_ia", sections: [] },
];

it("nenhum ícone se repete no menu inteiro", () => {
  const icons = studioNav(ALL).flatMap((g) => g.items.map((i) => i.icon));
  expect(icons.length).toBeGreaterThan(30);
  expect(new Set(icons).size).toBe(icons.length);
});

it("Contingência é o primeiro item do Control Center, em destaque, só para quem administra", () => {
  const cc = studioNav([{ role: "admin", sections: [] }]).find((g) => g.label === "Control Center");
  expect(cc?.items[0]).toMatchObject({
    label: "Contingência",
    href: "/estudio/admin/contingencia",
    emphasis: true,
  });
  expect(
    findItem(studioNav([{ role: "operador_ia", sections: [] }]), "Contingência"),
  ).toBeUndefined();
});

it("Control Center em subgrupos: Operação, IA, Fontes e regras", () => {
  const nav = studioNav(ALL);
  const cc = nav.find((g) => g.label === "Control Center");
  const order = [...new Set(cc?.items.map((i) => i.subgroup).filter(Boolean))];
  expect(order).toEqual(["Operação", "IA", "Fontes e regras"]);
  expect(findItem(nav, "Registros")?.subgroup).toBe("Operação");
  expect(findItem(nav, "Testar prompts")?.subgroup).toBe("IA");
  expect(findItem(nav, "Aprovações")?.subgroup).toBe("Fontes e regras");
});

it("Governança tem um sentido só: o grupo é Administração e os itens de governança ficam", () => {
  expect(studioNav(ALL).map((g) => g.label)).toEqual([
    "Redação",
    "Control Center",
    "Administração",
  ]);
  expect(labels(ALL)).toEqual(expect.arrayContaining(["Governança da IA", "Governança editorial"]));
});

it("nomes em português: Redação, Testar prompts e Registros", () => {
  const items = labels(ALL);
  expect(items).toEqual(expect.arrayContaining(["Redação", "Testar prompts", "Registros"]));
  for (const old of ["Newsroom", "Playground", "Logs"]) expect(items).not.toContain(old);
});

it("contagens vão para os itens certos; zero não aparece", () => {
  const nav = studioNav(ALL, {
    counts: { exceptions: 4, reportsOverdue: 2, approvals: 1, failures: 0, mediaPending: 7 },
  });
  expect(findItem(nav, "Fila de matérias")?.count).toBe(4);
  expect(findItem(nav, "Denúncias")).toMatchObject({ count: 2, countKind: "overdue" });
  expect(findItem(nav, "Aprovações")?.count).toBe(1);
  expect(findItem(nav, "Falhas")?.count).toBeUndefined();
  expect(findItem(nav, "Mídia")?.count).toBe(7);
  expect(findItem(studioNav(ALL), "Mídia")?.count).toBeUndefined();
});

it("Agenda (AGM-T7) leva a /estudio/agenda só para quem publica na editoria Agenda", () => {
  const agenda = (roles: Parameters<typeof studioNav>[0]) => findItem(studioNav(roles), "Agenda");
  expect(agenda([{ role: "editor_chefe", sections: [] }])?.href).toBe("/estudio/agenda");
  expect(agenda([{ role: "editor", sections: ["cidade", "agenda"] }])?.href).toBe(
    "/estudio/agenda",
  );
  expect(agenda([{ role: "editor", sections: ["cidade"] }])).toBeUndefined();
  expect(agenda([{ role: "jornalista", sections: [] }])).toBeUndefined();
  expect(agenda([{ role: "admin", sections: [] }])).toBeUndefined();
  expect(
    findItem(studioNav([{ role: "editor_chefe", sections: [] }]), "Sugestões de evento"),
  ).toBeUndefined();
});
