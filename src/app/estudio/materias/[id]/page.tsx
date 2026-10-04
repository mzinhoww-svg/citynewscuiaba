import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert, OriginLabel, Panel } from "@/components";
import {
  AiSuggestionInline,
  ConfidenceMeter,
  ChecklistPanel,
  CorrectionForm,
  EditorWithPublish,
  GenerateImageDrawer,
  SourcesEditor,
  ImageTextForm,
  MediaThumb,
  StudioScreen,
} from "@/components/estudio";
import {
  ARTICLE_STATUS_LABEL,
  CORRECTIONS_TEXT,
  EDITOR_TEXT as T,
  IMAGE_TEXT,
  QUEUE_TEXT,
  TOPIC_STATE_STUDIO,
} from "@/content/pt-BR/studio";
import { can, canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { listSectionOptions } from "@/lib/db/queries/queue";
import {
  currentHeadline,
  getStudioArticle,
  sourceCandidates,
  topicOptions,
} from "@/lib/db/queries/studio-article";
import { formatDateTime } from "@/lib/format/date";
import { canRequestUrgent } from "@/lib/push/permissions";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from "@/lib/studio/checklist";
import type { EditorDoc } from "@/lib/studio/doc";
import { originFrom } from "@/lib/studio/origin";
import {
  acceptSuggestionAction,
  openCorrectionAction,
  publishAction,
  publishUpdateAction,
  suggestIllustrationAction,
  rejectSuggestionAction,
  saveDraftAction,
  setImageTextAction,
  updateSourcesAction,
} from "../../actions";
import { articleLabels, originNotes } from "../view";
import { LoadError, loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Editor de matéria · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

function isDoc(v: unknown): v is EditorDoc {
  return typeof v === "object" && v !== null && (v as { type?: unknown }).type === "doc";
}

export default async function ArticleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // "Voltar" leva à lista de onde a pessoa veio (`?de=`, item 58); sem origem, à Fila.
  const backHref = originFrom(await searchParams, "/estudio/fila");
  const session = await requireRole("article.edit", undefined, { next: `/estudio/materias/${id}` });
  const loaded = await loadOrNull("materia", () => getStudioArticle(id));
  if (!loaded) return <LoadError retryHref={`/estudio/materias/${id}`} />;
  const a = loaded.value;
  if (!a) {
    return (
      <EmptyState
        as="h1"
        tone="error"
        icon="circle-alert"
        title={T.notFoundTitle}
        actions={
          <Button href={backHref} size="md" variant="outline">
            {T.back}
          </Button>
        }
      >
        {T.notFound}
      </EmptyState>
    );
  }

  const scope = {
    section: a.section.slug,
    ownerId: a.authorId ?? undefined,
    userId: session.userId,
  };
  const canEdit = can(session.roles, "article.edit", scope);
  const isPublic = a.status === "published" || a.status === "updated";
  // Texto da imagem: editoria mesmo em publicada (acessibilidade); jornalista só com a redação.
  const canEditImageText =
    can(session.roles, "article.publish", scope) ||
    (canEdit && ["draft", "in_review", "changes_requested"].includes(a.status));
  const canPublish = can(session.roles, "article.publish", scope) && !isPublic;
  const [sections, topics, candidates, headline] = await Promise.all([
    listSectionOptions(),
    topicOptions(),
    canEdit ? sourceCandidates(a) : Promise.resolve([]),
    canPublish ? currentHeadline(a.id) : Promise.resolve(null),
  ]);
  const labels = articleLabels(a);
  // Caminho de volta para a lista de origem (item 58; `originFrom` quando houver `?de=`).
  const body: EditorDoc = isDoc(a.body) ? a.body : { type: "doc", content: [] };

  const sidebar = (
    <>
      <ChecklistPanel items={a.checklist.items} complete={a.checklist.complete} />
      <Panel aria-labelledby="imagem-da-materia" className="flex flex-col gap-4">
        <h2 id="imagem-da-materia" className="type-section text-strong">
          {IMAGE_TEXT.title}
        </h2>
        {a.images.length === 0 ? (
          <p className="type-body text-meta">{IMAGE_TEXT.none}</p>
        ) : (
          a.images.map((img) => (
            <div key={img.mediaId} className="flex flex-col gap-3">
              <MediaThumb
                src={`/api/estudio/midia/${img.mediaId}`}
                alt={img.alt ?? ""}
                className="max-w-sm"
              />
              <ImageTextForm
                key={img.mediaId}
                articleId={a.id}
                mediaId={img.mediaId}
                alt={img.alt}
                caption={img.caption}
                heading={img.credit ?? img.license}
                save={canEditImageText ? setImageTextAction : undefined}
              />
            </div>
          ))
        )}
      </Panel>
      {canEdit && !isPublic && (
        <GenerateImageDrawer articleId={a.id} suggest={suggestIllustrationAction} />
      )}
      <AiSuggestionInline
        articleId={a.id}
        baseVersion={a.version}
        suggestions={a.suggestions}
        apply={canEdit && !isPublic ? acceptSuggestionAction : undefined}
        discard={canEdit && !isPublic ? rejectSuggestionAction : undefined}
      />
      <SourcesEditor
        key={`fontes:${a.version}:${a.sources.map((s) => `${s.itemId}${s.role}${s.confirmed}`).join()}`}
        articleId={a.id}
        sources={a.sources}
        candidates={candidates}
        centralConflict={a.centralConflict}
        now={new Date().toISOString()}
        save={canEdit && canAccess(session.roles, "article.edit") ? updateSourcesAction : undefined}
      />
    </>
  );

  return (
    <StudioScreen
      as="article"
      section={`${T.title} · ${a.section.name}`}
      title={a.title}
      breadcrumbs={[
        { href: backHref, label: QUEUE_TEXT.queueTitle },
        { href: `/estudio/materias/${a.id}`, label: a.title },
      ]}
      intro={
        <>
          {a.topic && (
            <p className="type-meta text-meta" title={TOPIC_STATE_STUDIO.auto}>
              {TOPIC_STATE_STUDIO.line(a.topic.title, TOPIC_STATE_STUDIO.state[a.topic.state])}
            </p>
          )}
          <p className="type-meta text-meta">
            {T.statusLine(ARTICLE_STATUS_LABEL[a.status], a.version)}
            {a.authorName ? ` · ${a.authorName}` : ""} · {formatDateTime(a.updatedAt)}
          </p>
          <div className="flex flex-wrap items-center gap-2" aria-label={T.labels} role="group">
            {labels.map((l) => (
              <OriginLabel key={l.kind} label={l} />
            ))}
            <ConfidenceMeter level={a.confidence} />
          </div>
        </>
      }
      actions={
        <Button
          href={`/estudio/materias/${a.id}/versoes`}
          size="sm"
          variant="outline"
          icon="history"
        >
          {T.openHistory}
        </Button>
      }
    >
      {isPublic && canEdit ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col gap-4">
            <InlineAlert tone="info" role="none" title={CORRECTIONS_TEXT.updateMode}>
              {CORRECTIONS_TEXT.updateModeIntro}
            </InlineAlert>
            {can(session.roles, "correction.manage", scope) && (
              <form action={openCorrectionAction}>
                <input type="hidden" name="articleId" value={a.id} />
                <Button type="submit" size="md" variant="outline" icon="pencil">
                  {CORRECTIONS_TEXT.openFromEditor}
                </Button>
              </form>
            )}
            {can(session.roles, "article.publish", scope) ? (
              <CorrectionForm
                key={a.id}
                mode="update"
                targetId={a.id}
                baseVersion={a.version}
                userId={session.userId}
                initial={{ title: a.title, dek: a.dek, body }}
                submit={publishUpdateAction}
              />
            ) : null}
          </div>
          <aside className="flex flex-col gap-4" aria-label={T.title}>
            {sidebar}
          </aside>
        </div>
      ) : (
        <EditorWithPublish
          key={a.id}
          editor={{
            articleId: a.id,
            baseVersion: a.version,
            userId: session.userId,
            initial: {
              title: a.title,
              dek: a.dek,
              body,
              sectionSlug: a.section.slug,
              topicId: a.topic?.id ?? null,
              tags: a.tags,
              neighborhoods: a.neighborhoods,
              seoTitle: a.seoTitle ?? "",
              seoDescription: a.seoDescription ?? "",
            },
            origins: originNotes(a),
            options: { sections, topics },
            readOnly: !canEdit || isPublic,
            notice: !canEdit ? (
              <InlineAlert tone="info" role="none">
                {T.readonly}
              </InlineAlert>
            ) : isPublic ? (
              <InlineAlert tone="warn" role="none">
                {T.publishedNeedsMode}
              </InlineAlert>
            ) : undefined,
            save: canEdit && !isPublic ? saveDraftAction : undefined,
            seoLimits: { title: SEO_TITLE_MAX, description: SEO_DESCRIPTION_MAX },
            savedAt: a.updatedAt,
          }}
          publish={
            canPublish
              ? {
                  articleId: a.id,
                  blocker: a.checklist.blocker,
                  labels: articleLabels({ ...a, publishMode: "human" }),
                  hasTopic: a.topic !== null,
                  headline,
                  canRequestUrgent: canRequestUrgent(session.roles),
                  action: publishAction,
                }
              : undefined
          }
          asideLabel={T.title}
        >
          {sidebar}
        </EditorWithPublish>
      )}
    </StudioScreen>
  );
}
