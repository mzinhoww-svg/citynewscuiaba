import { LOCAL_LOCALITIES, reasonFor } from "./explain";
import { DEFAULT_REC_CONFIG, scoreSource } from "./score";
import type { RankList, RankOptions, RankedSource, SourceSignals } from "./types";

/**
 * Teto por fonte em listas de itens (spec §7.3): nenhuma fonte ocupa mais de
 * `ceil(limit · cap)` posições. Preserva a ordem e preenche até `limit` com as demais.
 */
export function capItems<T extends { sourceSlug: string }>(
  items: T[],
  limit: number,
  cap: number,
): T[] {
  const max = Math.max(1, Math.ceil(limit * cap));
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    if (out.length >= limit) break;
    const n = counts.get(item.sourceSlug) ?? 0;
    if (n >= max) continue;
    counts.set(item.sourceSlug, n + 1);
    out.push(item);
  }
  return out;
}

function inList(s: SourceSignals, list: RankList): boolean {
  switch (list) {
    case "followed":
      return s.followed;
    case "recommended":
      return !s.followed;
    case "new":
      return !s.followed && s.isNewForUser;
    case "local":
      return LOCAL_LOCALITIES.includes(s.locality);
    case "verified":
      return s.verified;
    case "popular":
    case "trending":
      return true;
  }
}

type Scored = { s: SourceSignals; score: number };

const desc = (a: number, b: number) => b - a;

/** Critério de cada lista; empate por score e depois por slug (determinístico). */
function compare(list: RankList): (a: Scored, b: Scored) => number {
  const primary = (x: Scored): number[] => {
    switch (list) {
      case "popular":
        return [x.s.popularity];
      case "trending":
        return [x.s.trend];
      case "local":
        return [x.s.localHighlight ? 1 : 0];
      case "new":
        return [x.s.diversity];
      default:
        return [];
    }
  };
  return (a, b) => {
    const pa = primary(a);
    const pb = primary(b);
    for (let i = 0; i < pa.length; i++) {
      const d = desc(pa[i]!, pb[i]!);
      if (d !== 0) return d;
    }
    return desc(a.score, b.score) || a.s.slug.localeCompare(b.s.slug);
  };
}

/** Candidata à descoberta: o leitor ainda não lê a fonte e ela amplia a diversidade. */
function isDiscovery(s: SourceSignals): boolean {
  return s.individual === 0 && s.diversity > 0;
}

/**
 * Ranking de uma lista da área Fontes (tracking-plan §4):
 * 1. remove ocultadas pelo leitor, bloqueadas e excluídas da recomendação (e duplicadas);
 * 2. ordena pelo critério da lista (score composto `rec-v1` como desempate);
 * 3. fixadas pelo admin no topo, contando no teto;
 * 4. em "Recomendadas", cada bloco de 5 posições tem exatamente 1 descoberta quando há candidata;
 * 5. teto por fonte (cada fonte aparece no máximo uma vez numa lista de fontes).
 */
export function rankSources(list: SourceSignals[], opts: RankOptions): RankedSource[] {
  const cap = opts.cap ?? DEFAULT_REC_CONFIG.cap;
  const every = Math.max(2, opts.discoveryEvery ?? DEFAULT_REC_CONFIG.discoveryEvery);
  const hidden = new Set(opts.hidden);
  const seen = new Set<string>();
  const eligible: Scored[] = [];
  for (const s of list) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    if (s.excluded || s.blocked || hidden.has(s.slug) || !inList(s, opts.list)) continue;
    eligible.push({ s, score: scoreSource(s, opts.weights, opts.personalization) });
  }
  const cmp = compare(opts.list);
  const ordered = [
    ...eligible.filter((x) => x.s.pinned).sort(cmp),
    ...eligible.filter((x) => !x.s.pinned).sort(cmp),
  ];

  const picked: { x: Scored; discovery: boolean }[] = [];
  const used = new Set<Scored>();
  const withQuota = opts.list === "recommended";
  const bestDiscovery = () =>
    ordered
      .filter((x) => !used.has(x) && isDiscovery(x.s))
      .sort((a, b) => desc(a.s.diversity, b.s.diversity) || cmp(a, b))[0];

  while (picked.length < opts.limit) {
    const pos = picked.length;
    const blockHasDiscovery = picked.slice(pos - (pos % every)).some((p) => p.discovery);
    let next = ordered.find((x) => !used.has(x));
    if (!next) break;
    let discovery = false;
    if (withQuota && !blockHasDiscovery) {
      if (isDiscovery(next.s)) discovery = true;
      else if (pos % every === every - 1) {
        const d = bestDiscovery();
        if (d) {
          next = d;
          discovery = true;
        }
      }
    }
    used.add(next);
    picked.push({ x: next, discovery });
  }

  const capped = capItems(
    picked.map((p) => ({ ...p, sourceSlug: p.x.s.slug })),
    opts.limit,
    cap,
  );
  return capped.map(({ x, discovery }) => ({
    ...x.s,
    score: x.score,
    discovery,
    reason: reasonFor(x.s, opts.list, opts.personalization, discovery),
  }));
}
