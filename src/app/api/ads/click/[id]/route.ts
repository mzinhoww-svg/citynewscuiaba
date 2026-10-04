import { defaultAdApiDeps, handleAdClick } from "@/lib/ads/api";

/** Clique em anúncio: conta e redireciona (302) para o anunciante (ADS-T1). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleAdClick(req, id, defaultAdApiDeps());
}
