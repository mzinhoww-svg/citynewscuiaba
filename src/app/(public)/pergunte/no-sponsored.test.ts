import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * B-022 (ADVERTISE_RULES, CLAUDE.md §5.5): nada patrocinado nas respostas do Pergunte. A tela, a
 * rota e o código da resposta não tocam o patrocínio nativo (`withNativeSponsored`,
 * `SponsoredCard`, `public_sponsored_campaigns`) nem os campos de banner.
 */

const ROOT = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const ASK_FILES = [
  ...files(join(ROOT, "app/(public)/pergunte")),
  ...files(join(ROOT, "app/api/ask")),
  join(ROOT, "lib/ai/answer.ts"),
  join(ROOT, "lib/search/ask.ts"),
];

describe("Pergunte sem patrocínio", () => {
  it.each(ASK_FILES)("%s", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(
      /withNativeSponsored|SponsoredCard|public_sponsored_campaigns|placeSponsored|AdSlot/,
    );
  });
});
