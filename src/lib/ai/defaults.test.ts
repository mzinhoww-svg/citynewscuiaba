// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS, DEFAULT_MODELS } from "./defaults";
import { GLOBAL_DAILY_BUDGET_BRL } from "./registry";
import { AGENT_IDS } from "./types";

const readSql = (name: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");

// A-056: `write` cedeu R$ 1 ao novo agente `source_profiler`, seedado na migration 0011; e R$ 1 ao
// `reviewer` (AUT-T6, migration 0141) e R$ 1 ao `event_extractor` (AGM-T1, migration 0182).
const sql0006 = readSql("0006_ai_seed.sql");
const sql0011 = readSql("0011_source_admin.sql");
const sql0141 = readSql("0141_auto_reviewer.sql");
const sql0182 = readSql("0182_agenda_multifonte.sql");
/** Compara ignorando como o SQL quebra linha entre os valores de um `insert`/`update`. */
const norm = (s: string) => s.replace(/\s+/g, " ");
const sqlAll = norm(`${sql0006}\n${sql0011}\n${sql0141}\n${sql0182}`);

describe("registro padrão de IA", () => {
  it("espelha as migrations 0006 + 0011 + 0141 + 0182 (modelos, agentes e prompts v1)", () => {
    for (const m of DEFAULT_MODELS) {
      expect(sqlAll).toContain(`'${m.id}'`);
      expect(sqlAll).toContain(String(m.costPer1kIn));
    }
    for (const a of DEFAULT_AGENTS) {
      expect(sqlAll).toContain(norm(`('${a.id}', '${a.fn}', '${a.model}'`));
      if (a.prompt) expect(sqlAll).toContain(norm(`('${a.id}', 1, '${a.prompt}'`));
    }
    // 0011 redistribui o teto global: `write` passa de R$ 11 para R$ 10 (A-056).
    expect(sql0011).toContain("update ai_agents set daily_budget_brl = 10 where id = 'write';");
  });

  it("todo agente de texto tem prompt e fallback; orçamentos somam o teto global (write R$ 8 + source_profiler R$ 1 + reviewer R$ 1 + event_extractor R$ 1)", () => {
    for (const id of AGENT_IDS) {
      const a = DEFAULT_AGENTS.find((x) => x.id === id);
      expect(a?.prompt, id).toBeTruthy();
      expect(a?.fallback, id).toBeTruthy();
    }
    expect(DEFAULT_AGENTS.find((a) => a.id === "write")?.dailyBudgetBrl).toBe(8);
    expect(DEFAULT_AGENTS.find((a) => a.id === "event_extractor")?.dailyBudgetBrl).toBe(1);
    expect(DEFAULT_AGENTS.find((a) => a.id === "reviewer")?.dailyBudgetBrl).toBe(1);
    expect(DEFAULT_AGENTS.find((a) => a.id === "source_profiler")?.dailyBudgetBrl).toBe(1);
    expect(DEFAULT_AGENTS.reduce((s, a) => s + a.dailyBudgetBrl, 0)).toBe(GLOBAL_DAILY_BUDGET_BRL);
  });
});
