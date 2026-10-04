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
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ForcedPublishDialog, type ForcedPublishApi } from "./ForcedPublishDialog";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";

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
  };
  unpublish?: (i: { id: string; title: string; reason: string }) => Promise<ActionReply>;
  /** Estado vazio no lugar da tabela; a região de status continua montada (ex.: depois de
   *  despublicar a última automática, "Despublicada" segue visível). */
  empty?: ReactNode;
  className?: string;
}

/**
 * Tabela da fila (E01/E02): matéria com editoria e marcas (pipeline, sem IA, tema sensível),
 * estado, recomendação da IA × responsável, prazo e ações. Seleção para ações em lote e
 * despublicação de automáticas com motivo obrigatório (diálogo). Resultado em `role="status"`.
 * No celular a tabela rola na horizontal dentro de uma região focável.
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
          {bulk && (
            <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-line-subtle bg-card-white p-4">
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
            </fieldset>
          )}

          <div
            role="region"
            aria-label={T.scrollRegion}
            tabIndex={0}
            className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption className="sr-only">{T.caption}</caption>
              <thead className="border-b border-line-subtle bg-section">
                <tr className="type-meta text-meta">
                  {bulk && (
                    <th scope="col" className="w-12 px-3 py-3">
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
                    </th>
                  )}
                  <th scope="col" className="px-3 py-3">
                    {T.col.title}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.status}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.recommended}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.assignee}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    {T.col.due}
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">{T.col.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    id={r.anchorId}
                    tabIndex={r.anchorId ? -1 : undefined}
                    className="border-b border-line-subtle align-top last:border-b-0"
                  >
                    {bulk && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={T.selectRow(r.title)}
                          checked={selected.has(r.id)}
                          onChange={(e) => toggle(r.id, e.target.checked)}
                          className="size-5 accent-(--action-primary)"
                        />
                      </td>
                    )}
                    <th scope="row" className="max-w-md px-3 py-3 font-normal">
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
                    <td className="px-3 py-3 type-body text-strong">
                      {ARTICLE_STATUS_LABEL[r.status]}
                    </td>
                    <td className="px-3 py-3 type-body">
                      {r.recommended ? (
                        <span className="text-ai" title={r.recommendedRationale ?? undefined}>
                          {RECOMMENDED_LABEL[r.recommended] ?? r.recommended}
                        </span>
                      ) : (
                        <span className="text-meta">{T.noRecommendation}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 type-body">
                      {r.assigneeName ?? <span className="text-meta">{T.noAssignee}</span>}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {r.dueAt ? (
                        <span
                          className={cx(r.overdue ? "font-semibold text-danger" : "text-strong")}
                        >
                          {r.overdue && <span className="sr-only">{T.overdue}: </span>}
                          {formatDateTime(r.dueAt)}
                        </span>
                      ) : (
                        <span className="text-meta">{T.noDue}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
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
          <label htmlFor={`${uid}-reason`} className="type-label text-16 text-strong">
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
