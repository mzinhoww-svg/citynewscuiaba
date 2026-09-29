import { decidePublication, type Candidate, type Route } from ".";
import { isNeverAutoCategory } from "./safety";
import type { RuleSet } from "./types";

export interface RouteChange {
  from: string;
  to: string;
  count: number;
}

export interface Simulation {
  /** Quantos candidatos mudariam de destino. */
  changed: number;
  /** Mudanças agrupadas pelo destino atual (`from`), mais frequentes primeiro. */
  byRoute: Record<string, RouteChange[]>;
}

const publishes = (r: Route) => r === "publish" || r === "publish_notify";

/**
 * Destino de um candidato com as travas que valem em qualquer versão das regras (as mesmas de
 * `routeArticle` que dependem só do candidato): urgente, tema sensível e Segurança nunca
 * publicam sozinhos.
 */
export function simulatedRoute(c: Candidate, rules: RuleSet): Route {
  const route = decidePublication(c, rules).route;
  if (publishes(route) && (c.breaking || c.sensitive === true || isNeverAutoCategory(c.category)))
    return "review";
  return route;
}

/**
 * Simula uma versão nova das regras sobre uma amostra (plano P5 Task 2; Review Focus 5): quantos
 * candidatos mudariam de destino em relação às regras atuais e quais transições. Pura.
 */
export function simulateRules(next: RuleSet, sample: Candidate[], current: RuleSet): Simulation {
  const counts = new Map<string, RouteChange>();
  let changed = 0;
  for (const c of sample) {
    const from = simulatedRoute(c, current);
    const to = simulatedRoute(c, next);
    if (from === to) continue;
    changed += 1;
    const key = `${from}>${to}`;
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else counts.set(key, { from, to, count: 1 });
  }
  const byRoute: Record<string, RouteChange[]> = {};
  for (const change of [...counts.values()].sort(
    (a, b) => b.count - a.count || a.to.localeCompare(b.to),
  )) {
    (byRoute[change.from] ??= []).push(change);
  }
  return { changed, byRoute };
}
