import { describe, expect, it } from "vitest";
import { auditCsv, maskDetails, maskIpField, type AuditRow } from "./audit-csv";

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 1,
  at: "2026-09-29T10:00:00.000Z",
  actor: "c1000000-0000-4000-8000-000000000001",
  action: "article.publish",
  objectRef: "article:abc",
  details: { ip: "203.0.113.42", note: "ok" },
  ipHash: "203.0.113.42",
  ...over,
});

describe("máscara de IP na auditoria", () => {
  it("admin vê o endereço inteiro; os demais veem 203.0.x.x", () => {
    expect(maskIpField("203.0.113.42", true)).toBe("203.0.113.42");
    expect(maskIpField("203.0.113.42", false)).toBe("203.0.x.x");
    expect(maskIpField("2001:db8:1:2::9", false)).toBe("2001:db8:x:x");
  });
  it("hash de IP mostra só o começo para quem não é admin", () => {
    expect(maskIpField("a1b2c3d4e5f6a7b8c9d0", false)).toBe("a1b2c3d4…");
    expect(maskIpField(null, false)).toBe("");
  });
  it("detalhes com IP são mascarados só para não admin", () => {
    expect(maskDetails({ ip: "10.20.30.40" }, false)).toEqual({ ip: "10.20.x.x" });
    expect(maskDetails({ ip: "10.20.30.40" }, true)).toEqual({ ip: "10.20.30.40" });
  });
});

describe("auditCsv", () => {
  it("cabeçalho com BOM e linhas CRLF", () => {
    const csv = auditCsv([row()], true);
    expect(csv.startsWith('﻿"quando","ator","acao","objeto","ip","detalhes"\r\n')).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("admin: IP inteiro; não admin: nenhum IP inteiro no arquivo", () => {
    const adm = auditCsv([row()], true);
    expect(adm).toContain("203.0.113.42");
    const other = auditCsv([row()], false);
    expect(other).not.toContain("203.0.113.42");
    expect(other).toContain("203.0.x.x");
  });
  it("neutraliza fórmula de planilha", () => {
    const csv = auditCsv([row({ objectRef: "=HYPERLINK(1)" })], true);
    expect(csv).toContain('"\'=HYPERLINK(1)"');
  });
});
