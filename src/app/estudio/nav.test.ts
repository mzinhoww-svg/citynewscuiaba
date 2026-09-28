import { studioNav } from "./nav";

const labels = (roles: Parameters<typeof studioNav>[0]) =>
  studioNav(roles).flatMap((g) => g.items.map((i) => i.label));

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

it("Aprovações aparece para quem pede ou decide mudança crítica, não para analista", () => {
  expect(labels([{ role: "operador_ia", sections: [] }])).toContain("Aprovações");
  expect(labels([{ role: "editor_chefe", sections: [] }])).toContain("Aprovações");
  expect(labels([{ role: "analista", sections: [] }])).not.toContain("Aprovações");
  expect(labels([{ role: "jornalista", sections: [] }])).not.toContain("Aprovações");
});
