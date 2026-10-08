// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  googleAttribution,
  googleGuidePhoto,
  googlePhotoDailyLimit,
  googlePhotoSrc,
  serveGooglePhoto,
  type GooglePhotoDeps,
} from "./google-photo";

/** Valor fictício só para os testes; a chave real existe apenas no ambiente do servidor. */
const FAKE_KEY = "TESTE-chave-ficticia-foto";
const NAME = "places/ChIJ-teste-pao-dourado/photos/AUc7tXX-teste_ref123";
const PHOTO_URI = "https://lh3.googleusercontent.com/p/teste-foto=w800";

const jpeg = (bytes = 32, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes).fill(7), {
    status: 200,
    headers: { "content-type": "image/jpeg", ...headers },
  });

const meta = (photoUri: unknown = PHOTO_URI, status = 200) =>
  new Response(JSON.stringify({ name: `${NAME}/media`, photoUri }), {
    status,
    headers: { "content-type": "application/json" },
  });

function deps(over: Partial<GooglePhotoDeps> = {}): GooglePhotoDeps & {
  fetch: ReturnType<typeof vi.fn<GooglePhotoDeps["fetch"]>>;
  log: ReturnType<typeof vi.fn<(m: string) => void>>;
} {
  const fetch = vi.fn<GooglePhotoDeps["fetch"]>(async (url) =>
    String(url).startsWith("https://places.googleapis.com") ? meta() : jpeg(),
  );
  const log = vi.fn<(m: string) => void>();
  return {
    photoName: async () => NAME,
    allow: async () => true,
    apiKey: FAKE_KEY,
    fetch,
    log,
    ...over,
  } as GooglePhotoDeps & { fetch: typeof fetch; log: typeof log };
}

async function noLeak(res: Response, d: { log: { mock: { calls: unknown[][] } } }) {
  const body = await res.clone().text();
  const all = [body, JSON.stringify([...res.headers]), JSON.stringify(d.log.mock.calls)].join("\n");
  expect(all).not.toContain(FAKE_KEY);
  expect(all).not.toContain("places.googleapis.com");
  expect(all).not.toContain("googleusercontent");
}

