import { err, ok, type Result } from "@/lib/result";
import { decidePublication, type Candidate, type Route, type RuleSet } from "./index";

/**
 * Simulação e comparação de versões das regras de autonomia (P5-T2, Review Focus 5). Funções
 * puras: a tela passa a amostra dos últimos 7 dias (candidatos registrados em `decisions`) e
 * mostra quantos itens mudariam de destino antes de propor a versão nova.
 */

export interface RouteChange {
  from: Route;
  to: Route;
  count: number;
}

export interface Simulation {
  /** Itens cujo destino muda com as regras novas. */
  changed: number;
  total: number;
  /** Mudanças agrupadas pelo destino atual (`from`). */
  byRoute: Partial<Record<Route, RouteChange[]>>;
}

export function simulateRules(next: RuleSet, sample: Candidate[], current: RuleSet): Simulation {
  const counts = new Map<string, RouteChange>();
  let changed = 0;
  for (const c of sample) {
    const from = decidePublication(c, current).route;
    const to = decidePublication(c, next).route;
    if (from === to) continue;
    changed++;
    const key = `${from}>${to}`;
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { from, to, count: 1 });
  }
  const byRoute: Simulation["byRoute"] = {};
  for (const ch of counts.values()) (byRoute[ch.from] ??= []).push(ch);
  for (const list of Object.values(byRoute)) list.sort((a, b) => b.count - a.count);
  return { changed, total: sample.length, byRoute };
}

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
const isScore = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const MODES = new Set(["auto", "auto_notify", "review", "blocked"]);

/** Valida uma proposta antes de gravar: números na faixa, categorias e temas não vazios. */
export function validateRuleSet(r: RuleSet): Result<RuleSet, string> {
  const cats = Object.entries(r.categories);
  if (cats.length === 0) return err("Pelo menos uma categoria precisa ter regra.");
  for (const [key, c] of cats) {
    if (!/^[a-z0-9-]+$/.test(key)) return err(`Categoria "${key}" inválida.`);
    if (!MODES.has(c.mode)) return err(`${key}: modo inválido.`);
    if (!isCount(c.minSources) || c.minSources > 10)
      return err(`${key}: mínimo de fontes de 0 a 10.`);
    if (c.minScore !== null && !isScore(c.minScore))
      return err(`${key}: confiança mínima de 0 a 1.`);
    if (c.summaryWords !== null && (!isCount(c.summaryWords) || c.summaryWords > 500))
      return err(`${key}: resumo de até 500 palavras.`);
  }
  if (r.sensitiveTopics.some((t) => !t.trim())) return err("Tema sensível vazio.");
  if (r.neverAuto.some((t) => !/^[a-z0-9-]+$/.test(t)))
    return err('Categoria da lista "nunca automática" inválida.');
  return ok(r);
}

/**
 * A proposta tira tema sensível da lista em vigor? Isso enfraquece a retenção e abre pedido
 * `safety.disable` (admin aprova), não um `rules.activate` comum (gate do P5, achado 7).
 */
export function weakensSafety(current: RuleSet, next: RuleSet): boolean {
  return (
    current.sensitiveTopics.some((t) => !next.sensitiveTopics.includes(t)) ||
    current.neverAuto.some((t) => !next.neverAuto.includes(t)) ||
    (current.breakingReview && !next.breakingReview) ||
    (current.sensitiveFlagReview && !next.sensitiveFlagReview)
  );
}

export interface RuleChange {
  /** `forceReview`, `sensitiveTopics` ou `<categoria>.<campo>`. */
  path: string;
  from: string;
  to: string;
}

const text = (v: unknown): string => (v === null || v === undefined ? "—" : String(v));

/** Diferenças entre duas versões, campo a campo (para a tela e para a justificativa). */
export function ruleDiff(a: RuleSet, b: RuleSet): RuleChange[] {
  const out: RuleChange[] = [];
  if (a.forceReview !== b.forceReview)
    out.push({ path: "forceReview", from: String(a.forceReview), to: String(b.forceReview) });
  for (const f of ["breakingReview", "sensitiveFlagReview"] as const)
    if (a[f] !== b[f]) out.push({ path: f, from: String(a[f]), to: String(b[f]) });
  const droppedNever = a.neverAuto.filter((t) => !b.neverAuto.includes(t));
  const addedNever = b.neverAuto.filter((t) => !a.neverAuto.includes(t));
  if (droppedNever.length || addedNever.length)
    out.push({
      path: "neverAuto",
      from: droppedNever.map((t) => `-${t}`).join(" "),
      to: addedNever.map((t) => `+${t}`).join(" "),
    });
  const removed = a.sensitiveTopics.filter((t) => !b.sensitiveTopics.includes(t));
  const added = b.sensitiveTopics.filter((t) => !a.sensitiveTopics.includes(t));
  if (removed.length || added.length)
    out.push({
      path: "sensitiveTopics",
      from: removed.map((t) => `-${t}`).join(" "),
      to: added.map((t) => `+${t}`).join(" "),
    });
  const keys = [...new Set([...Object.keys(a.categories), ...Object.keys(b.categories)])];
  const fields = [
    "mode",
    "minSources",
    "requirePrimary",
    "requireApprovedImage",
    "minScore",
    "summaryWords",
  ] as const;
  for (const k of keys) {
    const ca = a.categories[k];
    const cb = b.categories[k];
    if (!ca || !cb) {
      out.push({ path: k, from: ca ? "regra" : "—", to: cb ? "regra" : "—" });
      continue;
    }
    for (const f of fields)
      if (ca[f] !== cb[f]) out.push({ path: `${k}.${f}`, from: text(ca[f]), to: text(cb[f]) });
  }
  return out;
}
