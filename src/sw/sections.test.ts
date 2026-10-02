import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_DESCRIPTION } from "@/content/pt-BR/portal-section";
import { SW_SECTIONS } from "./sections";

describe("SW_SECTIONS (G12)", () => {
  it("editorias do SW = editorias de 0010_sections.sql", () => {
    const sql = readFileSync("supabase/migrations/0010_sections.sql", "utf8");
    const slugs = [...sql.matchAll(/^\s*\('([a-z0-9-]+)',\s*'[^']+',/gm)].map((m) => m[1]!);
    expect([...SW_SECTIONS].sort()).toEqual([...new Set(slugs)].sort());
  });
  it("toda editoria descrita no portal está no SW", () => {
    for (const slug of Object.keys(SECTION_DESCRIPTION)) expect(SW_SECTIONS).toContain(slug);
  });
});