describe("serveGooglePhoto", () => {
  it("busca a foto com a chave no cabeçalho e repassa os bytes com cache público", async () => {
    const d = deps();
    const res = await serveGooglePhoto("padaria-pao-dourado-goiabeiras", d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400",
    );
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await noLeak(res, d);
    expect((await res.arrayBuffer()).byteLength).toBe(32);

    const [url, init] = d.fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://places.googleapis.com/v1/${NAME}/media?maxWidthPx=800&skipHttpRedirect=true`,
    );
    expect(String(url)).not.toContain(FAKE_KEY);
    expect(new Headers(init?.headers).get("X-Goog-Api-Key")).toBe(FAKE_KEY);
    // A imagem vem do endereço devolvido pelo Google, sem a chave.
    const [imgUrl, imgInit] = d.fetch.mock.calls[1]!;
    expect(String(imgUrl)).toBe(PHOTO_URI);
    expect(new Headers(imgInit?.headers).get("X-Goog-Api-Key")).toBeNull();
    expect(imgInit?.redirect).toBe("follow");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  async function expect404(res: Response, d: Parameters<typeof noLeak>[1]) {
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await noLeak(res, d);
  }

  it("slug inválido: 404 sem consultar banco nem Google", async () => {
    const photoName = vi.fn(async () => NAME);
    const d = deps({ photoName });
    for (const slug of ["", "../x", "A-B", "a--b", "a".repeat(201), "a b"])
      await expect404(await serveGooglePhoto(slug, d), d);
    expect(photoName).not.toHaveBeenCalled();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("lugar sem foto do Google (ou fora do ar): 404 sem chamar o Google nem gastar a cota", async () => {
    const allow = vi.fn(async () => true);
    const d = deps({ photoName: async () => null, allow });
    await expect404(await serveGooglePhoto("lugar-sem-foto", d), d);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
  });

  it("referência gravada fora do formato: 404 sem chamar o Google", async () => {
    const d = deps({ photoName: async () => "places/x/photos/../../v1/segredo" });
    await expect404(await serveGooglePhoto("lugar", d), d);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("sem chave ou acima do limite diário: 404 sem chamar o Google", async () => {
    const semChave = deps({ apiKey: undefined });
    await expect404(await serveGooglePhoto("lugar", semChave), semChave);
    expect(semChave.fetch).not.toHaveBeenCalled();
    const limite = deps({ allow: async () => false });
    await expect404(await serveGooglePhoto("lugar", limite), limite);
    expect(limite.fetch).not.toHaveBeenCalled();
  });

  it("erro do Google, rede ou resposta sem endereço https: 404", async () => {
    const http = deps({ fetch: vi.fn(async () => meta(PHOTO_URI, 403)) });
    await expect404(await serveGooglePhoto("lugar", http), http);
    const rede = deps({
      fetch: vi.fn(async () => {
        throw new Error(`falhou com X-Goog-Api-Key: ${FAKE_KEY} em places.googleapis.com`);
      }),
    });
    await expect404(await serveGooglePhoto("lugar", rede), rede);
    for (const uri of [
      "http://lh3.googleusercontent.com/p/x",
      "https://evil.example/p/x",
      "https://googleusercontent.com.evil.example/p/x",
      "https://user:pw@lh3.googleusercontent.com/p/x",
      "https://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
      42,
      null,
    ]) {
      const d = deps({ fetch: vi.fn(async () => meta(uri)) });
      await expect404(await serveGooglePhoto("lugar", d), d);
      expect(d.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("aceita só imagem raster (jpeg, png, webp, gif, avif): svg e html viram 404", async () => {
    for (const type of ["image/svg+xml", "text/html", "application/octet-stream", ""]) {
      const d = deps({
        fetch: vi.fn(async (url) =>
          String(url).startsWith("https://places") ? meta() : jpeg(8, { "content-type": type }),
        ),
      });
      await expect404(await serveGooglePhoto("lugar", d), d);
    }
    const webp = deps({
      fetch: vi.fn(async (url) =>
        String(url).startsWith("https://places")
          ? meta()
          : jpeg(8, { "content-type": "image/webp; charset=binary" }),
      ),
    });
    const ok = await serveGooglePhoto("lugar", webp);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
  });

  it("imagem acima de 5 MB (declarada ou lida): 404", async () => {
    const declarada = deps({
      fetch: vi.fn(async (url) =>
        String(url).startsWith("https://places")
          ? meta()
          : jpeg(8, { "content-length": String(6 * 1024 * 1024) }),
      ),
    });
    await expect404(await serveGooglePhoto("lugar", declarada), declarada);
    const lida = deps({
      fetch: vi.fn(async (url) =>
        String(url).startsWith("https://places") ? meta() : jpeg(5 * 1024 * 1024 + 1),
      ),
    });
    await expect404(await serveGooglePhoto("lugar", lida), lida);
  });

  it("o limite diário é contado só quando o Google vai ser chamado", async () => {
    const allow = vi.fn(async () => true);
    const d = deps({ allow });
    await serveGooglePhoto("lugar", d);
    expect(allow).toHaveBeenCalledTimes(1);
  });
});

describe("googlePhotoDailyLimit", () => {
  it("lê GUIDE_GOOGLE_PHOTO_DAILY (inteiro ≥ 0) ou usa 200", () => {
    expect(googlePhotoDailyLimit({})).toBe(200);
    expect(googlePhotoDailyLimit({ GUIDE_GOOGLE_PHOTO_DAILY: "50" })).toBe(50);
    expect(googlePhotoDailyLimit({ GUIDE_GOOGLE_PHOTO_DAILY: "0" })).toBe(0);
    expect(googlePhotoDailyLimit({ GUIDE_GOOGLE_PHOTO_DAILY: "abc" })).toBe(200);
    expect(googlePhotoDailyLimit({ GUIDE_GOOGLE_PHOTO_DAILY: "-3" })).toBe(200);
    expect(googlePhotoDailyLimit({ GUIDE_GOOGLE_PHOTO_DAILY: " " })).toBe(200);
  });
});

describe("googleGuidePhoto", () => {
  const base = {
    slug: "padaria-pao-dourado-goiabeiras",
    googlePhotoName: NAME,
    googlePhotoAuthor: "Maria Fictícia",
    googlePhotoAuthorUri: "https://maps.google.com/maps/contrib/123",
    googleMapsUrl: "https://maps.google.com/?cid=123",
  };

  it("aponta para a rota própria, com o autor no crédito e o link do autor", () => {
    expect(googlePhotoSrc(base.slug)).toBe("/api/guia/foto/padaria-pao-dourado-goiabeiras");
    expect(googleGuidePhoto(base)).toEqual({
      src: "/api/guia/foto/padaria-pao-dourado-goiabeiras",
      credit: "Foto: Maria Fictícia · Google",
      originUrl: "https://maps.google.com/maps/contrib/123",
      fromGoogle: true,
    });
  });

  it("sem autor: 'Foto: Google' e o link do lugar no Google Maps", () => {
    expect(
      googleGuidePhoto({ ...base, googlePhotoAuthor: null, googlePhotoAuthorUri: null }),
    ).toMatchObject({ credit: "Foto: Google", originUrl: "https://maps.google.com/?cid=123" });
  });

  it("sem link nenhum: link do lugar no Google Maps pelo Place ID", () => {
    expect(
      googleGuidePhoto({ ...base, googlePhotoAuthorUri: "http://inseguro", googleMapsUrl: null })
        ?.originUrl,
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=ChIJ-teste-pao-dourado",
    );
  });

  it("sem referência ou referência inválida: nenhuma foto", () => {
    expect(googleGuidePhoto({ ...base, googlePhotoName: null })).toBeNull();
    expect(googleGuidePhoto({ ...base, googlePhotoName: "places/x/photos/../y" })).toBeNull();
  });
});

describe("googleAttribution", () => {
  it("cobre avaliações, fotos ou as duas", () => {
    expect(googleAttribution({ ratings: true, photos: false })).toBe("Avaliações: Google.");
    expect(googleAttribution({ ratings: true, photos: true })).toBe("Avaliações e fotos: Google.");
    expect(googleAttribution({ ratings: false, photos: true })).toBe("Fotos: Google.");
    expect(googleAttribution({ ratings: false, photos: false })).toBeNull();
  });
});
