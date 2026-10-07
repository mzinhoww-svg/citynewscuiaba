import type { Metadata } from "next";
import Link from "next/link";
import {
  Button,
  EmptyState,
  InlineAlert,
  OriginLabel,
  Panel,
  SectionHeader,
  Table,
} from "@/components";
import { ConfidenceMeter, DecisionPanel, FieldDiff, StudioScreen } from "@/components/estudio";
import {
  ARTICLE_STATUS_LABEL,
  EDITOR_TEXT,
  QUEUE_TEXT,
  RECOMMENDED_LABEL,
  REVIEW_TEXT as T,
} from "@/content/pt-BR/studio";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { nextQueueItem } from "@/lib/db/queries/queue-next";
import { getStudioArticle } from "@/lib/db/queries/studio-article";
import { diffWords } from "@/lib/diff/words";
import { formatDateTime } from "@/lib/format/date";
import { docText } from "@/lib/studio/doc";
import { originFrom, withOrigin } from "@/lib/studio/origin";
import {
  approveAction,
  rejectItemAction,
  reprocessAction,
  requestChangesAction,
} from "../../actions";
import { articleLabels } from "../../materias/view";
import { LoadError, loadOrNull } from "../../load-error";
import { queueFilterFromOrigin } from "../rows";

export const metadata: Metadata = {
  title: "Revisão de item autônomo · Estúdio · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const OPEN = new Set(["draft", "in_review", "changes_requested", "approved"]);
const FALLBACK_ORIGIN = "/estudio/fila?aba=exceptions";

type Params = Record<string, string | string[] | undefined>;

/**
 * Próximo item da lista de origem (mesma aba e filtros), com a mesma origem em `?de=`; `null`
 * sem próximo, origem fora da fila ou falha de leitura (a revisão continua sem o atalho).
 */
async function nextHrefFor(origin: string, id: string): Promise<string | null> {
  const filter = queueFilterFromOrigin(origin);
  if (!filter) return null;
  try {
    const next = await nextQueueItem(filter, id);
    return next ? withOrigin(`/estudio/fila/${next}`, origin) : null;
  } catch {
    return null;
  }
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Params>;
}) {
  const { id } = await params;
  // Lista de onde a pessoa veio (aba e filtros): "Voltar" e "Aprovar e ir para o próximo".
  const origin = originFrom((await searchParams) ?? {}, FALLBACK_ORIGIN);
  const session = await requireRole("article.edit", undefined, { next: `/estudio/fila/${id}` });
  const loaded = await loadOrNull("fila", () => getStudioArticle(id));
  if (!loaded) return <LoadError retryHref={`/estudio/fila/${id}`} />;
  const a = loaded.value;
  if (!a) {
    return (
      <EmptyState
        as="h1"
        tone="error"
        icon="circle-alert"
        title={EDITOR_TEXT.notFoundTitle}
        actions={
          <Button href={origin} size="md" variant="outline">
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
  const ai = a.aiVersion;
  const decidable = open && (canDecide || canEdit);
  const nextHref = decidable && canDecide ? await nextHrefFor(origin, a.id) : null;

  return (
    <StudioScreen
      as="article"
      // Abaixo de `xl` as ações da decisão ficam numa barra fixa: o fim da página reserva o espaço.
      className={decidable ? "max-xl:pb-36" : undefined}
      section={`${T.title} · ${a.section.name}`}
      title={a.title}
      breadcrumbs={[
        { href: origin, label: QUEUE_TEXT.queueTitle },
        { href: `/estudio/fila/${a.id}`, label: a.title },
      ]}
      intro={
        <>
          <p className="type-meta text-meta">
            {T.state}: {ARTICLE_STATUS_LABEL[a.status]} · {formatDateTime(a.updatedAt)}
          </p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={T.labels}>
            {articleLabels(a).map((l) => (
              <OriginLabel key={l.kind} label={l} />
            ))}
            <ConfidenceMeter level={a.confidence} />
          </div>
        </>
      }
    >
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
        {a.sensitive && (
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
              <Table
                caption={T.justificationTable}
                minWidth="md"
                headers={[T.stepCol, T.agent, T.promptVersion, T.rulesVersion, T.at]}
              >
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
              </Table>
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
            editHref={withOrigin(`/estudio/materias/${a.id}`, origin)}
            nextHref={nextHref}
            actions={
              decidable
                ? {
                    approve: canDecide ? approveAction.bind(null, a.version) : undefined,
                    reject: canDecide ? rejectItemAction : undefined,
                    requestChanges: canDecide ? requestChangesAction : undefined,
                    reprocess: canEdit && a.agentId ? reprocessAction : undefined,
                  }
                : undefined
            }
          />
          <Panel aria-labelledby="imagem">
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
          </Panel>
          <Panel aria-labelledby="historico">
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
          </Panel>
        </aside>
      </div>
    </StudioScreen>
  );
}
