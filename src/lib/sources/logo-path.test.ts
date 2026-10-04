import { logoObjectPath, sourceLogoUrl } from "./logo-path";

describe("caminho e URL do logotipo", () => {
  it("o caminho leva o id e o hash do conteúdo (mesmo do upload manual)", () => {
    const a = logoObjectPath("src-1", new Uint8Array([1, 2, 3]), "image/png");
    expect(a).toMatch(/^src-1\/[0-9a-f]{16}\.png$/);
    expect(logoObjectPath("src-1", new Uint8Array([1, 2, 3]), "image/png")).toBe(a);
    expect(logoObjectPath("src-1", new Uint8Array([9]), "image/webp")).toMatch(/\.webp$/);
  });

  it("URL pública só com caminho e URL do projeto", () => {
    expect(sourceLogoUrl("a/b.png", "https://x.supabase.co/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/source-logos/a/b.png",
    );
    expect(sourceLogoUrl(null, "https://x.supabase.co")).toBeUndefined();
    expect(sourceLogoUrl("a/b.png", "")).toBeUndefined();
  });
});
