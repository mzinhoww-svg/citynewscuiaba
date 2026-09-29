// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS, DEFAULT_MODELS } from "./defaults";
import { GLOBAL_DAILY_BUDGET_BRL } from "./registry";
import { AGENT_IDS } from "./types";

const migration = (file: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");
const seed = flat(migration("0006_ai_seed.sql"));
const panel = flat(migration("0011_source_admin.sql"));

describe("registro padrão de IA", () => {
  it("espelha as migrations 0006 e 0011 (modelos, agentes e prompts v1)", () => {
    for (const m of DEFAULT_MODELS) {
      expect(seed).toContain(`'${m.id}'`);
      expect(seed).toContain(String(m.costPer1kIn));
    }
    for (const a of DEFAULT_AGENTS) {
      const sql = a.id === "source_profiler" ? panel : seed;
      expect(sql).toContain(`('${a.id}', '${a.fn}', '${a.model}'`);
      if (a.prompt) expect(sql).toContain(`('${a.id}', 1, '${a.prompt}'`);
    }
  });

  it("a 0011 tira R$ 1 do write para o teto continuar em R$ 30 (A-076)", () => {
    expect(panel).toContain("update ai_agents set daily_budget_brl = 10 where id = 'write'");
    expect(DEFAULT_AGENTS.find((a) => a.id === "write")?.dailyBudgetBrl).toBe(10);
    expect(DEFAULT_AGENTS.find((a) => a.id === "source_profiler")?.dailyBudgetBrl).toBe(1);
  });

  it("todo agente de texto tem prompt e fallback; orçamentos somam o teto global", () => {
    for (const id of AGENT_IDS) {
      const a = DEFAULT_AGENTS.find((x) => x.id === id);
      expect(a?.prompt, id).toBeTruthy();
      expect(a?.fallback, id).toBeTruthy();
    }
    expect(DEFAULT_AGENTS.reduce((s, a) => s + a.dailyBudgetBrl, 0)).toBe(GLOBAL_DAILY_BUDGET_BRL);
  });
});
