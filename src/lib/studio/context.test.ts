// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const getSession = vi.fn(async () => ({ userId: "u1", email: "a@b.c", roles: [] }));
const createServerClient = vi.fn(async () => ({}));
vi.mock("@/lib/auth/require-role", () => ({ getSession }));
vi.mock("@/lib/db/client", () => ({ createServerClient }));
vi.mock("@/lib/pipeline/revalidate", () => ({ revalidateTags: async () => {} }));

const { studioContext, withSharedStudioContext } = await import("./context");

beforeEach(() => {
  getSession.mockClear();
  createServerClient.mockClear();
});

it("sem contexto compartilhado, cada chamada resolve a sessão de novo", async () => {
  await studioContext();
  await studioContext();
  expect(getSession).toHaveBeenCalledTimes(2);
});

it("lote reutiliza uma sessão e um cliente para todos os itens (achado 18)", async () => {
  await withSharedStudioContext(async () => {
    for (let i = 0; i < 5; i++) await studioContext();
  });
  expect(getSession).toHaveBeenCalledTimes(1);
  expect(createServerClient).toHaveBeenCalledTimes(1);
});
