import { describe, expect, it, vi } from "vitest";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { createGoogleProvider, googleSearchText, toGoogleVenue } from "./google";

/** Valor fictício só para os testes; a chave real existe apenas no ambiente do servidor. */
const FAKE_KEY = "TESTE-chave-ficticia";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const cuiaba = [
  { longText: "Goiabeiras", types: ["sublocality_level_1", "sublocality"] },
  { longText: "Cuiabá", types: ["administrative_area_level_2", "political"] },
];

const PLACE = {
  id: "ChIJ-teste-pao-dourado",
  displayName: { text: "Padaria Pão Dourado" },
  formattedAddress: "Rua das Acácias, 120 - Goiabeiras, Cuiabá - MT",
  location: { latitude: -15.6012, longitude: -56.0971 },
  rating: 4.6,
  userRatingCount: 1234,
  nationalPhoneNumber: "(65) 3000-1111",
  websiteUri: "https://paodourado.example",
  regularOpeningHours: { weekdayDescriptions: ["segunda: 06:00–20:00", "terça: 06:00–20:00"] },
  priceLevel: "PRICE_LEVEL_MODERATE",
  googleMapsUri: "https://maps.google.com/?cid=123",
  addressComponents: cuiaba,
};

const VG = {
  ...PLACE,
  id: "ChIJ-teste-vg",
  displayName: { text: "Padaria de Várzea Grande" },
  addressComponents: [{ longText: "Várzea Grande", types: ["administrative_area_level_2"] }],
};

