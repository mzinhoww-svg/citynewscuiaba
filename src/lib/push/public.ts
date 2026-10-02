/**
 * Chave pública VAPID embutida no bundle do navegador (`NEXT_PUBLIC_*` lida por nome literal).
 * `null` sem chave: o cliente não oferece avisos (D-P25).
 */
export const VAPID_PUBLIC_KEY: string | null =
  typeof process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY === "string" &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim().length >= 80
    ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim()
    : null;
