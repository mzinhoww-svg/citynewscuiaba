import { describe, expect, it } from "vitest";
import type { Role, RoleGrant } from "@/lib/auth/permissions";
import { ADMIN_AREAS, canAccessArea, canToggleFlags, canWriteSettings } from "./access";

const as = (...roles: Role[]): RoleGrant[] => roles.map((role) => ({ role, sections: [] }));

describe("canAccessArea", () => {
  it("admin entra em todas as telas", () => {
    for (const a of ADMIN_AREAS) expect(canAccessArea(as("admin"), a)).toBe(true);
  });
  it("sem papel, nenhuma", () => {
    for (const a of ADMIN_AREAS) expect(canAccessArea([], a)).toBe(false);
  });
  it("jornalista e revisor não entram em nada", () => {
    for (const a of ADMIN_AREAS) {
      expect(canAccessArea(as("jornalista"), a)).toBe(false);
      expect(canAccessArea(as("revisor"), a)).toBe(false);
    }
  });
  it("auditoria segue audit.view; publicidade só admin e editor-chefe", () => {
    expect(canAccessArea(as("leitura"), "auditoria")).toBe(true);
    expect(canAccessArea(as("editor"), "auditoria")).toBe(false);
    expect(canAccessArea(as("editor_chefe"), "publicidade")).toBe(true);
    expect(canAccessArea(as("operador_ia"), "publicidade")).toBe(false);
  });
  it("notificações: quem pede push urgente entra, inclusive o editor", () => {
    expect(canAccessArea(as("editor"), "notificacoes")).toBe(true);
    expect(canAccessArea(as("analista"), "notificacoes")).toBe(false);
  });
  it("integrações: operador de IA lê; editor-chefe não", () => {
    expect(canAccessArea(as("operador_ia"), "integracoes")).toBe(true);
    expect(canAccessArea(as("editor_chefe"), "integracoes")).toBe(false);
  });
  it("escrita: configurações para admin e editor-chefe; flags só admin", () => {
    expect(canWriteSettings(as("editor_chefe"))).toBe(true);
    expect(canWriteSettings(as("operador_ia"))).toBe(false);
    expect(canToggleFlags(as("editor_chefe"))).toBe(false);
    expect(canToggleFlags(as("admin"))).toBe(true);
  });
});
