import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateLogo } from "@/lib/sources/logo";
import { logoObjectPath } from "@/lib/sources/logo-path";

interface Entry {
  slug: string;
  id: string;
  original: string;
  path: string;
  bytes: number;
}

const DIR = "assets/source-logos";
const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8")) as Entry[];

describe("logotipos das fontes enviados pelo dono", () => {
  it("cobre as 12 fontes do pacote, sem repetir", () => {
    expect(manifest).toHaveLength(12);
    expect(new Set(manifest.map((e) => e.id)).size).toBe(12);
  });

  it.each(manifest)("$slug passa em validateLogo e o caminho bate com o conteúdo", (e) => {
    const bytes = new Uint8Array(readFileSync(join(DIR, `${e.slug}.png`)));
    const r = validateLogo(bytes);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ contentType: "image/png", width: 512, height: 512 });
    expect(logoObjectPath(e.id, bytes, "image/png")).toBe(e.path);
    expect(bytes.length).toBe(e.bytes);
  });
});
