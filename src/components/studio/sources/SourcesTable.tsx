"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  clockTime,
  fullDateTime,
  FREQUENCY_TEXT,
  LAYER_TEXT,
  PRIORITY_TEXT,
  SOURCES_LIST_TEXT as T,
} from "@/content/pt-BR/sources-admin";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import {
  bulkSourcesAction,
  collectNowAction,
  sourceStatusAction,
  type ActionState,
} from "@/app/estudio/control/fontes/actions";
import type { SourceListRow, SourceSort } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { BulkActionsBar } from "./BulkActionsBar";
import { EditorialScore } from "./EditorialScore";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { SourceRowMenu } from "./SourceRowMenu";
import { SourceRowMobile } from "./SourceRowMobile";
import { SourceStatusBadge } from "./SourceStatusBadge";

export interface SourcesTableProps {
  rows: SourceListRow[];
  sort: SourceSort;
  dir?: "asc" | "desc";
  /** Rota base do painel (link de detalhe e de ordenação). */
  basePath?: string;
  /** Filtros atuais além de ordenação e página, para preservar na troca de coluna. */
  query?: Record<string, string>;
  defaultFrequencyMinutes?: number;
  fastLane?: { max: number; used: number };
  className?: string;
}

function sortHref(
  col: SourceSort,
  current: SourceSort,
  dir: "asc" | "desc",
  basePath: string,
  query: Record<string, string>,
): string {
  const params = new URLSearchParams(query);
  const nextDir =
    current === col ? (dir === "asc" ? "desc" : "asc") : col === "name" ? "asc" : "desc";
  params.set("ordem", col);
  params.set("dir", nextDir);
  return `${basePath}?${params.toString()}`;
}

/** Colunas secundárias (não fazem falta a 1280 px, spec §8): somem antes de 1440 px. */
const SECONDARY_CELL = "hidden wide:table-cell p-3 type-meta text-strong";
const UNDO_MS = 10_000;

interface Announcement {
  message: string;
  undo?: () => void;
}

/**
 * Tabela ordenável da lista de fontes (spec §8, O03): seleção, ordenação por `aria-sort`, menu de
 * ações por linha e barra de lote. Em 360 px vira lista de cartões (`SourceRowMobile`), sem
 * tabela. A 1280 px (Fonte, Status, Score, Frequência, Saúde, Próxima coleta, Ações), Camada e
 * Localidade viram texto secundário sob o nome da fonte, e Prioridade/Última coleta/Erros 24 h só
 * aparecem a partir de 1440 px — a tabela nunca provoca rolagem horizontal da página no desktop de
 * referência (achado da revisão FS-T7 fix round 1).
 *
 * ```tsx
 * <SourcesTable rows={rows} sort="score" dir="desc" defaultFrequencyMinutes={30}
 *   fastLane={{ max: 10, used: 0 }} />
 * ```
 */
