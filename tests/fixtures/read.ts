import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Lê um arquivo de `tests/fixtures/feeds` (fontes fictícias, spec §9). */
export function readFixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures/feeds", name), "utf8");
}
