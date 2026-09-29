import { beforeEach, describe, expect, it, vi } from "vitest";

const state: { user: { id: string } | null; roles: { role: string; sections: string[] }[] } = {
  user: null,
  roles: [],
};

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

vi.mock("@/lib/db/client", () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: state.roles, error: null }),
      }),
    }),
  }),
}));

const { requireRole, requireAnyRole } = await import("./require-role");

describe("requireRole", () => {
  beforeEach(() => {
    state.user = null;
    state.roles = [];
  });

  it("sem sessão redireciona para /entrar?next=", async () => {
    await expect(
      requireRole("audit.view", undefined, { next: "/estudio/auditoria" }),
    ).rejects.toThrow("REDIRECT /entrar?next=%2Festudio%2Fauditoria");
  });

  it("sem permissão redireciona com motivo", async () => {
    state.user = { id: "u1" };
    state.roles = [{ role: "jornalista", sections: [] }];
    await expect(requireRole("article.publish", { section: "cidade" })).rejects.toThrow(
      "REDIRECT /entrar?next=%2Festudio&motivo=sem-permissao",
    );
  });

  it("com permissão devolve a sessão", async () => {
    state.user = { id: "u1" };
    state.roles = [{ role: "editor", sections: ["cidade"] }];
    await expect(requireRole("article.publish", { section: "cidade" })).resolves.toEqual({
      userId: "u1",
      roles: [{ role: "editor", sections: ["cidade"] }],
    });
  });
});

describe("requireAnyRole (A09)", () => {
  const PUSH = ["push.request", "push.approve", "push.settings", "push.metrics"] as const;
  beforeEach(() => {
    state.user = null;
    state.roles = [];
  });

  it("sem sessão → /entrar?next; sem nenhuma ação → motivo=sem-permissao", async () => {
    await expect(requireAnyRole(PUSH, { next: "/estudio/admin/notificacoes" })).rejects.toThrow(
      "REDIRECT /entrar?next=%2Festudio%2Fadmin%2Fnotificacoes",
    );
    state.user = { id: "u1" };
    state.roles = [{ role: "jornalista", sections: [] }];
    await expect(requireAnyRole(PUSH, { next: "/estudio/admin/notificacoes" })).rejects.toThrow(
      "REDIRECT /entrar?next=%2Festudio%2Fadmin%2Fnotificacoes&motivo=sem-permissao",
    );
    // Editor sem editoria: `push.request` por editoria não vale em escopo nenhum.
    state.roles = [{ role: "editor", sections: [] }];
    await expect(requireAnyRole(PUSH)).rejects.toThrow("motivo=sem-permissao");
  });

  it("basta uma das ações: analista entra pelo push.metrics; editor com editoria pelo push.request", async () => {
    state.user = { id: "u2" };
    state.roles = [{ role: "analista", sections: [] }];
    await expect(requireAnyRole(PUSH)).resolves.toMatchObject({ userId: "u2" });
    state.roles = [{ role: "editor", sections: ["cidade"] }];
    await expect(requireAnyRole(PUSH)).resolves.toMatchObject({ userId: "u2" });
  });
});
