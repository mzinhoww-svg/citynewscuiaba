import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * UX-W1-T10 (item 22): o estado do assunto ("Em apuração", "Confirmado"…) fica só no Estúdio
 * (R16, R34). Nenhuma tela pública nem componente usado por ela importa `TopicStatus`.
 */

const ROOT = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const PUBLIC_COMPONENTS = [
  "components/editorial/TopicSummaryCard.tsx",
  "components/editorial/SearchResults.tsx",
].map((f) => join(ROOT, f));

describe("TopicStatus fora do público", () => {
  it.each([...files(join(ROOT, "app/(public)")), ...PUBLIC_COMPONENTS])("%s", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/\bTopicStatus\b/);
  });
});
