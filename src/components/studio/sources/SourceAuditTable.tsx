"use client";

import { useId, useState } from "react";
import { CRITICAL_FIELD_TEXT, fullDateTime } from "@/content/pt-BR/sources-admin";
import { HISTORY_TAB_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import type { HistoryRow } from "@/lib/db/queries/sources-admin";
import type { FieldChange } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { CollapsibleFilters } from "../../ui/CollapsibleFilters";
import { Icon } from "../../ui/Icon";
import { Pagination } from "../../ui/Pagination";
import { Select } from "../../ui/Select";
import { Table } from "../../ui/Table";

export interface SourceAuditTableProps {
  rows: readonly HistoryRow[];
  total: number;
  page: number;
  /** `/estudio/control/fontes/<id>/historico`. */
  basePath: string;
  /** Filtro atual (`?tipo=`), vazio = todas. */
  filter: string;
  slug: string;
  className?: string;
}

/** Mesmo tamanho de página de `sourceHistory` (`HISTORY_PAGE_SIZE`, módulo só de servidor). */
const PAGE_SIZE = 50;

const FIELD_NAMES: Record<string, string> = {
  ...CRITICAL_FIELD_TEXT,
  frequency_minutes: "frequência",
  editorial_score: "score editorial",
  priority: "prioridade",
  name: "nome",
  display_name: "nome exibido",
  layer: "camada",
  categories: "editorias",
  locality: "localidade",
  rate_limit_per_hour: "limite por hora",
  terms_min_interval_minutes: "intervalo dos termos",
  terms_url: "termos",
  agreement_until: "acordo até",
  agreement_note: "nota do acordo",
  feed_url: "endereço do feed",
  consumption: "coleta",
  rec_pinned: "fixar",
  rec_local_highlight: "destacar local",
  rec_excluded: "excluir da recomendação",
  status_reason: "motivo do status",
  archived_at: "arquivada em",
  logo_path: "logotipo",
  terms_reviewed_at: "termos revisados em",
};

const valueText = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return T.empty_value;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
};

/** "frequência: 30 → 60" (uma linha por campo). */
export function changeLines(row: HistoryRow): string[] {
  if (row.changes.length > 0)
    return row.changes.map(
      (c: FieldChange) =>
        `${FIELD_NAMES[c.field] ?? c.field}: ${valueText(c.from)} → ${valueText(c.to)}`,
    );
  const d = row.details;
  if (typeof d.field === "string" && "to" in d)
    return [
      `${FIELD_NAMES[d.field] ?? d.field}: ${"from" in d ? valueText(d.from) : "…"} → ${valueText(d.to)}`,
    ];
  if (typeof d.status === "string") return [`status → ${d.status}`];
  return [];
}

/** Célula entre aspas; texto que começa como fórmula ganha `'` e a planilha não o executa (C5-02). */
const csvCell = (s: string) => `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;

/** CSV (`;`, UTF-8) das linhas exibidas: o IP já vem mascarado do servidor para quem não é admin. */
export function historyCsv(rows: readonly HistoryRow[]): string {
  const head = "quando;quem;o_que;antes_depois;motivo;aprovacao;ip_hash";
  const lines = rows.map((r) =>
    [
      r.at,
      r.actor.name,
      T.actions[r.action] ?? r.action,
      changeLines(r).join(" | "),
      r.reason ?? "",
      r.approvalId ?? "",
      r.ipHash ?? "",
    ]
      .map(csvCell)
      .join(";"),
  );
  return [head, ...lines].join("\n");
}

/**
 * Histórico da fonte (spec §8, `/historico`): quem, quando, o quê, antes → depois, motivo e
 * aprovação; filtro por tipo (formulário GET, funciona sem JS; mudar o tipo volta à página 1, a
 * paginação preserva `tipo`); "Exportar CSV" gera o arquivo no
 * navegador a partir das linhas já lidas (IP mascarado para quem não é admin, decidido no servidor).
 */
export function SourceAuditTable({
  rows,
  total,
  page,
  basePath,
  filter,
  slug,
  className,
}: SourceAuditTableProps) {
  const uid = useId().replace(/:/g, "");
  // Só o envio do formulário (GET) navega: trocar o tipo não dispara nada por conta própria.
  const [selected, setSelected] = useState(filter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (filter) params.set("tipo", filter);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const exportCsv = () => {
    const blob = new Blob([`﻿${historyCsv(rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = T.csvName(slug);
    a.click();
    URL.revokeObjectURL(url);
  };
  const options = [
    { value: "", label: T.filterAll },
    ...Object.entries(T.actions).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <CollapsibleFilters
        activeCount={filter ? 1 : 0}
        clearHref={basePath}
        actions={
          <Button
            type="button"
            size="md"
            variant="outline"
            icon="download"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            {T.export}
          </Button>
        }
      >
        <form
          method="get"
          action={basePath}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Select
            id={`${uid}-tipo`}
            name="tipo"
            label={T.filter}
            size="sm"
            value={selected}
            onChange={setSelected}
            options={options}
            className="sm:w-72"
          />
          <Button type="submit" size="md" variant="outline">
            {T.apply}
          </Button>
        </form>
      </CollapsibleFilters>
      <p className="type-meta text-meta">{T.ipMasked}</p>

      {rows.length === 0 ? (
        <p className="type-body text-meta">{filter ? T.emptyFiltered : T.empty}</p>
      ) : (
        // Região rolável com foco por teclado (axe scrollable-region-focusable, FS-T9).
        <Table
          caption={T.title}
          minWidth="lg"
          headers={[
            T.columns.when,
            T.columns.who,
            T.columns.what,
            T.columns.change,
            T.columns.reason,
            T.columns.approval,
            T.columns.ip,
          ]}
        >
          {rows.map((r) => {
            const lines = changeLines(r);
            return (
              <tr key={r.id} className="border-b border-line-section align-top type-body">
                <td className="px-3 py-2 whitespace-nowrap text-strong">{fullDateTime(r.at)}</td>
                <td className="px-3 py-2 text-strong">{r.actor.name}</td>
                <td className="px-3 py-2 text-strong">{T.actions[r.action] ?? r.action}</td>
                <td className="px-3 py-2 text-strong">
                  {lines.length === 0 ? T.noChange : lines.map((l) => <p key={l}>{l}</p>)}
                </td>
                <td className="px-3 py-2 text-strong">{r.reason ?? T.noChange}</td>
                <td className="px-3 py-2 text-strong">
                  {r.approvalId ? (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="shield" size={14} />
                      {T.approvalRef(r.approvalId)}
                    </span>
                  ) : (
                    T.noChange
                  )}
                </td>
                <td className="px-3 py-2 type-meta text-meta">{r.ipHash ?? T.noChange}</td>
              </tr>
            );
          })}
        </Table>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        label="Paginação do histórico"
      />
    </div>
  );
}
