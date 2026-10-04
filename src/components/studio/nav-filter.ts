import type { StudioNavGroup } from "./StudioShell";

/** Minúsculas e sem acento: "Mídia" casa com "midia". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Filtra a navegação do Estúdio pela busca do menu (gaveta do celular). O nome do grupo traz o
 * grupo inteiro ("control" → Control Center); senão ficam só os itens cujo rótulo contém a busca.
 * Grupos sem resultado saem.
 */
export function filterStudioNav(nav: StudioNavGroup[], query: string): StudioNavGroup[] {
  const q = fold(query.trim());
  if (!q) return nav;
  return nav
    .map((group) =>
      fold(group.label).includes(q)
        ? group
        : { label: group.label, items: group.items.filter((it) => fold(it.label).includes(q)) },
    )
    .filter((group) => group.items.length > 0);
}
