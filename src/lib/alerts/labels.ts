import "server-only";
import { ALERTS_TEXT } from "@/content/pt-BR/alerts";
import { SECTIONS } from "@/content/pt-BR/nav";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import type { AlertKind } from "@/lib/anon/types";
import { getTopicTitle } from "@/lib/db/queries";

/**
 * Nome do alvo de um alerta, sempre do servidor (gate P2, I8): bairro e editoria das listas
 * curadas, assunto pelo título público no banco. Alvo desconhecido devolve `null`.
 */
export async function alertTargetLabel(kind: AlertKind, target: string): Promise<string | null> {
  switch (kind) {
    case "bairro":
      return NEIGHBORHOODS.find((n) => n.slug === target)?.name ?? null;
    case "tema":
      return SECTIONS.find((s) => s.id === target)?.label ?? null;
    case "assunto": {
      const r = await getTopicTitle(target);
      return r.ok ? r.value : null;
    }
    case "urgentes":
      return target === "todos" ? ALERTS_TEXT.allUrgent : null;
    case "agenda":
      return target === "todos" ? ALERTS_TEXT.allAgenda : null;
  }
}
