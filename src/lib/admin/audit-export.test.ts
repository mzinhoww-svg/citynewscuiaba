import { describe, expect, it } from "vitest";
import {
  auditCsv,
  auditFiltersQuery,
  collectAuditRows,
  parseAuditFilters,
  type AuditRow,
} from "./audit-export";

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
    expect(csv.split("\r\n")[0]).toBe("id,quando,ator,acao,objeto,detalhes,ip_hash");
  });

  it("admin vê o IP inteiro e o hash", () => {
    const csv = auditCsv([row], { maskIp: false });
    expect(csv).toContain("200.1.2.3");
    expect(csv).toContain("abcdef0123456789");
  });

  it("sem dado pessoal: sem nome, sem e-mail e sem notas livres, para qualquer papel (gate P5, achado 9)", () => {
    const personal: AuditRow = {
      ...row,
      action: "user.invite",
      details: {
        email: "ana@exemplo.com",
        role: "editor",
        patch: { notes: "titular pediu por telefone: 65 99999-0000", status: "done" },
        texto: "contato ana.souza@exemplo.com.br para confirmar",
      },
    };
    for (const maskIp of [true, false]) {
      const csv = auditCsv([personal], { maskIp });
      expect(csv).not.toContain("@");
      expect(csv).not.toContain("Helena");
      expect(csv).not.toContain("99999");
      expect(csv).toContain("editor");
      expect(csv).toContain("done");
    }
  });

  it("ator vira pseudônimo estável para quem não é admin; admin vê o id", () => {
    const masked = auditCsv([row, { ...row, id: 8 }], { maskIp: true });
    const lines = masked.split("\r\n").slice(1, 3);
    const actors = lines.map((l) => l.split(",")[2]);
    expect(actors[0]).toMatch(/^pessoa-[0-9a-f]{8}$/);
    expect(actors[1]).toBe(actors[0]);
    expect(masked).not.toContain(row.actor);
    expect(auditCsv([row], { maskIp: false })).toContain(row.actor);
    // ator de sistema não é pessoa
    expect(auditCsv([{ ...row, actor: "system" }], { maskIp: true })).toContain(",system,");
  });

  it("exportação truncada leva o aviso dentro do arquivo", () => {
    const csv = auditCsv([row], { maskIp: false, truncatedAt: 5000 });
    const last = csv.trimEnd().split("\r\n").at(-1)!;
    expect(last).toContain("AVISO");
    expect(last).toContain("5000");
    expect(auditCsv([row], { maskIp: false })).not.toContain("AVISO");
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

describe("leitura paginada da exportação (gate P5, achado 11)", () => {
  /** Servidor com `max_rows` de 1000: devolve no máximo isso, por `id` decrescente. */
  function server(total: number, maxRows = 1000) {
    const all = Array.from({ length: total }, (_, i) => ({ ...row, id: total - i }));
    const calls: number[] = [];
    const fetchPage = async (o: { limit: number; before?: number }) => {
      calls.push(o.limit);
      return all
        .filter((r) => o.before === undefined || r.id < o.before)
        .slice(0, Math.min(o.limit, maxRows));
    };
    return { fetchPage, calls };
  }

  it("junta as páginas além do max_rows sem repetir nem perder linha", async () => {
    const s = server(2300);
    const r = await collectAuditRows(s.fetchPage, 5000);
    expect(r.rows).toHaveLength(2300);
    expect(new Set(r.rows.map((x) => x.id)).size).toBe(2300);
    expect(r.truncated).toBe(false);
  });

  it("para no limite e avisa que truncou", async () => {
    const s = server(7000);
    const r = await collectAuditRows(s.fetchPage, 5000);
    expect(r.rows).toHaveLength(5000);
    expect(r.rows[0]!.id).toBe(7000);
    expect(r.truncated).toBe(true);
  });

  it("exatamente no limite não é truncamento", async () => {
    const r = await collectAuditRows(server(5000).fetchPage, 5000);
    expect(r.rows).toHaveLength(5000);
    expect(r.truncated).toBe(false);
  });

  it("servidor que devolve menos que o pedido (max_rows menor) continua até acabar", async () => {
    const r = await collectAuditRows(server(1500, 500).fetchPage, 5000);
    expect(r.rows).toHaveLength(1500);
    expect(r.truncated).toBe(false);
  });
});
