import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATION_CHOICE,
  migrationCounts,
  migrationPayload,
  migrationSummary,
  planMigration,
} from "./migrate";
import type { AnonProfile } from "./types";

const AT = "2026-09-27T12:00:00Z";

function localWith(
  sources: string[],
  saved: string[],
  extra: Partial<AnonProfile> = {},
): AnonProfile {
  return {
    anonId: null,
    createdAt: AT,
    follows: sources.map((id) => ({ kind: "source" as const, id, at: AT })),
    saved: saved.map((ref) => ({ ref, at: AT, progress: 40, title: `Título ${ref}` })),
    history: [],
    searches: [],
    interests: [],
    hidden: [],
    collections: [],
    alerts: [],
    ...extra,
  };
}

const ALL = { follows: true, saved: true, interests: true, history: false, conversations: false };

describe("migração do perfil local para a conta (C06)", () => {
  it("não duplica e resume em pt-BR", () => {
    const p = planMigration(
      localWith(["fc", "db"], ["a1", "a2", "a3"]),
      { follows: ["fc"], saved: [] },
      ALL,
    );
    expect(p.follows).toEqual(["db"]);
    expect(p.summary).toBe("2 fontes e 3 salvos sincronizados");
  });

  it("conta já tem 1 das 2 fontes: informa 2 fontes sincronizadas (Review Focus 4)", () => {
    const p = planMigration(localWith(["fc", "db"], []), { follows: ["db"], saved: [] }, ALL);
    expect(p.follows).toEqual(["fc"]);
    expect(p.summary).toBe("2 fontes sincronizadas");
  });

  it("singular e plural", () => {
    expect(migrationSummary(1, 0)).toBe("1 fonte sincronizada");
    expect(migrationSummary(0, 1)).toBe("1 salvo sincronizado");
    expect(migrationSummary(1, 1)).toBe("1 fonte e 1 salvo sincronizados");
    expect(migrationSummary(3, 14)).toBe("3 fontes e 14 salvos sincronizados");
    expect(migrationSummary(0, 0)).toBe("Preferências sincronizadas");
  });

  it("respeita o que foi desmarcado", () => {
    const local = localWith(["fc"], ["a1"], {
      anonId: "8c1f7a52-6f7e-4d3b-9a51-1d1b9d9c2a10",
      interests: [{ key: "Mobilidade", evidence: "3 leituras", weak: false }],
      history: [{ ref: "article:1", at: AT, seconds: 40, scrollPct: 80 }],
    });
    const p = planMigration(
      local,
      { follows: [], saved: [] },
      { follows: false, saved: true, interests: false, history: true, conversations: false },
    );
    expect(p.follows).toEqual([]);
    expect(p.saved).toEqual([{ ref: "a1", progress: 40 }]);
    expect(p.interests).toEqual([]);
    expect(p.history).toBe(1);
    expect(p.summary).toBe("1 salvo sincronizado");
  });

  it("leva temas, alertas, coleções e ocultações sem repetir o que a conta já tem", () => {
    const local = localWith([], [], {
      follows: [
        { kind: "topic", id: "plano-de-onibus", at: AT },
        { kind: "section", id: "cidade", at: AT },
      ],
      hidden: [{ sourceSlug: "brasil-hoje", reason: "not_interested", at: AT }],
      collections: [{ id: "c1", name: "Fim de semana", at: AT, items: ["article:1"] }],
      alerts: [
        {
          id: "x1",
          kind: "bairro",
          target: "cpa",
          label: "CPA",
          frequency: "daily",
          channel: "browser",
          status: "active",
          at: AT,
        },
        {
          id: "x2",
          kind: "urgentes",
          target: "todos",
          label: "Urgentes",
          frequency: "immediate",
          channel: "browser",
          status: "active",
          at: AT,
        },
      ],
    });
    const p = planMigration(
      local,
      {
        follows: [],
        saved: [],
        otherFollows: [{ kind: "topic", id: "plano-de-onibus" }],
        alerts: [{ kind: "urgentes", target: "todos", channel: "browser" }],
        collections: ["Fim de semana"],
      },
      ALL,
    );
    expect(p.otherFollows).toEqual([{ kind: "section", id: "cidade" }]);
    expect(p.alerts.map((a) => a.target)).toEqual(["cpa"]);
    expect(p.collections).toEqual([]);
    expect(p.hidden).toEqual([{ sourceSlug: "brasil-hoje", reason: "not_interested" }]);
  });

  it("padrão: fontes, salvos e interesses marcados; histórico e conversas não", () => {
    expect(DEFAULT_MIGRATION_CHOICE).toEqual({
      follows: true,
      saved: true,
      interests: true,
      history: false,
      conversations: false,
    });
  });

  it("contagens para os checkboxes", () => {
    const c = migrationCounts(
      localWith(["fc", "db"], ["a1"], {
        follows: [
          { kind: "source", id: "fc", at: AT },
          { kind: "topic", id: "t", at: AT },
        ],
        interests: [{ key: "Mobilidade", evidence: "e", weak: false }],
      }),
    );
    expect(c).toEqual({ follows: 2, saved: 1, interests: 1, history: 0, conversations: 0 });
  });
});

