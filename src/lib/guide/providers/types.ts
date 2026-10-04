import type { Result } from "@/lib/result";
import type { DataSource, VenueRecord } from "../types";

export type ProviderError =
  "no_key" | "unauthorized" | "rate_limited" | "http" | "network" | "invalid";

export interface VenueQuery {
  /** Categoria do Guia (`padaria`). Sem categoria, só vale `name`. */
  category?: string;
  /** Cozinha (`italiana`) para restaurante. */
  subcategory?: string | null;
  /** Busca de um nome específico (verificação de nomes de uma lista colada). */
  name?: string;
  /** Município ("Cuiabá"). */
  area: string;
  limit?: number;
}

/**
 * Fonte de dados dos lugares. Só API oficial ou dado aberto; nunca raspagem (Global Constraints).
 * `details` busca um lugar pelo id do próprio provedor.
 */
export interface VenueProvider {
  readonly source: DataSource;
  search(q: VenueQuery): Promise<Result<VenueRecord[], ProviderError>>;
  details(id: string): Promise<Result<VenueRecord | null, ProviderError>>;
}

/** Identificação do robô em APIs abertas (Nominatim e Overpass exigem User-Agent identificável). */
export function guideUserAgent(): string {
  return (
    process.env.CRAWLER_USER_AGENT?.trim() ||
    "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)"
  );
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
