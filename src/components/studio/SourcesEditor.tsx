"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { computeConfidence } from "@/lib/confidence";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { Select, type SelectOption } from "../ui/Select";
import type { ActionReply } from "./QueueTable";

export type SourceRole = "primary" | "secondary" | "context";

export interface SourcesEditorItem {
  itemId: string;
  role: SourceRole;
  confirmed: boolean;
  title: string;
  url: string;
  sourceName: string;
  reliability: string;
  publishedAt: string | null;
}

export interface SourcesEditorProps {
  articleId: string;
  sources: SourcesEditorItem[];
  candidates: readonly SelectOption[];
  centralConflict: boolean;
  /** Instante de referência (ISO) para o frescor da confiança; vem do servidor. */
  now: string;
  save?: (i: {
    id: string;
    sources: { itemId: string; role: SourceRole; confirmed: boolean }[];
  }) => Promise<ActionReply>;
  className?: string;
}

const ROLES: SourceRole[] = ["primary", "secondary", "context"];

/**
 * Bloco "Fontes" do editor (E04): item coletado, papel e confirmação, com a confiança calculada
 * ao vivo pela fórmula da spec §6.3 e alerta quando as fontes divergem num fato central.
 */
export function SourcesEditor({
  articleId,
  sources: initial,
  candidates,
  centralConflict,
  now,
  save,
  className,
}: SourcesEditorProps) {
  const router = useRouter();
  const uid = useId();
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState("");
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();

  const live = useMemo(() => {
    const independent = new Set(rows.map((r) => r.sourceName)).size;
    const primary = new Set(
      rows
        .filter((r) => r.reliability === "primary" && r.role === "primary")
        .map((r) => r.sourceName),
    ).size;
    const latest = Math.max(0, ...rows.map((r) => (r.publishedAt ? Date.parse(r.publishedAt) : 0)));
    const hours = latest > 0 ? (Date.parse(now) - latest) / 3_600_000 : Number.NaN;
    return computeConfidence({
      independentSources: independent,
      primarySources: primary,
      centralConflict,
      hoursSinceUpdate: hours,
    });
  }, [rows, centralConflict, now]);

  const persist = (next: SourcesEditorItem[]) => {
    setRows(next);
    if (!save) return;
    start(async () => {
      const r = await save({
        id: articleId,
        sources: next.map(({ itemId, role, confirmed }) => ({ itemId, role, confirmed })),
      });
      setStatus(r);
      if (r.ok) router.refresh();
    });
  };

  const candidateLabel = new Map(candidates.map((c) => [c.value, c.label]));

  return (
    <section
      aria-labelledby={`${uid}-titulo`}
      className={cx("rounded-lg border border-line-subtle bg-card-white p-4", className)}
    >
      <h2 id={`${uid}-titulo`} className="type-section text-strong">
        {T.sources}
      </h2>
      <p className="mt-1 type-meta text-meta">{T.sourcesIntro}</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="type-meta text-meta">{T.confidenceLive}</span>
        <ConfidenceMeter level={live.level} />
        <span className="type-meta tabular-nums text-meta">{live.score.toFixed(2)}</span>
      </div>
      {centralConflict && (
        <InlineAlert tone="warn" role="none" className="mt-3">
          {T.conflictAlert}
        </InlineAlert>
      )}
      <p role="status" aria-live="polite" className="mt-2 type-meta">
        {status && (
          <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
        )}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 type-body text-meta">{T.noSources}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-line-subtle">
          {rows.map((r, i) => (
            <li key={r.itemId} className="flex flex-col gap-2 py-3">
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="type-body font-semibold text-strong underline-offset-4 hover:underline"
              >
                {r.title}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
              <span className="type-meta text-meta">
                {r.sourceName}
                {r.publishedAt ? ` · ${formatDateTime(r.publishedAt)}` : ""}
              </span>
              {save ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    id={`${uid}-papel-${i}`}
                    name={`papel-${i}`}
                    label={T.roleLabel}
                    options={ROLES.map((role) => ({ value: role, label: T.sourceRole[role] }))}
                    value={r.role}
                    onChange={(v) =>
                      persist(
                        rows.map((x) =>
                          x.itemId === r.itemId ? { ...x, role: v as SourceRole } : x,
                        ),
                      )
                    }
                    className="min-w-40"
                  />
                  <Button
                    size="sm"
                    variant={r.confirmed ? "outline-strong" : "outline"}
                    pressed={r.confirmed}
                    disabled={pending}
                    onClick={() =>
                      persist(
                        rows.map((x) =>
                          x.itemId === r.itemId ? { ...x, confirmed: !x.confirmed } : x,
                        ),
                      )
                    }
                  >
                    {r.confirmed ? T.sourceConfirmed : T.confirmSource}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    aria-label={`${T.removeSource}: ${r.title}`}
                    onClick={() => persist(rows.filter((x) => x.itemId !== r.itemId))}
                  >
                    {T.removeSource}
                  </Button>
                </div>
              ) : (
                <span className="flex items-center gap-2 type-meta text-strong">
                  <Icon name={r.confirmed ? "check" : "clock"} size={16} />
                  {T.sourceRole[r.role]} · {r.confirmed ? T.sourceConfirmed : T.sourceUnconfirmed}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {save && candidates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select
            id={`${uid}-add`}
            name="fonte"
            label={T.addSourceLabel}
            hint={T.addSourceHint}
            options={candidates}
            placeholder="—"
            value={adding}
            onChange={setAdding}
            className="min-w-0 flex-1"
          />
          <Button
            size="md"
            variant="outline"
            disabled={!adding || pending}
            onClick={() => {
              const label = candidateLabel.get(adding) ?? "";
              const [sourceName, ...rest] = label.split(" · ");
              persist([
                ...rows,
                {
                  itemId: adding,
                  role: "secondary",
                  confirmed: false,
                  title: rest.join(" · "),
                  url: "#",
                  sourceName: sourceName ?? "",
                  reliability: "standard",
                  publishedAt: null,
                },
              ]);
              setAdding("");
            }}
          >
            {T.addSource}
          </Button>
        </div>
      )}
    </section>
  );
}
