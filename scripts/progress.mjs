#!/usr/bin/env node
// Atualiza .planning/progress.json: node scripts/progress.mjs <ID> <status> [commit] [notas]
import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../.planning/progress.json", import.meta.url);
const p = JSON.parse(readFileSync(file));
const [id, status, commit, notes] = process.argv.slice(2);
let hit = false;
for (const f of p.phases) {
  if (f.id === id) { f.status = status; hit = true; }
  for (const t of f.tasks) if (t.id === id) {
    t.status = status; hit = true;
    if (status === "in_progress") t.attempts += 1;
    if (commit) t.commit = commit;
    if (notes) t.notes = notes;
  }
}
if (!hit) { console.error(`id desconhecido: ${id}`); process.exit(1); }
p.updatedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
