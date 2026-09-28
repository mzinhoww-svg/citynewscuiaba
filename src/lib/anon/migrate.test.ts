import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATION_CHOICE,
  migrationCounts,
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
