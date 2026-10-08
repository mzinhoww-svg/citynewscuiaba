// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* C2-01: o bairro só vale se estiver na lista curada ou se já for o bairro gravado NO BANCO; o
   campo oculto `current_neighborhood` do formulário não libera texto arbitrário. */

const stored = { neighborhood: null as string | null };
const update = vi.fn();
const db = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: { ...stored }, error: null }) }),
    }),
    update: (patch: unknown) => {
      update(patch);
      return { eq: async () => ({ error: null }) };
    },
  }),
};
vi.mock("@/lib/auth/reader", () => ({
  getReader: vi.fn(async () => ({ db, user: { id: "u1", email: "ana@exemplo.com" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/account", () => ({ exportAccount: vi.fn() }));

import { updateProfileAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("updateProfileAction · bairro (C2-01)", () => {
  beforeEach(() => {
    update.mockReset();
    stored.neighborhood = null;
  });

  it("recusa bairro fora da lista mesmo com o campo-base igual", async () => {
    const evil = "X".repeat(5000);
    const r = await updateProfileAction(
      { status: "idle" },
      form({ name: "Ana", neighborhood: evil, current_neighborhood: evil }),
    );
    expect(r.status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("aceita bairro da lista e o bairro antigo já gravado no banco", async () => {
    expect(
      (
        await updateProfileAction(
          { status: "idle" },
          form({ name: "Ana", neighborhood: "Centro Sul" }),
        )
      ).status,
    ).toBe("saved");
    stored.neighborhood = "Bairro antigo";
    expect(
      (
        await updateProfileAction(
          { status: "idle" },
          form({ name: "Ana", neighborhood: "Bairro antigo" }),
        )
      ).status,
    ).toBe("saved");
  });
});
