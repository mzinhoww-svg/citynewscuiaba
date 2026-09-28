import type { Metadata } from "next";
import Link from "next/link";
import {
  Button,
  ConfidenceMeter,
  DecisionPanel,
  EmptyState,
  FieldDiff,
  InlineAlert,
  OriginLabel,
  SectionHeader,
} from "@/components";
import {
  ARTICLE_STATUS_LABEL,
  EDITOR_TEXT,
  RECOMMENDED_LABEL,
  REVIEW_TEXT as T,
} from "@/content/pt-BR/studio";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { getStudioArticle } from "@/lib/db/queries/studio-article";
import { diffWords } from "@/lib/diff/words";
import { formatDateTime } from "@/lib/format/date";
import { docText } from "@/lib/studio/doc";
import {
  approveAction,
  rejectItemAction,
  reprocessAction,
  requestChangesAction,
} from "../../actions";
import { articleLabels } from "../../materias/view";

export const metadata: Metadata = {
  title: "Revisão de item autônomo · Estúdio · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const OPEN = new Set(["draft", "in_review", "changes_requested", "approved"]);

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("article.edit", undefined, { next: `/estudio/fila/${id}` });
  const a = await getStudioArticle(id);
  if (!a) {
    return (
      <EmptyState
        as="h1"
        tone="error"
        icon="circle-alert"
        title={EDITOR_TEXT.notFoundTitle}
        actions={
          <Button href="/estudio/fila?aba=exceptions" size="md" variant="outline">
            {EDITOR_TEXT.back}
          </Button>
        }
      >
        {EDITOR_TEXT.notFound}
      </EmptyState>
    );
  }

  const scope = {
    section: a.section.slug,
    ownerId: a.authorId ?? undefined,
    userId: session.userId,
  };
  const canDecide = can(session.roles, "article.publish", scope);
  const canEdit = can(session.roles, "article.edit", scope);
  const open = OPEN.has(a.status);
  const rules = a.decisions.find((d) => d.step === "rules");
  const human = a.decisions.find((d) => d.humanDecision);
  const sensitive = a.section.slug === "seguranca";
  const ai = a.aiVersion;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/estudio/fila?aba=exceptions"
          className="type-meta font-medium text-link underline-offset-4 hover:underline"
        >
          {EDITOR_TEXT.back}
        </Link>
        <p className="type-eyebrow text-eyebrow">
          {T.title} · {a.section.name}
        </p>
        <h1 className="type-screen-title text-strong">{a.title}</h1>
        <p className="type-meta text-meta">
          {T.state}: {ARTICLE_STATUS_LABEL[a.status]} · {formatDateTime(a.updatedAt)}
        </p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={T.labels}>
          {articleLabels(a).map((l) => (
            <OriginLabel key={l.kind} label={l} />
          ))}
          <ConfidenceMeter level={a.confidence} />
        </div>
      </header>

      <section aria-labelledby="alertas" className="flex flex-col gap-2">
        <h2 id="alertas" className="sr-only">
          {T.alerts}
        </h2>
        {a.reviewReason && (
          <InlineAlert tone="info" role="none" title={T.reason}>
            {a.reviewReason}
          </InlineAlert>
        )}
        {a.aiFallback && (
          <InlineAlert tone="warn" role="none">
            {T.aiFallbackAlert}
          </InlineAlert>
        )}
        {sensitive && (
          <InlineAlert tone="warn" role="none">
            {T.sensitiveAlert}
          </InlineAlert>
        )}
        {a.centralConflict && (
          <InlineAlert tone="warn" role="none">
            {EDITOR_TEXT.conflictAlert}
          </InlineAlert>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="campos" className="flex flex-col gap-2">
            <SectionHeader id="campos" title={T.fields} as="h2" />
            <p className="type-meta text-meta">{T.fieldsIntro}</p>
            {ai ? (
              <FieldDiff
                fields={[
                  { label: EDITOR_TEXT.fields.title, parts: diffWords(ai.title, a.title) },
                  { label: EDITOR_TEXT.fields.dek, parts: diffWords(ai.dek, a.dek) },
                  {
                    label: EDITOR_TEXT.fields.body,
                    parts: diffWords(docText(ai.body), docText(a.body)),
                  },
                ]}
              />
            ) : (
              <p className="type-body text-meta">{T.noAiVersion}</p>
            )}
          </section>

          <section aria-labelledby="fontes" className="flex flex-col gap-2">
            <SectionHeader id="fontes" title={T.sourcesTitle} as="h2" />
            {a.sources.length === 0 ? (
              <p className="type-body text-meta">{EDITOR_TEXT.noSources}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white">
                {a.sources.map((s) => (
                  <li key={s.itemId} className="flex flex-col gap-1 p-3">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                    >
                      {s.title}
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                    <span className="type-meta text-meta">
                      {s.sourceName} · {EDITOR_TEXT.sourceRole[s.role]} ·{" "}
                      {s.confirmed ? EDITOR_TEXT.sourceConfirmed : EDITOR_TEXT.sourceUnconfirmed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="justificativa" className="flex flex-col gap-2">
            <SectionHeader id="justificativa" title={T.justification} as="h2" />
            {a.decisions.length === 0 ? (
              <p className="type-body text-meta">{T.noDecisions}</p>
            ) : (
              <div
                role="region"
                aria-label={T.justificationTable}
                tabIndex={0}
                className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
              >
                <table className="w-full min-w-[40rem] border-collapse text-left">
                  <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        {T.stepCol}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {T.agent}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {T.promptVersion}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {T.rulesVersion}
                      </th>
                      <th scope="col" className="px-3 py-2">
                        {T.at}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.decisions.map((d, i) => (
                      <tr key={i} className="border-b border-line-subtle align-top last:border-b-0">
                        <th scope="row" className="px-3 py-2 font-normal">
                          <span className="type-body font-semibold text-strong">
                            {T.step[d.step] ?? d.step}
                            {d.humanDecision
                              ? ` · ${T.humanDecision[d.humanDecision] ?? d.humanDecision}`
                              : ""}
                          </span>
                          {d.rationale && (
                            <span className="block type-meta text-meta">{d.rationale}</span>
                          )}
                          {d.humanName && (
                            <span className="block type-meta text-meta">{d.humanName}</span>
                          )}
                        </th>
                        <td className="px-3 py-2 type-body">{d.agentId ?? "—"}</td>
                        <td className="px-3 py-2 type-body tabular-nums">
                          {d.promptVersion !== null ? `v${d.promptVersion}` : "—"}
                        </td>
                        <td className="px-3 py-2 type-body tabular-nums">
                          {d.rulesVersion !== null ? `v${d.rulesVersion}` : "—"}
                        </td>
                        <td className="px-3 py-2 type-body tabular-nums">
                          {formatDateTime(d.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label={T.actions}>
          <DecisionPanel
            articleId={a.id}
            recommended={
              rules?.recommended
                ? {
                    label: RECOMMENDED_LABEL[rules.recommended] ?? rules.recommended,
                    rationale: rules.rationale,
                  }
                : null
            }
            human={
              human?.humanDecision
                ? {
                    label: T.humanDecision[human.humanDecision] ?? human.humanDecision,
                    by: human.humanName,
                    at: formatDateTime(human.createdAt),
                  }
                : null
            }
            blocker={a.checklist.blocker}
            editHref={`/estudio/materias/${a.id}`}
            actions={
              open && (canDecide || canEdit)
                ? {
                    approve: canDecide ? approveAction : undefined,
                    reject: canDecide ? rejectItemAction : undefined,
                    requestChanges: canDecide ? requestChangesAction : undefined,
                    reprocess: canEdit && a.agentId ? reprocessAction : undefined,
                  }
                : undefined
            }
          />
          <section
            aria-labelledby="imagem"
            className="rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 id="imagem" className="type-section text-strong">
              {T.image}
            </h2>
            {a.images.length === 0 ? (
              <p className="mt-2 type-body text-meta">{T.noImage}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {a.images.map((img) => (
                  <li key={img.mediaId} className="type-body">
                    <Link
                      href={`/estudio/midia/${img.mediaId}`}
                      className="font-semibold text-strong underline-offset-4 hover:underline"
                    >
                      {img.credit ?? img.license}
                    </Link>
                    <span className="block type-meta text-meta">{img.rationale}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            aria-labelledby="historico"
            className="rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 id="historico" className="type-section text-strong">
              {T.history}
            </h2>
            <ol className="mt-2 flex flex-col gap-2">
              {a.versions.map((v) => (
                <li key={v.number} className="type-body">
                  <span className="font-semibold text-strong">v{v.number}</span> ·{" "}
                  {v.origin === "ai" ? T.fieldAi : T.fieldHuman}
                  {v.authorName ? ` · ${v.authorName}` : ""}
                  <span className="block type-meta text-meta">{formatDateTime(v.createdAt)}</span>
                </li>
              ))}
            </ol>
            <Button
              href={`/estudio/materias/${a.id}/versoes`}
              size="sm"
              variant="text"
              className="mt-2"
            >
              {EDITOR_TEXT.openHistory}
            </Button>
          </section>
        </aside>
      </div>
    </article>
  );
}
