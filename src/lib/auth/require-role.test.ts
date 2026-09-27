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

const { requireRole } = await import("./require-role");

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
