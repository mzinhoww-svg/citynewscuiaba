/**
 * Módulos da home (A06): ordem e ativação dos blocos abaixo da primeira dobra (manchete e
 * "Agora" são fixos, 100% CityNews). Domínio puro: a tela reordena por teclado (Alt + setas)
 * e o portal renderiza na ordem publicada (`home_layouts`, 0038).
 */
import { z } from "zod";

export const HOME_MODULE_IDS = [
  "topics",
  "collections",
  "nearby",
  "agenda_services",
  "sections",
  "most_read",
  "sources",
  "panorama",
  "newsletter",
] as const;
export type HomeModuleId = (typeof HOME_MODULE_IDS)[number];

export interface HomeModule {
  id: HomeModuleId;
  enabled: boolean;
}

const ModuleSchema = z.object({ id: z.enum(HOME_MODULE_IDS), enabled: z.boolean() });

export const defaultHomeLayout = (): HomeModule[] =>
  HOME_MODULE_IDS.map((id) => ({ id, enabled: true }));

/**
 * Lê o JSON guardado no banco: ignora ids desconhecidos e duplicados e completa os que faltam
 * (desligados no fim), para uma versão antiga nunca esconder um módulo novo sem querer.
 */
export function parseHomeLayout(value: unknown): HomeModule[] {
  const seen = new Set<HomeModuleId>();
  const out: HomeModule[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const p = ModuleSchema.safeParse(item);
      if (!p.success || seen.has(p.data.id)) continue;
      seen.add(p.data.id);
      out.push(p.data);
    }
  }
  for (const id of HOME_MODULE_IDS) if (!seen.has(id)) out.push({ id, enabled: false });
  return out;
}

/** Move um módulo uma posição; nas pontas não muda nada (devolve a mesma referência). */
export function moveModule(
  modules: readonly HomeModule[],
  id: HomeModuleId,
  dir: "up" | "down",
): HomeModule[] {
  const i = modules.findIndex((m) => m.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= modules.length) return [...modules];
  const next = [...modules];
  const a = next[i]!;
  next[i] = next[j]!;
  next[j] = a;
  return next;
}

export function toggleModule(modules: readonly HomeModule[], id: HomeModuleId): HomeModule[] {
  return modules.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m));
}

/** Rascunho válido para publicar: todos os módulos presentes uma vez e pelo menos um ligado. */
export function validateHomeLayout(modules: readonly HomeModule[]): {
  ok: boolean;
  reason?: string;
} {
  const ids = modules.map((m) => m.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "duplicate" };
  if (ids.length !== HOME_MODULE_IDS.length) return { ok: false, reason: "missing" };
  if (!modules.some((m) => m.enabled)) return { ok: false, reason: "none_enabled" };
  return { ok: true };
}

export const sameLayout = (a: readonly HomeModule[], b: readonly HomeModule[]): boolean =>
  a.length === b.length && a.every((m, i) => m.id === b[i]!.id && m.enabled === b[i]!.enabled);
