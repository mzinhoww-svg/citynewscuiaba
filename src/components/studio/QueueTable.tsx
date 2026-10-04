"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  ARTICLE_STATUS_LABEL,
  CONFIDENCE_LABEL,
  QUEUE_TEXT as T,
  RECOMMENDED_LABEL,
} from "@/content/pt-BR/studio";
import { REVIEW_BULK_TEXT as R } from "@/content/pt-BR/studio-review";
import { QUEUE_FLOW_TEXT as F } from "@/content/pt-BR/studio-flow";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { ForcedPublishDialog, type ForcedPublishApi } from "./ForcedPublishDialog";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import type { IconName } from "../ui/Icon";

export type QueueStatus = keyof typeof ARTICLE_STATUS_LABEL;

export interface QueueTableRow {
  id: string;
  title: string;
  href: string;
  sectionName: string;
  status: QueueStatus;
  publishMode: "human" | "auto" | null;
  confidence: keyof typeof CONFIDENCE_LABEL;
  fromPipeline: boolean;
  aiFallback: boolean;
  sensitive: boolean;
  recommended: string | null;
  recommendedRationale: string | null;
  reviewReason: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  overdue: boolean;
  /** Pode despublicar (automática publicada e papel com `article.unpublish_auto`). */
  canUnpublish: boolean;
  /** Âncora do primeiro item novo depois de "Carregar mais" (recebe o foco). */
  anchorId?: string;
}

export interface ActionReply {
  ok: boolean;
  message: string;
}

/** Estado da matéria como selo (item 56): tom + ícone + texto, nunca só cor. */
const STATUS_LOOK: Record<QueueStatus, { tone: StatusTone; icon: IconName }> = {
  draft: { tone: "neutral", icon: "pencil" },
  in_review: { tone: "info", icon: "eye" },
  changes_requested: { tone: "warn", icon: "circle-alert" },
  approved: { tone: "success", icon: "check" },
  scheduled: { tone: "info", icon: "clock" },
  published: { tone: "success", icon: "check" },
  updated: { tone: "success", icon: "refresh-cw" },
  archived: { tone: "neutral", icon: "archive" },
  unpublished: { tone: "danger", icon: "ban" },
};

/** Rotas das regras que recomendam publicar (decisions.recommended). */
const PUBLISH_ROUTES = new Set(["publish", "publish_notify"]);
const DECIDABLE = new Set<QueueStatus>(["draft", "in_review", "changes_requested", "approved"]);

/** Linha que "Aprovar recomendadas" aprova: aberta e com recomendação de publicar. */
export function isRecommendedToPublish(r: Pick<QueueTableRow, "status" | "recommended">): boolean {
  return r.recommended !== null && PUBLISH_ROUTES.has(r.recommended) && DECIDABLE.has(r.status);
}

export interface QueueTableProps {
  rows: QueueTableRow[];
  /** Ações em lote; ausente = sem seleção (papel sem gestão da mesa). */
  bulk?: {
    assignees: { id: string; name: string }[];
    assign: (i: { ids: string[]; userId: string | null }) => Promise<ActionReply>;
    requestReview: (i: { ids: string[] }) => Promise<ActionReply>;
    unpublishMany?: (i: { ids: string[]; reason: string }) => Promise<ActionReply>;
    /**
     * "Selecionar tudo" e "Publicar mesmo assim" (REV-T1): `reviewTotal` são todas as matérias em
     * revisão nas abas e filtros atuais (todas as páginas); `filter` as identifica no servidor.
     */
    forcePublish?: { reviewTotal: number; filter: Record<string, string>; api: ForcedPublishApi };
    /**
     * "Aprovar recomendadas" (item 46): publica as selecionadas que as regras recomendaram
     * publicar; o servidor confere de novo e devolve as que pulou com o motivo.
     */
    approveRecommended?: (i: { ids: string[] }) => Promise<ActionReply>;
  };
  unpublish?: (i: { id: string; title: string; reason: string }) => Promise<ActionReply>;
  /** Estado vazio no lugar da tabela; a região de status continua montada (ex.: depois de
   *  despublicar a última automática, "Despublicada" segue visível). */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela da fila (E01/E02): matéria com editoria e marcas (pipeline, sem IA, tema sensível),
 * estado (selo), recomendação das regras com a justificativa visível em uma linha ("Ver mais"
 * abre o resto), responsável, prazo e ações. Seleção para ações em lote e despublicação de
 * automáticas com motivo obrigatório (diálogo). Resultado em `role="status"`.
 * A barra de lote só aparece com seleção e fica presa ao rodapé enquanto a lista rola (item 56).
 * Abaixo de `md` cada linha vira um cartão (mesma marcação, sem rolagem lateral).
 */
export function QueueTable({ rows, bulk, unpublish, empty, className }: QueueTableProps) {
  const router = useRouter();
  const uid = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [target, setTarget] = useState<QueueTableRow | null>(null);
  const [bulkUnpublish, setBulkUnpublish] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [pending, start] = useTransition();
  const [allMatching, setAllMatching] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);

