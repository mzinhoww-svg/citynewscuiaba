import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  user: { id: string; last_sign_in_at?: string } | null;
  roles: { role: string; sections: string[] }[];
  sessionHours: number;
} = {
  user: null,
  roles: [],
  sessionHours: 12,
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
    rpc: async (name: string) =>
      name === "security_session_hours"
        ? { data: state.sessionHours, error: null }
        : { data: null, error: { message: "rpc desconhecida" } },
  }),
}));

const { getSession, requireRole, requireAnyRole } = await import("./require-role");

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

describe("duração da sessão da equipe (A11, gate do P5 achado 2)", () => {
  beforeEach(() => {
    state.user = null;
    state.roles = [];
    state.sessionHours = 12;
  });
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  it("dentro do limite a sessão vale", async () => {
    state.user = { id: "u1", last_sign_in_at: hoursAgo(2) };
    state.roles = [{ role: "editor", sections: ["cidade"] }];
    await expect(requireRole("article.publish", { section: "cidade" })).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it("depois do limite tira o papel e manda entrar de novo, com o motivo", async () => {
    state.user = { id: "u1", last_sign_in_at: hoursAgo(5) };
    state.roles = [{ role: "editor", sections: ["cidade"] }];
    state.sessionHours = 4;
    await expect(requireRole("article.publish", { section: "cidade" })).rejects.toThrow(
      "REDIRECT /entrar?next=%2Festudio&motivo=sessao-expirada",
    );
    await expect(requireAnyRole(["article.publish"])).rejects.toThrow("motivo=sessao-expirada");
    const session = await getSession();
    expect(session).toMatchObject({ userId: "u1", roles: [], expired: true });
  });

  it("quem não tem papel (leitor) nunca é afetado pelo limite", async () => {
    state.user = { id: "leitor", last_sign_in_at: hoursAgo(500) };
    state.roles = [];
    expect(await getSession()).toEqual({ userId: "leitor", roles: [] });
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
