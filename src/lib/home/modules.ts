/*
 * Módulos da home pública (A06). A manchete, o "Agora" e a barra de urgente são fixos (primeira
 * dobra 100% CityNews, docs/screens.md P01); os demais blocos podem mudar de ordem ou sair.
 * Sem configuração publicada, vale a ordem de `DEFAULT_HOME_MODULES` (o layout de sempre).
 */
export const HOME_MODULE_KEYS = [
  "topics",
  "collections",
  "nearby",
  "agenda_services",
  "sections",
  "most_read",
  "sources",
  "aggregated",
  "newsletter",
] as const;
export type HomeModuleKey = (typeof HOME_MODULE_KEYS)[number];

export interface HomeModule {
  key: HomeModuleKey;
  enabled: boolean;
}

export const DEFAULT_HOME_MODULES: readonly HomeModule[] = HOME_MODULE_KEYS.map((key) => ({
  key,
  enabled: true,
}));

const isKey = (v: unknown): v is HomeModuleKey =>
  typeof v === "string" && (HOME_MODULE_KEYS as readonly string[]).includes(v);

/**
 * Lista confiável a partir de JSON do banco: descarta chave desconhecida ou repetida e acrescenta,
 * ao fim e ligados, os módulos que a configuração não menciona (módulo novo nunca some da home).
 */
export function normalizeModules(raw: unknown): HomeModule[] {
  const seen = new Set<HomeModuleKey>();
  const out: HomeModule[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const { key, enabled } = item as { key?: unknown; enabled?: unknown };
      if (!isKey(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, enabled: enabled !== false });
    }
  }
  for (const key of HOME_MODULE_KEYS) if (!seen.has(key)) out.push({ key, enabled: true });
  return out;
}

/** Move o módulo de `index` uma posição (`-1` sobe, `1` desce). Nos limites, não muda. */
export function moveModule<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Só as chaves ligadas, na ordem. */
export function enabledKeys(modules: readonly HomeModule[]): HomeModuleKey[] {
  return modules.filter((m) => m.enabled).map((m) => m.key);
}
