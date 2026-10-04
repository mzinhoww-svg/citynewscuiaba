// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleAdClick, handleAdTrack, type AdApiDeps } from "./api";

const PLACEMENT = "11111111-1111-4111-8111-111111111111";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";

function deps(over: Partial<AdApiDeps> = {}): AdApiDeps {
  return {
    track: vi.fn(async () => true),
    lookupHref: vi.fn(async () => "https://padaria.example/promo"),
    salt: "sal",
    now: () => new Date("2026-10-04T15:00:00Z"),
    ...over,
  };
}
const post = (body: unknown, ua = UA) =>
  new Request("https://citynews.example/api/ads/view", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": ua,
      "x-forwarded-for": "200.1.2.3",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/ads/view (ADS-T1)", () => {
  it("conta impressão e visualização com a chave de deduplicação", async () => {
    const d = deps();
    const r = await handleAdTrack(
      post({ placement: PLACEMENT, section: "cidade", event: "view" }),
      d,
    );
    expect(r.status).toBe(204);
    expect(d.track).toHaveBeenCalledWith(
      PLACEMENT,
      "cidade",
      "view",
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  });

  it("recusa corpo inválido, evento de clique e robô sem gravar", async () => {
    const d = deps();
    expect((await handleAdTrack(post({ placement: "x", event: "view" }), d)).status).toBe(400);
    expect((await handleAdTrack(post({ placement: PLACEMENT, event: "click" }), d)).status).toBe(
      400,
    );
    expect(
      (await handleAdTrack(post({ placement: PLACEMENT, event: "view" }, "Googlebot/2.1"), d))
        .status,
    ).toBe(204);
    expect(d.track).not.toHaveBeenCalled();
  });

  it("sem sal (produção sem segredo) responde 503 e não grava", async () => {
    const d = deps({ salt: null });
    expect(
      (await handleAdTrack(post({ placement: PLACEMENT, event: "impression" }), d)).status,
    ).toBe(503);
    expect(d.track).not.toHaveBeenCalled();
  });
});

describe("GET /api/ads/click/[id] (ADS-T1)", () => {
  const get = (id: string, ua = UA) =>
    new Request(`https://citynews.example/api/ads/click/${id}?s=cidade`, {
      headers: { "user-agent": ua, "x-forwarded-for": "200.1.2.3" },
    });

  it("conta o clique e redireciona (302) para o anunciante", async () => {
    const d = deps();
    const r = await handleAdClick(get(PLACEMENT), PLACEMENT, d);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://padaria.example/promo");
    expect(d.track).toHaveBeenCalledWith(PLACEMENT, "cidade", "click", expect.any(String));
  });

  it("peça inexistente, id inválido ou link não https voltam para a home sem quebrar", async () => {
    for (const d of [
      deps({ lookupHref: vi.fn(async () => null) }),
      deps({ lookupHref: vi.fn(async () => "javascript:alert(1)") }),
      deps({
        lookupHref: vi.fn(async () => {
          throw new Error("banco fora");
        }),
      }),
    ]) {
      const r = await handleAdClick(get(PLACEMENT), PLACEMENT, d);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("https://citynews.example/");
    }
    const r = await handleAdClick(get("nao-e-uuid"), "nao-e-uuid", deps());
    expect(r.headers.get("location")).toBe("https://citynews.example/");
  });

  it("robô segue o link sem contar; falha na contagem não impede o redirecionamento", async () => {
    const bot = deps();
    expect(
      (await handleAdClick(get(PLACEMENT, "facebookexternalhit/1.1"), PLACEMENT, bot)).status,
    ).toBe(302);
    expect(bot.track).not.toHaveBeenCalled();
    const failing = deps({
      track: vi.fn(async () => {
        throw new Error("x");
      }),
    });
    const r = await handleAdClick(get(PLACEMENT), PLACEMENT, failing);
    expect(r.headers.get("location")).toBe("https://padaria.example/promo");
  });
});
