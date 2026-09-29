import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ROLES,
  can,
  canAccess,
  loginRedirect,
  resolveAccess,
  type Action,
  type Role,
} from "./permissions";

const only = (role: Role, sections: string[] = []) => [{ role, sections }];

it("editor publica só na editoria dele", () => {
  const r = [{ role: "editor" as const, sections: ["cidade"] }];
  expect(can(r, "article.publish", { section: "cidade" })).toBe(true);
  expect(can(r, "article.publish", { section: "politica" })).toBe(false);
});

it("jornalista edita só as próprias", () => {
  const r = [{ role: "jornalista" as const, sections: [] }];
  expect(can(r, "article.edit", { ownerId: "u1", userId: "u1" })).toBe(true);
  expect(can(r, "article.edit", { ownerId: "u2", userId: "u1" })).toBe(false);
  expect(can(r, "article.publish", { section: "cidade" })).toBe(false);
});

it("aprovar mudança crítica de fonte: admin e editor-chefe, não operador", () => {
  expect(can([{ role: "editor_chefe", sections: [] }], "source.approve_critical")).toBe(true);
  expect(can([{ role: "admin", sections: [] }], "source.approve_critical")).toBe(true);
  expect(can([{ role: "operador_ia", sections: [] }], "source.approve_critical")).toBe(false);
});

it("leitura não altera nada", () =>
  expect(can([{ role: "leitura", sections: [] }], "source.manage")).toBe(false));

describe("matriz (docs/architecture.md §6)", () => {
  // ✓ = permitido em qualquer escopo; "editoria" e "próprias" testados à parte.
  const allowed: Record<Action, Role[]> = {
    "article.edit": ["editor_chefe"],
    "article.publish": ["editor_chefe"],
    "article.unpublish_auto": ["editor_chefe"],
    "correction.manage": ["editor_chefe", "revisor"],
    "media.approve": ["editor_chefe", "revisor"],
    "source.manage": ["admin", "editor_chefe", "operador_ia"],
    "source.approve_critical": ["admin", "editor_chefe"],
    "rules.propose": ["admin", "editor_chefe", "operador_ia"],
    "rules.approve": ["admin", "editor_chefe"],
    "prompt.publish": ["admin", "editor_chefe", "operador_ia"],
    "rec.weights": ["admin", "operador_ia"],
    "reports.moderate": ["editor_chefe", "moderador"],
    "users.manage": ["admin"],
    "metrics.view": ["admin", "editor_chefe", "operador_ia", "analista", "leitura"],
    "audit.view": ["admin", "editor_chefe", "operador_ia", "leitura"],
    "site.manage": ["admin", "editor_chefe"],
  };
  const bySection: Action[] = [
    "article.edit",
    "article.publish",
    "article.unpublish_auto",
    "correction.manage",
    "media.approve",
    "metrics.view",
  ];

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      if (role === "editor" || role === "jornalista") continue;
      const expected = allowed[action].includes(role);
      it(`${role} ${expected ? "pode" : "não pode"} ${action}`, () => {
        expect(can(only(role), action, { section: "cidade", ownerId: "x", userId: "y" })).toBe(
          expected,
        );
      });
    }
  }

  it("editor: ações de editoria só nas editorias dele, nada fora da matriz", () => {
    const r = only("editor", ["cidade", "clima"]);
    for (const action of ACTIONS) {
      const expected = bySection.includes(action);
      expect(can(r, action, { section: "cidade" }), action).toBe(expected);
      expect(can(r, action, { section: "politica" }), action).toBe(false);
      expect(can(r, action), `${action} sem editoria`).toBe(false);
    }
  });

  it("jornalista só tem article.edit nas próprias", () => {
    const r = only("jornalista");
    for (const action of ACTIONS) {
      expect(can(r, action, { ownerId: "u1", userId: "u1", section: "cidade" }), action).toBe(
        action === "article.edit",
      );
    }
    expect(can(r, "article.edit")).toBe(false);
  });

  it("sem papel não pode nada", () => {
    for (const action of ACTIONS) expect(can([], action, { section: "cidade" })).toBe(false);
  });

  it("vários papéis somam permissões", () => {
    const r = [
      { role: "jornalista" as const, sections: [] },
      { role: "editor" as const, sections: ["esportes"] },
    ];
    expect(can(r, "article.publish", { section: "esportes" })).toBe(true);
    expect(can(r, "article.edit", { section: "cidade", ownerId: "u1", userId: "u1" })).toBe(true);
    expect(can(r, "article.edit", { section: "cidade", ownerId: "u2", userId: "u1" })).toBe(false);
  });
});

describe("canAccess (entrada em páginas, sem objeto)", () => {
  it("editor com editoria acessa métricas; sem editoria, não", () => {
    expect(canAccess(only("editor", ["cidade"]), "metrics.view")).toBe(true);
    expect(canAccess(only("editor"), "metrics.view")).toBe(false);
  });
  it("jornalista acessa edição (das próprias), não publicação", () => {
    expect(canAccess(only("jornalista"), "article.edit")).toBe(true);
    expect(canAccess(only("jornalista"), "article.publish")).toBe(false);
  });
  it("moderador não acessa fontes", () =>
    expect(canAccess(only("moderador"), "source.manage")).toBe(false));
});

describe("resolveAccess", () => {
  it("sem sessão manda para /entrar com next", () => {
    expect(resolveAccess(null, "audit.view", undefined, "/estudio/auditoria")).toEqual({
      ok: false,
      redirectTo: "/entrar?next=%2Festudio%2Fauditoria",
    });
  });
  it("sem permissão manda para /entrar com next e motivo", () => {
    const session = { userId: "u1", roles: only("moderador") };
    expect(resolveAccess(session, "source.manage", undefined, "/estudio/fontes")).toEqual({
      ok: false,
      redirectTo: "/entrar?next=%2Festudio%2Ffontes&motivo=sem-permissao",
    });
  });
  it("com permissão libera e usa o usuário da sessão no escopo", () => {
    const session = { userId: "u1", roles: only("jornalista") };
    expect(resolveAccess(session, "article.edit", { ownerId: "u1" }, "/estudio")).toEqual({
      ok: true,
    });
    expect(resolveAccess(session, "article.edit", { ownerId: "u2" }, "/estudio").ok).toBe(false);
  });
  it("next externo é descartado", () => {
    expect(loginRedirect("//malicioso.example")).toBe("/entrar?next=%2Festudio");
    expect(loginRedirect("https://malicioso.example")).toBe("/entrar?next=%2Festudio");
    expect(loginRedirect("/\t/malicioso.example")).toBe("/entrar?next=%2Festudio");
    expect(loginRedirect("/%09/malicioso.example")).toBe("/entrar?next=%2Festudio");
  });
});
