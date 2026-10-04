import { mergeRecord, nameSimilarity } from "./merge";
import type { VenueProvider } from "./providers/types";
import type { DataSource, VenueRecord } from "./types";

/**
 * Confere cada nome extraído de um link nos provedores (OpenStreetMap, TripAdvisor) antes de
 * entrar numa lista (GUIA-T4, Review Focus 2): o nome do portal de origem só vale como pista de
 * busca; o lugar da nossa lista é o que os provedores devolvem, com os dados deles. Nome que
 * nenhum provedor reconhece em Cuiabá é descartado.
 */

export interface VerifiedName {
  name: string;
  status: "verified" | "not_found";
  record: VenueRecord | null;
  /** Provedores que reconheceram o nome. */
  providers: DataSource[];
}

/** Semelhança mínima entre o nome pedido e o devolvido pelo provedor. */
export const MIN_MATCH = 0.75;
export const MAX_VERIFY = 20;

export async function verifyNames(
  names: readonly string[],
  providers: readonly VenueProvider[],
  opts: { area: string; category?: string | null },
): Promise<VerifiedName[]> {
  const out: VerifiedName[] = [];
  for (const name of names.slice(0, MAX_VERIFY)) {
    let record: VenueRecord | null = null;
    const found: DataSource[] = [];
    for (const p of providers) {
      const r = await p.search({
        name,
        area: opts.area,
        ...(opts.category ? { category: opts.category } : {}),
        limit: 5,
      });
      if (!r.ok) continue;
      const best = r.value
        .map((v) => ({ v, sim: nameSimilarity(name, v.name) }))
        .filter((x) => x.sim >= MIN_MATCH)
        .sort((a, b) => b.sim - a.sim)[0]?.v;
      if (!best) continue;
      // Nota e ranking só vêm dos detalhes (a busca devolve o mínimo).
      const id = best.placeIds.tripadvisor;
      let full = best;
      if (p.source === "tripadvisor" && id) {
        const d = await p.details(id);
        if (d.ok && d.value) full = d.value;
      }
      record = record ? mergeRecord(record, full) : full;
      found.push(p.source);
    }
    if (record) {
      out.push({
        name,
        status: "verified",
        record: { ...record, category: opts.category ?? record.category },
        providers: found,
      });
    } else {
      out.push({ name, status: "not_found", record: null, providers: [] });
    }
  }
  return out;
}
