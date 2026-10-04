import type { Metadata } from "next";
import { FeaturedBoard, PinHistory } from "@/components/estudio";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { requireRole } from "@/lib/auth/require-role";
import { currentBoard, pinHistory } from "@/lib/studio/featured";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";
import { dismissHotAction, pinAction, reorderAction, searchAction, unpinAction } from "./actions";

export const metadata: Metadata = { title: "Destaques · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** Nome da posição no histórico: a da tabela e, em editoria, a editoria. */
function slotLabel(board: { slotKey: string; label: string; section: { slug: string } | null }[]) {
  return (slotKey: string, sectionSlug: string | null) =>
    board.find((b) => b.slotKey === slotKey && (b.section?.slug ?? null) === sectionSlug)?.label ??
    slotKey;
}

/**
 * Destaques (FD-T4): quem ocupa cada posição, fixar, trocar, remover e reordenar, com histórico
 * dos últimos 30 pinos. Admin e editor-chefe (`featured.manage`); os outros papéis recebem 403.
 */
export default async function FeaturedPage() {
  await requireRole("featured.manage", undefined, { next: "/estudio/admin/destaques" });
  const now = new Date();
  const board = await loadOrNull("destaques", () => currentBoard(now));
  const history = await loadOrNull("destaques histórico", () => pinHistory());
  return (
    <AdminScreen
      title={T.title}
      intro={T.intro}
      retryHref="/estudio/admin/destaques"
      failed={board === null}
    >
      {board && (
        <>
          <FeaturedBoard
            board={board.value}
            nowIso={now.toISOString()}
            api={{
              pin: pinAction,
              unpin: unpinAction,
              reorder: reorderAction,
              search: searchAction,
              dismiss: dismissHotAction,
            }}
          />
          {history && <PinHistory rows={history.value} slotLabel={slotLabel(board.value)} />}
        </>
      )}
    </AdminScreen>
  );
}
