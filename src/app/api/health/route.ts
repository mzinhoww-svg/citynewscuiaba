import { createPublicClient } from "@/lib/db/client";
import { checkHealth, healthResponse } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saúde do site para o vigia externo: o banco responde? a publicação anda? Leitura mínima
 * (uma linha, uma coluna) com o cliente anônimo; sem login e sem dado de leitor.
 */
export async function GET(): Promise<Response> {
  const report = await checkHealth({
    newestPublishedAt: async () => {
      const { data, error } = await createPublicClient()
        .from("articles")
        .select("published_at")
        .in("status", ["published", "updated"])
        .order("published_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return data?.[0]?.published_at ?? null;
    },
    now: () => new Date(),
  });
  return healthResponse(report);
}
