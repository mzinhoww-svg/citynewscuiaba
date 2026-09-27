import "server-only";
import { revalidateTag } from "next/cache";
import type { Revalidate } from "./ports";

/**
 * `revalidateTag` do Next com expiração imediata (architecture §8). Chamado de rotas de servidor
 * (drain) e de Server Actions (despublicação no P4); os testes injetam um espião no lugar.
 */
export const revalidateTags: Revalidate = async (tags) => {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
};
