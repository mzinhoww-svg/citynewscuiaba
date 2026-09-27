#!/usr/bin/env node
// Imprime a próxima tarefa aberta segundo .planning/progress.json.
// --has-open: sai com 0 se houver tarefa aberta, 1 se tudo estiver done.
import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(new URL("../.planning/progress.json", import.meta.url)));
const byId = Object.fromEntries(p.phases.map((f) => [f.id, f]));
const open = (t) => t.status === "pending" || t.status === "in_progress";
const ready = (f) => f.dependsOn.every((d) => byId[d]?.status === "done");
let next = null;
for (const id of p.order) {
  const f = byId[id];
  if (f.status === "done" || !ready(f)) continue;
  const t = f.tasks.find(open);
  if (t) { next = { phase: f.id, ...t }; break; }
  if (f.status !== "done") { next = { phase: f.id, id: `${f.id}-GATE`, title: "Gate de fase (docs/AUTONOMY.md §5)" }; break; }
}
const total = p.phases.reduce((n, f) => n + f.tasks.length, 0);
const done = p.phases.reduce((n, f) => n + f.tasks.filter((t) => t.status === "done").length, 0);
const degraded = p.phases.flatMap((f) => f.tasks.filter((t) => t.status === "degraded").map((t) => t.id));
if (process.argv.includes("--has-open")) process.exit(next ? 0 : 1);
console.log(`Progresso: ${done}/${total} tarefas · degradadas: ${degraded.join(", ") || "nenhuma"}`);
console.log(next ? `Próxima: ${next.id} · ${next.title}` : "Todas as fases concluídas.");
