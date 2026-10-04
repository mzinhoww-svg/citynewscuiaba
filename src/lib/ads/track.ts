import "server-only";
import { createHash } from "node:crypto";

/**
 * Contagem agregada de anúncio (ADS-T1, spec banners-padrão §4): sem identificador de pessoa.
 * A chave de deduplicação junta sal, IP, navegador, peça, evento e janela de 30 min, em hash;
 * só serve para recarga rápida não contar duas vezes e some do banco no dia seguinte.
 */
export type AdEvent = "impression" | "view" | "click";

const WINDOW_MS = 30 * 60 * 1000;

export function trackKey(i: {
  salt: string;
  ip: string;
  ua: string;
  placementId: string;
  event: AdEvent;
  now: Date;
}): string {
  const slot = Math.floor(i.now.getTime() / WINDOW_MS);
  return createHash("sha256")
    .update(`${i.salt}:${i.ip}:${i.ua}:${i.placementId}:${i.event}:${slot}`)
    .digest("hex");
}

const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless|lighthouse|pingdom|curl|wget|python|axios|node-fetch/i;

/** Robô, pré-visualizador de link ou navegador sem User-Agent: não conta. */
export function isBot(ua: string): boolean {
  return ua.trim() === "" || BOT.test(ua);
}
