/**
 * Saúde do site para o vigia externo (`.github/workflows/uptime.yml`). Dois sinais:
 * - `db`: o banco responde a uma leitura mínima (é o que derruba a home quando o Supabase é
 *   restrito ou cai);
 * - `newestArticleAgeMin`: idade da matéria publicada mais recente (publicação parada).
 * Sem segredo e sem dado de leitor: só booleanos e minutos.
 */

export interface HealthReport {
  ok: boolean;
  db: boolean;
  /** Minutos desde a última publicação; `null` se não houver matéria ou o banco não respondeu. */
  newestArticleAgeMin: number | null;
}

export interface HealthDeps {
  /** `published_at` da matéria publicada mais recente (ISO) ou `null` sem matéria. Lança se o banco falhar. */
  newestPublishedAt: () => Promise<string | null>;
  now: () => Date;
}

export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  try {
    const at = await deps.newestPublishedAt();
    const age = at
      ? Math.max(0, Math.round((deps.now().getTime() - Date.parse(at)) / 60_000))
      : null;
    return { ok: true, db: true, newestArticleAgeMin: Number.isFinite(age) ? age : null };
  } catch {
    return { ok: false, db: false, newestArticleAgeMin: null };
  }
}

/** 200 com o banco de pé, 503 sem ele; curto prazo em cache para um sondador não pesar no banco. */
export function healthResponse(report: HealthReport): Response {
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=0",
      "X-Robots-Tag": "noindex",
    },
  });
}
