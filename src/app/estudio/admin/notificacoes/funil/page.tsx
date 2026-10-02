import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert } from "@/components";
import { FunnelChart } from "@/components/estudio";
import { FUNNEL_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { requireRole } from "@/lib/auth/require-role";
import { funnelData } from "@/lib/db/queries/push-funnel";
import { formatCount, parseFunnelFilter } from "@/lib/push/funnel";
import { PUSH_ADMIN_PATH } from "../../../nav";
import { FunnelFilters } from "./FunnelFilters";

export const metadata: Metadata = { title: "Funil do app · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const BASE = `${PUSH_ADMIN_PATH}/funil`;

function SideStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line-section bg-card-white px-4 py-3">
      <dt className="type-meta text-meta">{label}</dt>
      <dd className="type-section text-strong">{value}</dd>
      {hint && <dd className="type-meta text-meta">{hint}</dd>}
    </div>
  );
}

/** Funil do app (spec §10.6): filtros na URL, gráfico + tabela + resumo, blocos laterais. Só push.metrics. */
export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("push.metrics", undefined, { next: BASE });
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") sp.set(k, v);
  const filter = parseFunnelFilter(sp);
  const r = await funnelData(filter);
  if (!r.ok)
    return (
      <EmptyState
        tone="error"
        title="Não foi possível carregar o funil"
        actions={<Button href={BASE}>Tentar de novo</Button>}
      />
    );
  const d = r.value;
  return (
    <section aria-labelledby="funil-app" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="funil-app" className="type-section text-strong">
          {T.title}
        </h2>
        <p className="type-body text-meta">{T.intro}</p>
      </div>
      <InlineAlert tone="info" role="none">
        {T.notice}
      </InlineAlert>
      <FunnelFilters filter={filter} basePath={BASE} />
      {d.empty ? (
        <EmptyState title={T.empty} icon="chart-column">
          {T.emptyHint}
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <FunnelChart rows={d.rows} summary={d.summary} />
          <aside className="flex flex-col gap-4" aria-label={T.side.outside}>
            <dl className="flex flex-col gap-3">
              <SideStat label={T.side.outInstall} value={formatCount(d.side.out_install)} />
              <SideStat label={T.side.outPermission} value={formatCount(d.side.out_permission)} />
              <SideStat
                label={T.side.denied}
                value={formatCount(d.side.denied)}
                hint={T.side.deniedHint}
              />
              <SideStat
                label={T.side.sentTotal}
                value={formatCount(d.side.sent_total)}
                hint={T.side.sentTotalHint}
              />
            </dl>
            <section
              aria-labelledby="ativas-navegador"
              className="flex flex-col gap-2 rounded-lg border border-line-section bg-card-white px-4 py-3"
            >
              <h3 id="ativas-navegador" className="type-meta text-meta">
                {T.side.active}
              </h3>
              {d.activeByBrowser.length === 0 ? (
                <p className="type-body text-meta">{T.side.activeNone}</p>
              ) : (
                <ul className="flex flex-col gap-1 type-body text-strong">
                  {d.activeByBrowser.map((b) => (
                    <li key={b.browser} className="flex justify-between gap-3">
                      <span>{T.browsers[b.browser as keyof typeof T.browsers] ?? b.browser}</span>
                      <span>{formatCount(b.n)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
