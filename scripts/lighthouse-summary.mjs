// Resume .lighthouseci/lhr-*.json: mediana por rota de LCP, CLS, TBT, JS transferido e nota.
// Uso: node scripts/lighthouse-summary.mjs [pasta]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? ".lighthouseci";
const byRoute = new Map();
for (const f of readdirSync(dir).filter((n) => /^lhr-.*\.json$/.test(n))) {
  const lhr = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const u = new URL(lhr.finalDisplayedUrl ?? lhr.finalUrl);
  const route = u.pathname.replace(/^\/materia\/.+/, "/materia/<slug>") + u.search;
  const a = lhr.audits;
  const row = {
    lcp: a["largest-contentful-paint"].numericValue,
    cls: a["cumulative-layout-shift"].numericValue,
    tbt: a["total-blocking-time"].numericValue,
    js: a["resource-summary"].details.items.find((i) => i.resourceType === "script")?.transferSize ?? 0,
    perf: (lhr.categories.performance.score ?? 0) * 100,
  };
  if (!byRoute.has(route)) byRoute.set(route, []);
  byRoute.get(route).push(row);
}
const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
console.log("rota | runs | LCP ms | CLS | TBT ms | JS kB (transfer) | perf");
for (const [route, rows] of byRoute) {
  const m = (k) => median(rows.map((r) => r[k]));
  console.log(
    `${route} | ${rows.length} | ${m("lcp").toFixed(0)} | ${m("cls").toFixed(3)} | ${m("tbt").toFixed(0)} | ${(m("js") / 1000).toFixed(1)} | ${m("perf").toFixed(0)}`,
  );
}
