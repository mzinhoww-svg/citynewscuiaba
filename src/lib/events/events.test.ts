import { describe, expect, it } from "vitest";
import type { Consent } from "@/lib/consent";
import { EVENT_NAMES } from "./names";
import { EventEnvelope, parseEvent } from "./schema";
import { buildEvent } from "./track";
import { isIsolatedInteraction, isQualifiedRead, isWeakSignal, promotesWeakSignal } from "./weak";

const ANON = "3f1c2b8e-5d6a-4c1e-9b7a-2d4e6f8a0b1c";
const ALL: Consent = { version: "v1", metrics: true, personalization: true, decided: true };
const METRICS: Consent = { version: "v1", metrics: true, personalization: false, decided: true };
const NONE: Consent = { version: "v1", metrics: false, personalization: false, decided: true };

const validEvent = {
  name: "article_read",
  anonId: null,
  userId: null,
  at: "2026-09-27T12:00:00.000Z",
  sourceId: null,
  contentId: "article:1",
  session: { id: "-", page: "/materia/x", referrer: null, device: "mobile" },
  consent: { version: "v1", metrics: true, personalization: false },
  algoVersion: "rec-v1",
  props: { seconds: 45, scrollPct: 60 },
};

describe("sinal fraco (spec §7.2)", () => {
  it.each([
    [9, 90, false, false, true],
    [40, 20, false, false, true],
    [40, 60, false, false, false],
    [40, 60, true, false, true],
  ])("isWeakSignal(%d s, %d%%, isolado=%s) = %s", (s, p, iso, _, exp) =>
    expect(isWeakSignal({ seconds: s, scrollPct: p, isolated: iso })).toBe(exp),
  );

  it("volta em menos de 5 s é fraco", () => {
    expect(isWeakSignal({ seconds: 40, scrollPct: 60, isolated: false, bouncedMs: 4999 })).toBe(
      true,
    );
    expect(isWeakSignal({ seconds: 40, scrollPct: 60, isolated: false, bouncedMs: 5000 })).toBe(
      false,
    );
  });

  it("leitura qualificada", () => {
    expect(isQualifiedRead(30, 50)).toBe(true);
    expect(isQualifiedRead(29, 90)).toBe(false);
    expect(isQualifiedRead(60, 5)).toBe(true);
    expect(isQualifiedRead(45, 49)).toBe(false);
  });

  it("interação única com a fonte em 14 dias é isolada", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(isIsolatedInteraction(["2026-09-27T11:00:00Z"], now)).toBe(true);
    expect(isIsolatedInteraction(["2026-09-27T11:00:00Z", "2026-09-01T11:00:00Z"], now)).toBe(true);
    expect(isIsolatedInteraction(["2026-09-27T11:00:00Z", "2026-09-20T11:00:00Z"], now)).toBe(
      false,
    );
  });

  it("sinal fraco só conta depois de 3 dias diferentes", () => {
    expect(promotesWeakSignal(["2026-09-25T10:00:00Z", "2026-09-25T20:00:00Z"])).toBe(false);
    expect(
      promotesWeakSignal(["2026-09-25T10:00:00Z", "2026-09-26T10:00:00Z", "2026-09-26T11:00:00Z"]),
    ).toBe(false);
    expect(
      promotesWeakSignal(["2026-09-25T10:00:00Z", "2026-09-26T10:00:00Z", "2026-09-27T10:00:00Z"]),
    ).toBe(true);
    // Dias no fuso de Cuiabá: 23h de 26/09 e 01h (UTC) de 27/09 são o mesmo dia local.
    expect(
      promotesWeakSignal(["2026-09-25T12:00:00Z", "2026-09-27T01:00:00Z", "2026-09-26T23:00:00Z"]),
    ).toBe(false);
  });
});

