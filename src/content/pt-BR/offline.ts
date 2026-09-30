/**
 * Textos da leitura offline (P25 "Sem conexão", faixa de cópia antiga) e do aviso genérico do
 * service worker (spec 2026-09-28 §7.7, §7.8, §8.4). Usados pela página `/offline.html`
 * (via `public/offline.js`), pelo `OfflineNotice` e pelo SW.
 */
export const OFFLINE_TEXT = {
  brand: "CityNews Cuiabá",
  title: "Sem conexão",
  intro: "Você está sem internet. Estas páginas estão guardadas neste aparelho:",
  pages: "Páginas",
  saved: "Salvas",
  read: "Lidas recentemente",
  empty: "Nada guardado ainda. Com internet, as páginas que você abrir ficam disponíveis aqui.",
  retry: "Tentar de novo",
  /** Rótulo de cópia antiga: `staleLabel` monta "Salva às 14h32, pode estar desatualizada." */
  staleNotice: "pode estar desatualizada.",
  savedAt: "Salva às",
  savedOn: "Salva em",
  backOnline: "Conexão de volta.",
  refresh: "Atualizar",
} as const;

/** Aviso genérico quando o payload é inválido (spec §8.4): nunca perder a permissão. */
export const SW_TEXT = {
  genericTitle: "CityNews",
  genericBody: "Há novidades no CityNews.",
} as const;
