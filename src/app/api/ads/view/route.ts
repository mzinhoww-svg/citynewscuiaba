import { defaultAdApiDeps, handleAdTrack } from "@/lib/ads/api";

/** Impressão e visualização (>= 50% por 1 s) de anúncio, agregadas por dia (ADS-T1). */
export async function POST(req: Request) {
  return handleAdTrack(req, defaultAdApiDeps());
}