  const force = bulk?.forcePublish;
  const ids = [...selected];
  // "Selecionar tudo" pega as que estão em revisão (as únicas que a publicação forçada aceita).
  const eligible = rows.filter((r) => (force ? r.status === "in_review" : true));
  const pageAllSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.id));
  const pageSomeSelected = eligible.some((r) => selected.has(r.id));
  const selectionCount = allMatching && force ? force.reviewTotal : ids.length;
  const togglePage = (on: boolean) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of eligible) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };
  const toggle = (id: string, on: boolean) => {
    setAllMatching(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const finish = (r: ActionReply) => {
    setStatus(r);
    if (r.ok) {
      setSelected(new Set());
      setAllMatching(false);
    }
    router.refresh();
  };

  const closeDialog = () => {
    setTarget(null);
    setBulkUnpublish(false);
    setReason("");
    setReasonError(null);
  };

  const confirmUnpublish = () => {
    if (!reason.trim()) {
      setReasonError(T.reasonRequired);
      return;
    }
    start(async () => {
      let r: ActionReply | null = null;
      if (target && unpublish) r = await unpublish({ id: target.id, title: target.title, reason });
      else if (bulkUnpublish && bulk?.unpublishMany)
        r = await bulk.unpublishMany({ ids: autoSelected, reason });
      closeDialog();
      if (r) finish(r);
    });
  };

  const autoSelected = rows.filter((r) => selected.has(r.id) && r.canUnpublish).map((r) => r.id);
  const dialogOpen = target !== null || bulkUnpublish;
  const recommendable = bulk?.approveRecommended ? rows.filter(isRecommendedToPublish) : [];
  const recommendedSelected = recommendable.filter((r) => selected.has(r.id)).map((r) => r.id);
  const selectRecommended = () => {
    setAllMatching(false);
    setSelected((prev) => new Set([...prev, ...recommendable.map((r) => r.id)]));
  };
  const showBar = bulk !== undefined && selectionCount > 0;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <p role="status" aria-live="polite" className="min-h-6 type-body">
        {status && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              status.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>

      {rows.length === 0 && empty ? (
        empty
      ) : (
        <>
          {recommendable.length > 0 && (
            <div>
              <Button size="sm" variant="outline" icon="check" onClick={selectRecommended}>
                {F.selectRecommended(recommendable.length)}
              </Button>
            </div>
          )}

          <div
            role="region"
            aria-label={T.scrollRegion}
            tabIndex={0}
            className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full border-collapse text-left max-md:block md:min-w-[56rem]">
              <caption className="sr-only">{T.caption}</caption>
              <thead
                className={cx(
                  "border-b border-line-subtle bg-section max-md:block",
                  !bulk && "max-md:hidden",
                )}
              >
                <tr className="type-meta text-meta max-md:flex max-md:items-center">
                  {bulk && (
                    <th scope="col" className="w-12 px-3 py-3 max-md:w-auto max-md:py-1">
                      <label className="flex min-h-tap cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          aria-label={force ? R.selectAllPage : T.col.select}
                          checked={pageAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = pageSomeSelected && !pageAllSelected;
                          }}
                          disabled={eligible.length === 0}
                          onChange={(e) => togglePage(e.target.checked)}
                          className="size-5 accent-(--action-primary)"
                        />
                        <span aria-hidden="true" className="type-body text-strong md:hidden">
                          {F.selectAll}
                        </span>
                      </label>
                    </th>
                  )}
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    {T.col.title}
                  </th>
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    {T.col.status}
                  </th>
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    {T.col.recommended}
                  </th>
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    {T.col.assignee}
                  </th>
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    {T.col.due}
                  </th>
                  <th scope="col" className="px-3 py-3 max-md:hidden">
                    <span className="sr-only">{T.col.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="max-md:block">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    id={r.anchorId}
                    tabIndex={r.anchorId ? -1 : undefined}
                    className={cx(
                      "border-b border-line-subtle align-top last:border-b-0",
                      "max-md:relative max-md:flex max-md:flex-col max-md:gap-2 max-md:p-3",
                      bulk && "max-md:pl-14",
                    )}
                  >
                    {bulk && (
                      <td className="px-3 py-1.5 max-md:absolute max-md:top-1.5 max-md:left-1 max-md:p-0">
                        <Checkbox
                          name="selecionada"
                          label={<span className="sr-only">{T.selectRow(r.title)}</span>}
                          checked={selected.has(r.id)}
                          onChange={(on) => toggle(r.id, on)}
                          className="px-0.5"
                        />
                      </td>
                    )}
                    <th
                      scope="row"
                      className="max-w-md px-3 py-3 font-normal max-md:max-w-none max-md:p-0"
                    >
                      <Link
                        href={r.href}
                        className="type-body font-semibold text-strong underline-offset-4 hover:underline"
                      >
                        {r.title}
                      </Link>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-meta">
                        <span>{r.sectionName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{CONFIDENCE_LABEL[r.confidence]} confiança</span>
                        {r.fromPipeline && <Tag icon="layers">{T.pipeline}</Tag>}
                        {r.publishMode === "auto" && <Tag icon="refresh-cw">{T.auto}</Tag>}
                        {r.aiFallback && <Tag icon="circle-alert">{T.aiFallback}</Tag>}
                        {r.sensitive && (
                          <Tag icon="triangle-alert" tone="warn">
                            {T.sensitive}
                          </Tag>
                        )}
                      </span>
                      {r.reviewReason && (
                        <span className="mt-1 block type-meta text-meta">{r.reviewReason}</span>
                      )}
                    </th>
                    <td className="px-3 py-3 max-md:p-0">
                      <StatusBadge {...STATUS_LOOK[r.status]}>
                        {ARTICLE_STATUS_LABEL[r.status]}
                      </StatusBadge>
                    </td>
                    <td className="max-w-xs px-3 py-3 type-body max-md:max-w-none max-md:p-0">
                      <CellLabel>{F.cell.recommended}</CellLabel>
                      {r.recommended ? (
                        <span className="text-ai">
                          {RECOMMENDED_LABEL[r.recommended] ?? r.recommended}
                        </span>
                      ) : (
                        <span className="text-meta">{T.noRecommendation}</span>
                      )}
                      {r.recommended && r.recommendedRationale && (
                        <Rationale text={r.recommendedRationale} />
                      )}
                    </td>
                    <td className="px-3 py-3 type-body max-md:p-0">
                      <CellLabel>{F.cell.assignee}</CellLabel>
                      {r.assigneeName ?? <span className="text-meta">{T.noAssignee}</span>}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums max-md:p-0">
                      <CellLabel>{F.cell.due}</CellLabel>
                      {r.dueAt ? (
                        <span
                          className={cx(
                            "flex flex-col gap-1 max-md:inline-flex max-md:flex-row max-md:flex-wrap max-md:gap-x-2",
                            r.overdue ? "font-semibold text-danger" : "text-strong",
                          )}
                        >
                          {r.overdue && (
                            <span className="inline-flex items-center gap-1 type-meta">
                              <Icon name="clock" size={16} />
                              {T.overdue}
                            </span>
                          )}
                          <span>{formatDateTime(r.dueAt)}</span>
                        </span>
                      ) : (
                        <span className="text-meta">{T.noDue}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-md:p-0 max-md:empty:hidden">
                      {r.canUnpublish && unpublish && (
                        <Button size="sm" variant="outline" onClick={() => setTarget(r)}>
                          {T.unpublish}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bulk && showBar && (
            <div className="sticky bottom-0 z-sticky bg-page pb-safe">
              <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-line-control bg-card-white p-4">
                <legend className="sr-only">{T.bulkLabel}</legend>
                <p className="w-full type-meta text-meta" aria-live="polite">
                  {T.bulkLabel} · {T.bulkSelected(selectionCount)}
                </p>
                <Select
                  id={`${uid}-assignee`}
                  name="responsavel"
                  label={T.assignTo}
                  options={[
                    { value: "", label: T.noAssignee },
                    ...bulk.assignees.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  value={assignee}
                  onChange={setAssignee}
                  className="min-w-56"
                />
                <Button
                  size="md"
                  variant="outline"
                  disabled={ids.length === 0 || pending}
                  onClick={() =>
                    start(async () => finish(await bulk.assign({ ids, userId: assignee || null })))
                  }
                >
                  {T.assignButton}
                </Button>
                <Button
                  size="md"
                  variant="outline"
                  disabled={ids.length === 0 || pending}
                  onClick={() => start(async () => finish(await bulk.requestReview({ ids })))}
                >
                  {T.requestReview}
                </Button>
                {bulk.unpublishMany && (
                  <Button
                    size="md"
                    variant="outline"
                    disabled={autoSelected.length === 0 || pending}
                    onClick={() => setBulkUnpublish(true)}
                  >
                    {T.unpublishSelected}
                  </Button>
                )}
                {bulk.approveRecommended && (
                  <Button
                    size="md"
                    icon="check"
                    disabled={recommendedSelected.length === 0 || pending}
                    aria-describedby={`${uid}-rec-hint`}
                    onClick={() =>
                      start(async () =>
                        finish(await bulk.approveRecommended!({ ids: recommendedSelected })),
                      )
                    }
                  >
                    {F.approveRecommended(recommendedSelected.length)}
                  </Button>
                )}
                {force && (
                  <Button
                    size="md"
                    variant="outline-strong"
                    disabled={selectionCount === 0 || pending}
                    onClick={() => setForceOpen(true)}
                  >
                    {R.publishAnyway}
                  </Button>
                )}
                {force && pageAllSelected && (
                  <p role="status" aria-live="polite" className="w-full type-body text-strong">
                    {allMatching ? (
                      <>
                        {R.allSelected(force.reviewTotal)}{" "}
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => {
                            setAllMatching(false);
                            setSelected(new Set());
                          }}
                        >
                          {R.clearSelection}
                        </Button>
                      </>
                    ) : (
                      <>
                        {R.pageSelected(eligible.length)}{" "}
                        {force.reviewTotal > eligible.length && (
                          <Button size="sm" variant="text" onClick={() => setAllMatching(true)}>
                            {R.selectAllMatching(force.reviewTotal)}
                          </Button>
                        )}
                      </>
                    )}
                  </p>
                )}
                {bulk.approveRecommended && (
                  <p id={`${uid}-rec-hint`} className="w-full type-meta text-meta">
                    {F.approveRecommendedHint}
                  </p>
                )}
              </fieldset>
            </div>
          )}
        </>
      )}

      {force && forceOpen && (
        <ForcedPublishDialog
          selection={allMatching ? { filter: force.filter } : { ids: ids }}
          api={force.api}
          onClose={(changed) => {
            setForceOpen(false);
            if (changed) {
              setSelected(new Set());
              setAllMatching(false);
              router.refresh();
            }
          }}
        />
      )}

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={T.unpublishTitle}
        className="text-left"
        actions={
          <>
            <Button size="md" fullWidth disabled={pending} onClick={confirmUnpublish}>
              {T.confirm}
            </Button>
            <Button size="md" variant="text" onClick={closeDialog}>
              {T.cancel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-left">
          <p>{target ? target.title : T.unpublishedMany(autoSelected.length)}</p>
          <p>{T.unpublishIntro}</p>
          <label htmlFor={`${uid}-reason`} className="type-label text-strong">
            {T.reason}
          </label>
          <textarea
            id={`${uid}-reason`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
            rows={3}
            maxLength={500}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${uid}-reason-err` : `${uid}-reason-hint`}
            className={cx(
              "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
              reasonError && "field-error",
            )}
          />
          {reasonError ? (
            <p id={`${uid}-reason-err`} role="alert" className="flex gap-1.5 type-meta text-danger">
              <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
              {reasonError}
            </p>
          ) : (
            <p id={`${uid}-reason-hint`} className="type-meta text-meta">
              {T.reasonHint}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function Tag({
  icon,
  tone,
  children,
}: {
  icon: "layers" | "refresh-cw" | "circle-alert" | "triangle-alert";
  tone?: "warn";
  children: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-12 font-semibold",
        tone === "warn"
          ? "border-line-control bg-atencao-soft text-warn"
          : "border-line-subtle text-meta",
      )}
    >
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}

/** Rótulo da célula no cartão do celular (na tabela, o cabeçalho da coluna já diz). */
function CellLabel({ children }: { children: string }) {
  return <span className="type-meta text-meta md:hidden">{children}: </span>;
}

/**
 * Justificativa da recomendação (item 55): uma linha visível e "Ver mais" que mostra o resto,
 * num `details` nativo (teclado e leitor de tela sem script). Nunca só em `title`.
 */
function Rationale({ text }: { text: string }) {
  return (
    <details className="group mt-1 type-meta text-meta">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="line-clamp-1 group-open:line-clamp-none">{text}</span>
        <span className="hit-area font-medium text-link underline-offset-4 hover:underline">
          <span className="group-open:hidden">{F.rationaleMore}</span>
          <span className="hidden group-open:inline">{F.rationaleLess}</span>
        </span>
      </summary>
    </details>
  );
}
