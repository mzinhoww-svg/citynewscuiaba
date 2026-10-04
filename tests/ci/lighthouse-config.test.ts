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
  it("script:size bloqueia; provisório de 175 KB em home e busca (meta ≤ 165 KB na W5-T5)", () => {
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
      expect(b.max, b.url).toBeLessThanOrEqual(185000);
    }
    // Home e busca: 170 KB → 175 KB (A-146).
    const home = budgets.find((b) => b.url === "^http://localhost:3000/(\\?.*)?$");
    const busca = budgets.find((b) => b.url === "^http://localhost:3000/busca");
    expect(home?.max).toBe(175000);
    expect(busca?.max).toBe(175000);
  });
});