describe("payload mínimo da migração (gate P2, I3)", () => {
  const ANON = "0b8c6a1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d";
  const full = localWith(["fc"], ["a1"], {
    anonId: ANON,
    history: [{ ref: "a9", at: AT, seconds: 30, scrollPct: 50, section: "Cidade" }],
    searches: ["remédio para diabetes", "endereço da minha ex"],
    interests: [{ key: "Cidade", evidence: "3 leituras", weak: false }],
    hidden: [{ sourceSlug: "db", reason: "not_interested", at: AT }],
    collections: [{ id: "c1", name: "Pra ler", at: AT, items: ["a1"] }],
    alerts: [
      {
        id: "al1",
        kind: "urgentes",
        target: "urgentes",
        label: "Urgentes",
        frequency: "immediate",
        channel: "email",
        status: "active",
        email: "pessoa@exemplo.com",
        at: AT,
      },
    ],
  });
  const none = {
    follows: false,
    saved: false,
    interests: false,
    history: false,
    conversations: false,
  };

  it("nada marcado: nada pessoal sai do navegador", () => {
    const body = JSON.stringify(migrationPayload(full, none));
    for (const leak of [
      ANON,
      "a9",
      "remédio",
      "minha ex",
      "Cidade",
      "pessoa@",
      "fc",
      "a1",
      "Pra ler",
      "db",
    ])
      expect(body).not.toContain(leak);
  });

  it("buscas e e-mail dos alertas nunca vão, nem com tudo marcado", () => {
    const all = { follows: true, saved: true, interests: true, history: true, conversations: true };
    const body = JSON.stringify(migrationPayload(full, all));
    expect(body).not.toContain("remédio");
    expect(body).not.toContain("pessoa@exemplo.com");
    expect(body).toContain("al1");
  });

  it("id anônimo e histórico só com Histórico marcado", () => {
    const off = migrationPayload(full, { ...DEFAULT_MIGRATION_CHOICE, history: false });
    expect(off.anonId).toBeNull();
    expect(off.history).toEqual([]);
    const on = migrationPayload(full, { ...DEFAULT_MIGRATION_CHOICE, history: true });
    expect(on.anonId).toBe(ANON);
    expect(on.history).toHaveLength(1);
  });

  it("cada caixa leva só o seu grupo", () => {
    const f = migrationPayload(full, { ...none, follows: true });
    expect(f.follows).toHaveLength(1);
    expect(f.alerts).toHaveLength(1);
    expect(f.saved).toEqual([]);
    expect(f.collections).toEqual([]);
    expect(f.interests).toEqual([]);
    expect(f.hidden).toEqual([]);
    const s = migrationPayload(full, { ...none, saved: true });
    expect(s.saved).toHaveLength(1);
    expect(s.collections).toHaveLength(1);
    expect(s.follows).toEqual([]);
    expect(s.alerts).toEqual([]);
    const i = migrationPayload(full, { ...none, interests: true });
    expect(i.interests).toHaveLength(1);
    expect(i.hidden).toHaveLength(1);
  });

  it("o plano feito do payload é o mesmo que o do perfil inteiro (sem o e-mail do alerta)", () => {
    const remote = { follows: [], saved: [] };
    for (const c of [DEFAULT_MIGRATION_CHOICE, { ...DEFAULT_MIGRATION_CHOICE, history: true }]) {
      const whole = planMigration(full, remote, c);
      expect(planMigration(migrationPayload(full, c), remote, c)).toEqual({
        ...whole,
        alerts: whole.alerts.map((a) => ({ ...a, email: undefined })),
      });
    }
  });
});
