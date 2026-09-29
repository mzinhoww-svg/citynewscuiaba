import { describe, expect, it } from "vitest";
import { auditCsv, auditFiltersQuery, parseAuditFilters, type AuditRow } from "./audit-export";

const row: AuditRow = {
  id: 7,
  at: "2026-09-29T12:00:00Z",
  actor: "c1000000-0000-4000-8000-000000000001",
  actorName: "Helena Costa",
  action: "flag.set",
  objectRef: "contingency:read_only_on",
  details: { ip: "200.1.2.3", nested: { via: "10.0.0.7, 200.1.2.3" } },
  ipHash: "abcdef0123456789",
};

describe("exportação da auditoria (A10)", () => {
  it("mascara IP (a.b.x.x) e esconde o hash para quem não é admin", () => {
    const csv = auditCsv([row], { maskIp: true });
    expect(csv).toContain("200.1.x.x");
    expect(csv).not.toContain("200.1.2.3");
    expect(csv).not.toContain("abcdef0123456789");
    expect(csv.split("\r\n")[0]).toBe("id,quando,ator,nome,acao,objeto,detalhes,ip_hash");
  });

  it("admin vê o IP inteiro e o hash", () => {
    const csv = auditCsv([row], { maskIp: false });
    expect(csv).toContain("200.1.2.3");
    expect(csv).toContain("abcdef0123456789");
  });

  it("filtros da URL: datas só no formato AAAA-MM-DD, texto limitado", () => {
    const f = parseAuditFilters({
      ator: " helena ",
      acao: "flag.set",
      de: "2026-09-01",
      ate: "hoje",
      objeto: ["x"],
    });
    expect(f).toEqual({ actor: "helena", action: "flag.set", object: "x", from: "2026-09-01" });
    expect(auditFiltersQuery(f)).toBe("?ator=helena&acao=flag.set&objeto=x&de=2026-09-01");
    expect(auditFiltersQuery({})).toBe("");
  });
});
