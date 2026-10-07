import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Sinal do Lighthouse (itens 16 e 17 da spec de melhorias; A-146). Sem dependência de YAML:
// o workflow é lido como texto, sem comentários, e cada bloco é recortado pela indentação.
const root = process.cwd();
const workflow = readFileSync(join(root, ".github/workflows/lighthouse.yml"), "utf8")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .map((l) => l.replace(/\s+#.*$/, ""))
  .join("\n");
const rc = JSON.parse(readFileSync(join(root, "lighthouserc.json"), "utf8")) as {
  ci: {
    assert: {
      assertMatrix: { matchingUrlPattern: string; assertions: Record<string, unknown> }[];
    };
  };
};

/** Linhas do bloco que começa em `header` (mesma indentação ou menor encerra o bloco). */
function block(text: string, header: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => header.test(l));
  if (start < 0) return "";
  const indent = lines[start]!.search(/\S/);
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.trim() === "") continue;
    if (l.search(/\S/) <= indent) break;
    out.push(l);
  }
  return out.join("\n");
}

/** Passos do job: cada item começa com `- ` na indentação dos passos. */
function steps(text: string): string[] {
  const body = block(text, /^\s+steps:\s*$/);
  const lines = body.split("\n");
  const indent = lines[0]?.search(/\S/) ?? 0;
  const out: string[] = [];
  for (const l of lines) {
    if (l.search(/\S/) === indent && l.trimStart().startsWith("- ")) out.push(l);
    else if (out.length) out[out.length - 1] += `\n${l}`;
  }
  return out;
}

describe("workflow do Lighthouse", () => {
  const on = block(workflow, /^on:\s*$/);

  it("roda em push na main e toda semana, além de PR", () => {
    expect(on).toMatch(/^\s+pull_request:/m);
    const push = block(on, /^\s+push:\s*$/);
    expect(push).toMatch(/branches:\s*\[\s*main\s*\]|branches:\s*\n\s+-\s*main/);
    expect(block(on, /^\s+schedule:\s*$/)).toMatch(/cron:\s*["']17 9 \* \* 1["']/);
  });

  it("falha aparece como check vermelho (sem continue-on-error)", () => {
    expect(workflow).not.toMatch(/continue-on-error/);
  });

  it("publica o relatório com arquivos ocultos (.lighthouseci)", () => {
    const upload = steps(workflow).find((s) => /uses:\s*actions\/upload-artifact@/.test(s));
    expect(upload).toBeDefined();
    expect(upload).toMatch(/if:\s*always\(\)/);
    expect(upload).toMatch(/path:\s*\.lighthouseci/);
    expect(upload).toMatch(/include-hidden-files:\s*true/);
  });

  it("resumo em passo próprio que roda mesmo com falha", () => {
    const all = steps(workflow);
    const summary = all.find((s) => /lighthouse-summary\.mjs/.test(s));
    expect(summary).toBeDefined();
    expect(summary).toMatch(/if:\s*always\(\)/);
    expect(summary).not.toMatch(/lhci autorun/);
  });
});

describe("orçamentos do lighthouserc.json", () => {
  it("script:size bloqueia; medida da W5-T5 + 3 %: 178,2 kB em home e busca, 187,4 kB em matéria e Fontes", () => {
    const budgets = rc.ci.assert.assertMatrix.map((m) => {
      const a = m.assertions["resource-summary:script:size"] as [
        string,
        { maxNumericValue: number },
      ];
      return { url: m.matchingUrlPattern, level: a[0], max: a[1].maxNumericValue };
    });
    expect(budgets.length).toBeGreaterThan(0);
    for (const b of budgets) {
      expect(b.level, b.url).toBe("error");
      expect(b.max, b.url).toBeLessThanOrEqual(190000);
    }
    // Home e busca: 170 → 175 (A-146) → 180 (A-151) → 178,2 kB (A-156: maior medida depois do
    // corte da W5-T5, 173,0 kB na busca, + 3 %). Matéria e Fontes: 190 → 187,4 kB (181,9 + 3 %).
    const home = budgets.find((b) => b.url === "^http://localhost:3000/(\\?.*)?$");
    const busca = budgets.find((b) => b.url === "^http://localhost:3000/busca");
    const others = budgets.find((b) => b.url === "^http://localhost:3000/(materia|fontes)");
    expect(home?.max).toBe(178200);
    expect(busca?.max).toBe(178200);
    expect(others?.max).toBe(187400);
    // Agenda, Cidade e Guia (W5-T8): 190 kB até a primeira medida do CI (PR #66: agenda 173,9,
    // cidade 173,6, guia 166,6 kB); a maior + 3 % = 179,1 kB.
    const novas = budgets.find(
      (b) => b.url === "^http://localhost:3000/(agenda|cidade|guia-cuiaba)",
    );
    expect(novas?.max).toBe(179100);
  });
});
