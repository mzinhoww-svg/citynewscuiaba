import type { StudioNavGroup } from "./StudioShell";

/** Minúsculas e sem acento: "Mídia" casa com "midia". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Chave estável de um grupo do menu ("Control Center" → "control-center"), para lembrar o estado. */
export function navGroupKey(label: string): string {
  return fold(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Filtra a navegação do Estúdio pela busca do menu (gaveta do celular e trilho do desktop). O
 * nome do grupo traz o grupo inteiro ("control" → Control Center) e o do subgrupo, os itens dele
 * ("opera" → Operação); senão ficam só os itens cujo rótulo contém a busca. Grupos sem resultado
 * saem.
 */
export function filterStudioNav(nav: StudioNavGroup[], query: string): StudioNavGroup[] {
  const q = fold(query.trim());
  if (!q) return nav;
  return nav
    .map((group) =>
      fold(group.label).includes(q)
        ? group
        : {
            ...group,
            items: group.items.filter(
              (it) => fold(it.label).includes(q) || (it.subgroup && fold(it.subgroup).includes(q)),
            ),
          },
    )
    .filter((group) => group.items.length > 0);
}
