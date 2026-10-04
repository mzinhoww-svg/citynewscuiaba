import "server-only";
import type { AdEvent } from "@/lib/ads/track";
import { createPublicClient, createServiceClient } from "./client";

/**
 * Banco das rotas de anúncio (ADS-T1). A contagem usa o service role (`ad_track` não é
 * executável por anon); o link do clique vem da view pública, para o redirecionamento funcionar
 * mesmo sem a chave de serviço (B-013).
 */
export async function trackAdEvent(
  placement: string,
  section: string | null,
  event: AdEvent,
  key: string,
): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("ad_track", {
    p_placement: placement,
    p_section: section ?? "",
    p_event: event,
    p_key: key,
  });
  if (error) throw new Error(`ad_track: ${error.message}`);
  return data === true;
}

export async function adHref(placement: string): Promise<string | null> {
  const { data, error } = await createPublicClient()
    .from("public_ad_placements")
    .select("creative")
    .eq("id", placement)
    .maybeSingle();
  if (error) throw new Error(`ad href: ${error.message}`);
  const c = data?.creative;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const href = (c as Record<string, unknown>).href;
  return typeof href === "string" ? href : null;
}
