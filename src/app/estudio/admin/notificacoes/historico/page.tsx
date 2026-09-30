import type { Metadata } from "next";
import { Button, EmptyState, PushHistoryTable } from "@/components";
import { PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { requireAnyRole } from "@/lib/auth/require-role";
import { HISTORY_PAGE_SIZE, historyRows, parseHistoryFilter } from "@/lib/db/queries/push-admin";
import { PUSH_ADMIN_PATH } from "../../../nav";

export const metadata: Metadata = {
  title: "Histórico de notificações · Estúdio · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const BASE = `${PUSH_ADMIN_PATH}/historico`;

/** Aba 3 · Histórico (spec §10.4): filtros na URL (período, tipo, estado). */
export default async function PushHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAnyRole(["push.request", "push.approve", "push.settings"], { next: BASE });
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  const filter = parseHistoryFilter(sp);
  const r = await historyRows(filter);
  if (!r.ok)
    return (
      <EmptyState
        tone="error"
        title="Não foi possível carregar o histórico"
        actions={<Button href={BASE}>Tentar de novo</Button>}
      />
    );
  return (
    <section aria-labelledby="historico-push" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="historico-push" className="type-section text-strong">
          {T.title}
        </h2>
        <p className="type-body text-meta">{T.intro}</p>
      </div>
      <PushHistoryTable
        rows={r.value.rows}
        total={r.value.total}
        filter={filter}
        pageSize={HISTORY_PAGE_SIZE}
        basePath={BASE}
      />
    </section>
  );
}