export function SourcesTable({
  rows,
  sort,
  dir = "desc",
  basePath = "/estudio/control/fontes",
  query = {},
  defaultFrequencyMinutes = 30,
  fastLane = { max: 10, used: 0 },
  className,
}: SourcesTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [pending, startTransition] = useTransition();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((s) =>
      rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)),
    );

  const selectedIds = useMemo(() => [...selected], [selected]);

  /** Anuncia o resultado (`role="status"`) e, quando houver, oferece "Desfazer" por 10 s. */
  function announce(message: string, undo?: () => void) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setAnnouncement({ message, undo });
    undoTimer.current = setTimeout(() => setAnnouncement(null), UNDO_MS);
  }

  /**
   * Pausar/retomar uma fonte. O Desfazer reaplica a ação oposta pelo lote de uma fonte só
   * (`bulkSourcesAction`, sem versão): desfazer uma pausa não passa de novo pelo teste de
   * conexão do "Retomar" — a fonte estava íntegra segundos atrás — enquanto o clique direto em
   * "Retomar" continua exigindo a ativação completa (spec §7.3).
   */
  function applyStatus(id: string, version: number, action: "pause" | "resume") {
    const form = new FormData();
    form.set("id", id);
    form.set("version", String(version));
    form.set("action", action);
    startTransition(async () => {
      const r: ActionState = await sourceStatusAction(form);
      if (!r.ok) return announce(r.message);
      announce(r.message, () => undoSingle(id, action === "pause" ? "activate" : "pause"));
    });
  }

  function undoSingle(id: string, action: "pause" | "activate") {
    const form = new FormData();
    form.set("ids", id);
    form.set("action", action);
    startTransition(async () => {
      const r = await bulkSourcesAction(form);
      announce(r.message);
    });
  }

  function runPauseResume(row: SourceListRow) {
    applyStatus(row.id, row.version, row.displayStatus === "paused" ? "resume" : "pause");
  }

  function runCollectNow(id: string) {
    const form = new FormData();
    form.set("id", id);
    startTransition(async () => {
      const r = await collectNowAction(form);
      announce(r.message);
    });
  }

  /** Lote (pausar/ativar/frequência); pausar e ativar em lote também ganham "Desfazer". */
  function runBulk(
    action: "pause" | "activate" | "frequency",
    frequencyMinutes?: number | null,
    reason?: string,
  ) {
    const ids = selectedIds;
    const form = new FormData();
    for (const id of ids) form.append("ids", id);
    form.set("action", action);
    if (action === "frequency")
      form.set(
        "frequencyMinutes",
        frequencyMinutes === null || frequencyMinutes === undefined
          ? "padrao"
          : String(frequencyMinutes),
      );
    if (reason) form.set("reason", reason);
    startTransition(async () => {
      const r = await bulkSourcesAction(form);
      if (!r.ok) return announce(r.message);
      setSelected(new Set());
      const data = r.data as { items?: { id: string; outcome: string }[] } | undefined;
      const doneIds = (data?.items ?? []).filter((i) => i.outcome === "done").map((i) => i.id);
      const undo =
        (action === "pause" || action === "activate") && doneIds.length > 0
          ? () => runBulkUndo(action === "pause" ? "activate" : "pause", doneIds)
          : undefined;
      announce(r.message, undo);
    });
  }

  function runBulkUndo(action: "pause" | "activate", ids: string[]) {
    const form = new FormData();
    for (const id of ids) form.append("ids", id);
    form.set("action", action);
    startTransition(async () => {
      const r = await bulkSourcesAction(form);
      announce(r.message);
    });
  }

  const hrefFor = (id: string) => `${basePath}/${id}`;

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {announcement && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-toast mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-lg bg-inverse px-5 py-3 text-on-inverse shadow-dialog"
        >
          <span className="type-body">{announcement.message}</span>
          {announcement.undo && (
            <button
              type="button"
              onClick={() => {
                announcement.undo?.();
                setAnnouncement(null);
              }}
              className="type-body font-semibold text-on-inverse underline underline-offset-4"
            >
              {T.toast.undo}
            </button>
          )}
        </div>
      )}

      {/* Desktop: tabela (>= md), com Camada/Localidade no cabeçalho da fonte a partir de 1280 px
          e Prioridade/Última coleta/Erros 24 h só a partir de 1440 px (achado da revisão).
          `relative`: o texto `sr-only` (posição absoluta) do cabeçalho de ações fica contido na
          região rolável em vez de esticar a página em 768 px (FS-T9). */}
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-section">
              <th scope="col" className="p-3">
                <input
                  type="checkbox"
                  aria-label={T.columns.selectAll}
                  checked={allSelected}
                  onChange={toggleAll}
                  className="size-5 accent-action-primary"
                />
              </th>
              <SortableHeader
                col="name"
                label={T.columns.source}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.status}
              </th>
              <SortableHeader
                col="score"
                label={T.columns.score}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="hidden wide:table-cell p-3 type-meta text-meta">
                {T.columns.priority}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.frequency}
              </th>
              <SortableHeader
                col="health"
                label={T.columns.health}
                sort={sort}
                dir={dir}
                basePath={basePath}
                query={query}
              />
              <th scope="col" className="hidden wide:table-cell p-3 type-meta text-meta">
                {T.columns.lastFetch}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                {T.columns.nextFetch}
              </th>
              <th scope="col" className="hidden wide:table-cell p-3 type-meta text-meta">
                {T.columns.errors}
              </th>
              <th scope="col" className="p-3 type-meta text-meta">
                <span className="sr-only">{T.columns.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const canCollectNow =
                row.displayStatus === "active" || row.displayStatus === "degraded";
              const canPause = row.displayStatus === "active" || row.displayStatus === "degraded";
              const canResume = row.displayStatus === "paused";
              const secondary = [
                row.layer ? LAYER_TEXT[row.layer] : null,
                LOCALITY_TEXT[row.locality] ?? row.locality,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={row.id} className="border-b border-line-subtle align-top">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={T.columns.selectOne(row.name)}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-5 accent-action-primary"
                    />
                  </td>
                  <td className="w-[1%] max-w-[13rem] p-3 wide:max-w-[16rem]">
                    <Link
                      href={hrefFor(row.id)}
                      className="type-body font-semibold text-strong no-underline hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="type-meta text-meta">
                      {row.domain}
                      {secondary ? ` · ${secondary}` : ""}
                    </p>
                  </td>
                  <td className="p-3">
                    <SourceStatusBadge status={row.displayStatus} reason={row.statusReason} />
                  </td>
                  <td className="p-3">
                    <EditorialScore score={row.editorialScore} />
                  </td>
                  <td className={SECONDARY_CELL}>{PRIORITY_TEXT[row.priority]}</td>
                  <td className="p-3">
                    <FrequencyLabel
                      frequencyMinutes={row.frequencyMinutes}
                      effective={row.effective}
                    />
                  </td>
                  <td className="p-3">
                    <HealthBadge score={row.operationalScore} label={row.health} />
                  </td>
                  <td className={SECONDARY_CELL}>
                    {row.lastFetchedAt ? fullDateTime(row.lastFetchedAt) : T.never}
                  </td>
                  <td className="p-3 type-meta text-strong">
                    {row.nextCollectionAt ? clockTime(row.nextCollectionAt) : FREQUENCY_TEXT.noNext}
                  </td>
                  <td className={SECONDARY_CELL}>{row.errors24h}</td>
                  <td className="p-3 text-right">
                    <SourceRowMenu
                      name={row.name}
                      href={hrefFor(row.id)}
                      canCollectNow={canCollectNow}
                      canPause={canPause}
                      canResume={canResume}
                      busy={pending}
                      onCollectNow={() => runCollectNow(row.id)}
                      onPauseResume={() => runPauseResume(row)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: lista de cartões (< md), sem rolagem horizontal */}
      <ul className="flex flex-col md:hidden">
        {rows.map((row) => (
          <SourceRowMobile
            key={row.id}
            row={row}
            href={hrefFor(row.id)}
            selected={selected.has(row.id)}
            onToggle={() => toggle(row.id)}
            onCollectNow={() => runCollectNow(row.id)}
            onPauseResume={() => runPauseResume(row)}
            busy={pending}
          />
        ))}
      </ul>

      <BulkActionsBar
        count={selected.size}
        busy={pending}
        defaultFrequencyMinutes={defaultFrequencyMinutes}
        fastLane={fastLane}
        onPause={() => runBulk("pause")}
        onActivate={() => runBulk("activate")}
        onApplyFrequency={(minutes, reason) => runBulk("frequency", minutes, reason)}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}

interface SortableHeaderProps {
  col: SourceSort;
  label: string;
  sort: SourceSort;
  dir: "asc" | "desc";
  basePath: string;
  query: Record<string, string>;
}

function SortableHeader({ col, label, sort, dir, basePath, query }: SortableHeaderProps) {
  const active = sort === col;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className="p-3"
    >
      <Link
        href={sortHref(col, sort, dir, basePath, query)}
        className="inline-flex items-center gap-1 type-meta font-semibold text-strong no-underline hover:underline"
      >
        {label}
        {active && (
          <Icon
            name={dir === "asc" ? "arrow-up" : "chevron-down"}
            size={14}
            className="text-meta"
          />
        )}
      </Link>
    </th>
  );
}
