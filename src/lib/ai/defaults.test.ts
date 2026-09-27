// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS, DEFAULT_MODELS } from "./defaults";
import { GLOBAL_DAILY_BUDGET_BRL } from "./registry";
import { AGENT_IDS } from "./types";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0006_ai_seed.sql"), "utf8");

describe("registro padrão de IA", () => {
  it("espelha a migration 0006 (modelos, agentes e prompts v1)", () => {
    for (const m of DEFAULT_MODELS) {
      expect(sql).toContain(`'${m.id}'`);
      expect(sql).toContain(String(m.costPer1kIn));
    }
    for (const a of DEFAULT_AGENTS) {
      expect(sql).toContain(`('${a.id}', '${a.fn}', '${a.model}'`);
      if (a.prompt) expect(sql).toContain(`('${a.id}', 1, '${a.prompt}'`);
    }
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