describe("envelope (tracking-plan §1)", () => {
  it("tem os 17 eventos do plano", () => expect(EVENT_NAMES).toHaveLength(17));

  it("aceita um evento válido", () =>
    expect(EventEnvelope.safeParse(validEvent).success).toBe(true));

  it("envelope rejeita anonId sem consentimento de personalização", () => {
    const r = EventEnvelope.safeParse({
      ...validEvent,
      anonId: crypto.randomUUID(),
      consent: { version: "v1", metrics: true, personalization: false },
    });
    expect(r.success).toBe(false);
  });

  it("aceita anonId com personalização", () =>
    expect(
      EventEnvelope.safeParse({
        ...validEvent,
        anonId: ANON,
        consent: { version: "v1", metrics: true, personalization: true },
      }).success,
    ).toBe(true));

  it("rejeita evento sem nenhum consentimento", () =>
    expect(
      EventEnvelope.safeParse({
        ...validEvent,
        consent: { version: "v1", metrics: false, personalization: false },
      }).success,
    ).toBe(false));

  it("rejeita outra versão da política, nome desconhecido e props faltando", () => {
    expect(
      EventEnvelope.safeParse({ ...validEvent, consent: { ...validEvent.consent, version: "v0" } })
        .success,
    ).toBe(false);
    expect(EventEnvelope.safeParse({ ...validEvent, name: "page_view" }).success).toBe(false);
    expect(EventEnvelope.safeParse({ ...validEvent, props: { seconds: 45 } }).success).toBe(false);
  });

  it("rejeita props fora do plano (nada de atributo sensível ou dado livre)", () => {
    for (const extra of [{ religiao: "x" }, { saude: true }, { renda: 3000 }, { email: "a@b.c" }])
      expect(
        EventEnvelope.safeParse({ ...validEvent, props: { ...validEvent.props, ...extra } })
          .success,
      ).toBe(false);
  });

  it("valores das props seguem o plano", () => {
    const search = {
      ...validEvent,
      name: "search_submitted",
      contentId: null,
      props: { mode: "traditional", resultCount: 3 },
    };
    expect(EventEnvelope.safeParse(search).success).toBe(true);
    expect(
      EventEnvelope.safeParse({ ...search, props: { mode: "x", resultCount: 3 } }).success,
    ).toBe(false);
    expect(
      EventEnvelope.safeParse({ ...search, props: { mode: "ai", resultCount: -1 } }).success,
    ).toBe(false);
  });

  it("texto da busca só com personalização", () => {
    const base = {
      ...validEvent,
      name: "search_submitted",
      contentId: null,
      props: { mode: "traditional", resultCount: 3, query: "ônibus cpa" },
    };
    expect(EventEnvelope.safeParse(base).success).toBe(false);
    expect(
      EventEnvelope.safeParse({
        ...base,
        anonId: ANON,
        consent: { version: "v1", metrics: true, personalization: true },
      }).success,
    ).toBe(true);
  });

  it("página sem query string e referência só com origem", () => {
    expect(
      EventEnvelope.safeParse({
        ...validEvent,
        session: { ...validEvent.session, page: "/busca?q=segredo" },
      }).success,
    ).toBe(false);
    expect(
      EventEnvelope.safeParse({
        ...validEvent,
        session: { ...validEvent.session, referrer: "https://busca.example/?q=segredo" },
      }).success,
    ).toBe(false);
  });

  it("parseEvent aceita texto JSON e recusa lixo", () => {
    expect(parseEvent(JSON.stringify(validEvent)).ok).toBe(true);
    expect(parseEvent("{").ok).toBe(false);
    expect(parseEvent(JSON.stringify({ ...validEvent, name: 1 })).ok).toBe(false);
  });
});

describe("buildEvent (regra de envio)", () => {
  const ctx = {
    page: "/materia/x?utm=1#topo",
    referrer: "https://busca.example/resultado?q=segredo",
    device: "mobile" as const,
    sessionId: "sessao-1",
    contentId: "article:1",
    now: new Date("2026-09-27T12:00:00Z"),
  };

  it("sem escolha ou só o necessário: nada é enviado", () => {
    expect(
      buildEvent(
        "article_read",
        { seconds: 45, scrollPct: 60 },
        { ...ctx, consent: NONE, anonId: null },
      ),
    ).toBeNull();
    expect(
      buildEvent(
        "article_read",
        { seconds: 45, scrollPct: 60 },
        { ...ctx, consent: { ...ALL, decided: false }, anonId: ANON },
      ),
    ).toBeNull();
  });

  it("só métricas: sem anonId, sem sessão, sem referência e sem texto de busca", () => {
    const e = buildEvent(
      "search_submitted",
      { mode: "traditional", resultCount: 2, query: "ônibus" },
      { ...ctx, consent: METRICS, anonId: ANON },
    )!;
    expect(e.anonId).toBeNull();
    expect(e.session).toEqual({ id: "-", page: "/materia/x", referrer: null, device: "mobile" });
    expect(e.props).toEqual({ mode: "traditional", resultCount: 2 });
    expect(e.consent).toEqual({ version: "v1", metrics: true, personalization: false });
    expect(EventEnvelope.safeParse(e).success).toBe(true);
  });

  it("personalização: completo, com anonId e origem da referência", () => {
    const e = buildEvent(
      "article_read",
      { seconds: 45, scrollPct: 60 },
      { ...ctx, consent: ALL, anonId: ANON },
    )!;
    expect(e.anonId).toBe(ANON);
    expect(e.session.id).toBe("sessao-1");
    expect(e.session.referrer).toBe("https://busca.example");
    expect(e.algoVersion).toBe("rec-v1");
    expect(EventEnvelope.safeParse(e).success).toBe(true);
  });
});
