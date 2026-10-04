import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, Icon } from "@/components";
import { PushBreakdown, PushStatusBadge, PushTimeline } from "@/components/estudio";
import { clockTime, fullDateTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT, PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { requireAnyRole } from "@/lib/auth/require-role";
import { historyDetail } from "@/lib/db/queries/push-admin";
import { PUSH_ADMIN_PATH } from "../../../../nav";

export const metadata: Metadata = { title: "Envio · Notificações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const BASE = `${PUSH_ADMIN_PATH}/historico`;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-line-section bg-card-white px-4 py-3">
      <dt className="type-meta text-meta">{label}</dt>
      <dd className="type-section text-strong">{value}</dd>
    </div>
  );
}

/** Detalhe do envio (spec §10.4): linha do tempo, números, pulos, falhas e detalhamento. */
export default async function PushHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAnyRole(["push.request", "push.approve", "push.settings"], {
    next: `${BASE}/${id}`,
  });
  const r = await historyDetail(id);
  if (!r.ok)
    return (
      <EmptyState
        tone="error"
        title="Não foi possível carregar o envio"
        actions={<Button href={`${BASE}/${id}`}>Tentar de novo</Button>}
      />
    );
  const d = r.value;
  if (!d) notFound();
  const C = T.columns;
  return (
    <article className="flex flex-col gap-6">
      <Link
        href={BASE}
        className="inline-flex items-center gap-1 type-meta text-link no-underline hover:underline"
      >
        <Icon name="arrow-left" size={16} />
        {T.detail.back}
      </Link>
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow text-meta">{PUSH_ADMIN_TEXT.kind[d.kind]}</p>
        <h2 className="type-section text-strong">{d.title}</h2>
        <p className="type-body text-body">
          {d.originLabel} · {d.body}
        </p>
        <p className="type-body text-meta">
          {d.article.slug ? (
            <Link
              href={`/materia/${d.article.slug}`}
              className="text-link underline-offset-4 hover:underline"
            >
              {d.article.title}
            </Link>
          ) : (
            d.article.title
          )}{" "}
          · {d.audienceLabel}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body text-strong">
          <PushStatusBadge status={d.status} reason={d.statusReason} />
          <span>{T.detail.requestedBy(d.requestedBy?.name ?? T.system)}</span>
          {d.approvedBy && d.approvedAt && (
            <span>{T.detail.approvedBy(d.approvedBy.name, clockTime(d.approvedAt))}</span>
          )}
          {d.scheduledAt && <span>{fullDateTime(d.scheduledAt)}</span>}
        </p>
        {d.justification && <p className="type-meta text-meta">{d.justification}</p>}
      </header>

      <section aria-labelledby="linha-do-tempo" className="flex flex-col gap-3">
        <h3 id="linha-do-tempo" className="type-label text-strong">
          {T.detail.timeline}
        </h3>
        <PushTimeline items={d.timeline} />
      </section>

      <section aria-labelledby="numeros" className="flex flex-col gap-3">
        <h3 id="numeros" className="type-label text-strong">
          {T.detail.numbers}
        </h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={C.targets} value={d.targets} />
          <Stat label={C.sent} value={d.sent} />
          <Stat label={C.accepted} value={d.accepted} />
          <Stat label={C.failed} value={d.failed} />
          <Stat label={C.removed} value={d.removed} />
          <Stat label={C.skipped} value={d.skipped} />
          <Stat label={C.delivered} value={d.delivered} />
          <Stat label={C.clicked} value={d.clicked} />
        </dl>
        <p className="type-meta text-meta">{T.ctrNote}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h4 className="type-meta font-semibold text-strong">{T.detail.skips}</h4>
            {d.skips.length === 0 ? (
              <p className="type-body text-meta">{T.detail.noSkips}</p>
            ) : (
              <ul className="flex flex-col gap-1 type-body text-strong">
                {d.skips.map((s) => (
                  <li key={s.reason}>
                    {T.detail.skipReason[s.reason] ?? s.reason}: {s.n}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="type-meta font-semibold text-strong">{T.detail.failures}</h4>
            {d.failures.length === 0 ? (
              <p className="type-body text-meta">{T.detail.noFailures}</p>
            ) : (
              <ul className="flex flex-col gap-1 type-body text-strong">
                {d.failures.map((f) => (
                  <li key={f.code}>
                    {f.code}: {f.n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="detalhamento" className="flex flex-col gap-3">
        <h3 id="detalhamento" className="type-label text-strong">
          {T.detail.breakdown}
        </h3>
        <PushBreakdown rows={d.byDevice} />
      </section>
    </article>
  );
}
