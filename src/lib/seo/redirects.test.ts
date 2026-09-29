import { describe, expect, it } from "vitest";
import { resolveRedirect, validateRedirect } from "./redirects";

describe("redirecionamentos (A08)", () => {
  it("aceita só caminhos internos, sem igualdade nem laço", () => {
    expect(validateRedirect({ fromPath: "/materia/antiga/", toPath: "/materia/nova" })).toEqual({
      ok: true,
      value: { fromPath: "/materia/antiga", toPath: "/materia/nova" },
    });
    expect(validateRedirect({ fromPath: "https://x.example/a", toPath: "/b" })).toMatchObject({
      ok: false,
      error: "invalid_from",
    });
    expect(validateRedirect({ fromPath: "/a", toPath: "//evil.example" })).toMatchObject({
      ok: false,
      error: "invalid_to",
    });
    expect(validateRedirect({ fromPath: "/a", toPath: "/a" })).toMatchObject({
      ok: false,
      error: "same",
    });
    expect(
      validateRedirect({ fromPath: "/a", toPath: "/b" }, [
        { fromPath: "/b", toPath: "/a", kind: 301 },
      ]),
    ).toMatchObject({ ok: false, error: "loop" });
  });

  it("resolve com barra final ignorada", () => {
    const list = [{ fromPath: "/materia/antiga", toPath: "/materia/nova", kind: 301 as const }];
    expect(resolveRedirect("/materia/antiga/", list)?.toPath).toBe("/materia/nova");
    expect(resolveRedirect("/materia/outra", list)).toBeNull();
  });
});