describe("google provider", () => {
  it("sem chave não chama e devolve no_key", async () => {
    const http = vi.fn<HttpFetch>();
    const p = createGoogleProvider({ apiKey: "  ", http });
    expect(p.enabled).toBe(false);
    expect(await p.search({ category: "padaria", area: "Cuiabá" })).toEqual({
      ok: false,
      error: "no_key",
    });
    expect(http).not.toHaveBeenCalled();
  });

  it("busca com a chave no cabeçalho, máscara de campos e viés de Cuiabá; a chave fica fora da URL", async () => {
    const http = vi.fn<HttpFetch>(async () => json({ places: [PLACE] }));
    const p = createGoogleProvider({ apiKey: FAKE_KEY, http });
    await p.search({ category: "padaria", area: "Cuiabá" });
    const [url, init] = http.mock.calls[0]!;
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(String(url)).not.toContain(FAKE_KEY);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Goog-Api-Key")).toBe(FAKE_KEY);
    const mask = headers.get("X-Goog-FieldMask") ?? "";
    expect(mask).toContain("places.rating");
    expect(mask).toContain("nextPageToken");
    expect(mask).not.toMatch(/reviews|photos/);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.textQuery).toBe("padaria em Cuiabá");
    expect(JSON.stringify(body.locationBias)).toContain("25000");
  });

  it("converte a resposta e descarta outra cidade", async () => {
    const p = createGoogleProvider({
      apiKey: FAKE_KEY,
      http: async () => json({ places: [PLACE, VG] }),
    });
    const r = await p.search({ category: "padaria", area: "Cuiabá" });
    expect(r.ok && r.value).toHaveLength(1);
    const v = r.ok ? r.value[0]! : null;
    expect(v).toMatchObject({
      name: "Padaria Pão Dourado",
      category: "padaria",
      neighborhood: "Goiabeiras",
      rating: 4.6,
      ratingCount: 1234,
      ratingSource: "google",
      priceLevel: 2,
      phone: "(65) 3000-1111",
      website: "https://paodourado.example",
      hours: "segunda: 06:00–20:00; terça: 06:00–20:00",
      googleMapsUrl: "https://maps.google.com/?cid=123",
      placeIds: { google: "ChIJ-teste-pao-dourado" },
      sources: ["google"],
    });
  });

  it("campos ausentes viram null", () => {
    const v = toGoogleVenue(
      {
        id: "ChIJ-teste-min",
        displayName: { text: "Bar Mínimo" },
        addressComponents: cuiaba,
        priceLevel: "PRICE_LEVEL_UNSPECIFIED",
      },
      "bar",
      null,
    );
    expect(v).toMatchObject({
      phone: null,
      rating: null,
      ratingCount: null,
      ratingSource: null,
      priceLevel: null,
      hours: null,
      googleMapsUrl: null,
      lat: null,
    });
  });

  it("pagina até 3 páginas e para quando a cota acaba", async () => {
    const page = () => json({ places: [PLACE], nextPageToken: "tok" });
    const http = vi.fn<HttpFetch>(async () => page());
    await createGoogleProvider({ apiKey: FAKE_KEY, http }).search({
      category: "padaria",
      area: "Cuiabá",
    });
    expect(http).toHaveBeenCalledTimes(3);
    const second = JSON.parse(String(http.mock.calls[1]![1]?.body)) as { pageToken?: string };
    expect(second.pageToken).toBe("tok");

    const http2 = vi.fn<HttpFetch>(async () => page());
    let left = 1;
    await createGoogleProvider({
      apiKey: FAKE_KEY,
      http: http2,
      callsLeft: () => left,
      onCall: () => (left -= 1),
    }).search({
      category: "padaria",
      area: "Cuiabá",
    });
    expect(http2).toHaveBeenCalledTimes(1);
  });

  it("erros viram códigos fixos e a chave não vaza; a recusa vai para onError sem a chave", async () => {
    const statuses: [number, string][] = [
      [401, "unauthorized"],
      [403, "unauthorized"],
      [429, "rate_limited"],
      [400, "invalid"],
      [500, "http"],
    ];
    for (const [status, code] of statuses) {
      const onError = vi.fn();
      const p = createGoogleProvider({
        apiKey: FAKE_KEY,
        http: async () => json({ error: { message: `chave ${FAKE_KEY} recusada` } }, status),
        onError,
      });
      const r = await p.search({ category: "padaria", area: "Cuiabá" });
      expect(r).toEqual({ ok: false, error: code });
      if (status === 401 || status === 403) {
        const d = onError.mock.calls[0]?.[0] as { message: string };
        expect(d.message).toContain("recusada");
        expect(d.message).not.toContain(FAKE_KEY);
      }
    }
    const down = createGoogleProvider({
      apiKey: FAKE_KEY,
      http: async () => {
        throw new Error(`falhou ${FAKE_KEY}`);
      },
    });
    const r = await down.search({ category: "padaria", area: "Cuiabá" });
    expect(r).toEqual({ ok: false, error: "network" });
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it("chave inválida (400 API_KEY_INVALID) vira unauthorized e vai para onError", async () => {
    const onError = vi.fn();
    const p = createGoogleProvider({
      apiKey: FAKE_KEY,
      http: async () =>
        json(
          {
            error: {
              code: 400,
              message: "API key not valid. Please pass a valid API key.",
              status: "INVALID_ARGUMENT",
              details: [{ reason: "API_KEY_INVALID" }],
            },
          },
          400,
        ),
      onError,
    });
    expect(await p.search({ category: "padaria", area: "Cuiabá" })).toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect((onError.mock.calls[0]?.[0] as { status: number }).status).toBe(400);
  });

  it("details busca pelo id com a mesma máscara e rejeita id inválido sem chamar", async () => {
    const http = vi.fn<HttpFetch>(async () => json(PLACE));
    const p = createGoogleProvider({ apiKey: FAKE_KEY, http });
    expect(await p.details("../../x")).toEqual({ ok: false, error: "invalid" });
    expect(http).not.toHaveBeenCalled();
    const r = await p.details("ChIJ-teste-pao-dourado");
    expect(r.ok && r.value?.rating).toBe(4.6);
    const [url, init] = http.mock.calls[0]!;
    expect(String(url)).toBe("https://places.googleapis.com/v1/places/ChIJ-teste-pao-dourado");
    expect(new Headers(init?.headers).get("X-Goog-FieldMask")).toContain("rating");
  });

  it("monta o termo de busca por categoria e cozinha", () => {
    expect(googleSearchText("padaria", null)).toBe("padaria em Cuiabá");
    expect(googleSearchText("restaurante", "japonesa")).toBe("restaurante japonês sushi em Cuiabá");
  });
});
