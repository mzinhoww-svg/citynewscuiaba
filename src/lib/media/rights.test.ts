import { describe, expect, it } from "vitest";
import {
  disclaimerFor,
  rightsStatusOf,
  usageScopeFor,
  isReusable,
  WEB_REPRODUCTION,
} from "./rights";

const NOW = new Date("2026-10-04T12:00:00Z");
const base = {
  kind: "reproduction" as const,
  status: "approved",
  licenseUntil: null,
  removedAt: null,
};

describe("Media Registry: status de direitos (D-02)", () => {
  it("imagem da web sem autorização registrada fica com direitos desconhecidos, nunca autorizada", () => {
    expect(rightsStatusOf(base, NOW)).toBe("unknown");
  });

  it("imagem sem autor identificado continua registrável: o status não depende do autor", () => {
    expect(rightsStatusOf({ ...base }, NOW)).toBe("unknown");
  });

  it("licença conhecida e válida: licensed; foto própria ou com acordo: authorized", () => {
    expect(rightsStatusOf({ ...base, kind: "licensed", licenseUntil: "2027-01-01" }, NOW)).toBe(
      "licensed",
    );
    expect(rightsStatusOf({ ...base, kind: "original" }, NOW)).toBe("authorized");
  });

  it("autorização vencida: expired", () => {
    expect(rightsStatusOf({ ...base, kind: "licensed", licenseUntil: "2026-09-30" }, NOW)).toBe(
      "expired",
    );
  });

  it("bloqueada ou retirada: blocked, e nunca reutilizável", () => {
    expect(rightsStatusOf({ ...base, status: "blocked" }, NOW)).toBe("blocked");
    expect(rightsStatusOf({ ...base, removedAt: "2026-10-01T00:00:00Z" }, NOW)).toBe("blocked");
    expect(isReusable("blocked")).toBe(false);
    expect(isReusable("expired")).toBe(false);
    expect(isReusable("unknown")).toBe(true);
  });

  it("aviso padrão 'Foto: reprodução web' só na reprodução externa", () => {
    expect(WEB_REPRODUCTION).toBe("Foto: reprodução web");
    expect(disclaimerFor("reproduction")).toBe("Foto: reprodução web");
    expect(disclaimerFor("original")).toBeNull();
    expect(disclaimerFor("ai_generated")).toBeNull();
  });

  it("escopo de uso: reprodução só editorial; o que é nosso ou licenciado serve também para social", () => {
    expect(usageScopeFor("reproduction")).toEqual(["editorial"]);
    expect(usageScopeFor("original")).toEqual(["editorial", "social", "thumbnail"]);
  });
});
