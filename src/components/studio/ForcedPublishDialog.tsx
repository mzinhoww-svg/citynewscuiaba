"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { REVIEW_BULK_TEXT as T } from "@/content/pt-BR/studio-review";
import { UI } from "@/content/pt-BR/ui";
import type { RiskKey } from "@/lib/review/bulk-risk";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";

/** Seleção enviada às ações: os ids marcados ou "todas em revisão" nas abas e filtros atuais. */
export type ForcedSelectionPayload = { ids: string[] } | { filter: Record<string, string> };

export interface ExcludedItem {
  id: string;
  title: string;
  reason: string;
}
export type PreviewReply =
  | {
      ok: true;
      total: number;
      top: { key: RiskKey; count: number; example: string }[];
      excluded: ExcludedItem[];
    }
  | { ok: false; message: string };
export type StartReply =
  { ok: true; jobId: string; total: number } | { ok: false; message: string };
export type StatusReply =
  | {
      ok: true;
      status: "queued" | "running" | "done";
      total: number;
      done: number;
      failed: number;
      excluded: ExcludedItem[];
      failures: { id: string | null; title: string; reason: string }[];
    }
  | { ok: false; message: string };

export interface ForcedPublishApi {
  preview: (s: ForcedSelectionPayload) => Promise<PreviewReply>;
  start: (s: ForcedSelectionPayload) => Promise<StartReply>;
  status: (jobId: string) => Promise<StatusReply>;
}

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; preview: Extract<PreviewReply, { ok: true }> }
  | { kind: "starting"; preview: Extract<PreviewReply, { ok: true }> }
  | { kind: "progress"; jobId: string; total: number; done: number; failed: number }
  | { kind: "result"; status: Extract<StatusReply, { ok: true }> };

export interface ForcedPublishDialogProps {
  selection: ForcedSelectionPayload;
  api: ForcedPublishApi;
  /** Fecha o diálogo; `changed` = houve publicação (a tela atualiza a fila). */
  onClose: (changed: boolean) => void;
  /** Intervalo de atualização do andamento (ms). */
  pollMs?: number;
}

/**
 * Diálogo de "Publicar mesmo assim": resumo dos principais riscos da seleção, aviso de
 * responsabilidade e confirmação. Depois de confirmar, mostra o andamento ("Publicando 120 de
 * 660") e o resultado (sucesso, parcial com as que ficaram de fora ou erro). O foco inicial fica
 * no fechar do diálogo, nunca no botão de publicar; Esc e Cancelar não alteram nada.
 */
export function ForcedPublishDialog({
  selection,
  api,
  onClose,
  pollMs = 2000,
}: ForcedPublishDialogProps) {
  const uid = useId();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const published = useRef(false);

  useEffect(() => {
    let alive = true;
    api
      .preview(selection)
      .then((r) => {
        if (!alive) return;
        setView(r.ok ? { kind: "ready", preview: r } : { kind: "error", message: r.message });
      })
      .catch(() => alive && setView({ kind: "error", message: T.loadError }));
    return () => {
      alive = false;
    };
    // O resumo é calculado uma vez por abertura (e a cada "Tentar de novo").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const jobId = view.kind === "progress" ? view.jobId : null;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let next: StatusReply | null = null;
      try {
        next = await api.status(jobId);
      } catch {
        next = null;
      }
      if (!alive) return;
      if (next?.ok) {
        if (next.status === "done") {
          setView({ kind: "result", status: next });
          return;
        }
        setView({
          kind: "progress",
          jobId,
          total: next.total,
          done: next.done,
          failed: next.failed,
        });
      }
      timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, pollMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId, api, pollMs]);

  const confirm = useCallback(
    async (preview: Extract<PreviewReply, { ok: true }>) => {
      setView({ kind: "starting", preview });
      try {
        const r = await api.start(selection);
        if (!r.ok) {
          setView({ kind: "error", message: r.message });
          return;
        }
        published.current = true;
        setView({ kind: "progress", jobId: r.jobId, total: r.total, done: 0, failed: 0 });
      } catch {
        setView({ kind: "error", message: T.failed });
      }
    },
    [api, selection],
  );

  const close = () => onClose(published.current);
  const working = view.kind === "starting";

  return (
    <Dialog open wide title={T.dialogTitle} onClose={close} actions={actionsFor()}>
      <div className="flex flex-col gap-4 text-left" id={`${uid}-body`}>
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          {body()}
        </div>
      </div>
    </Dialog>
  );

  function body() {
    switch (view.kind) {
      case "loading":
        return (
          <p aria-busy="true" className="type-body text-meta">
            {T.loading}
          </p>
        );
      case "error":
        return (
          <p className="flex items-start gap-2 type-body text-danger">
            <Icon name="circle-alert" size={20} className="mt-0.5 shrink-0" />
            {view.message}
          </p>
        );
      case "ready":
      case "starting":
        return <Preview preview={view.preview} />;
      case "progress":
        return (
          <div className="flex flex-col gap-2">
            <p className="type-body font-semibold text-strong">
              {T.progress(view.done + view.failed, view.total)}
            </p>
            <progress
              className="h-2 w-full accent-(--action-primary)"
              max={view.total}
              value={view.done + view.failed}
              aria-label={T.progress(view.done + view.failed, view.total)}
            />
            <p className="type-meta text-meta">{T.queued(view.total)}</p>
          </div>
        );
      case "result":
        return <Result status={view.status} />;
    }
  }

  function actionsFor() {
    if (view.kind === "ready" || view.kind === "starting") {
      const total = view.preview.total;
      return (
        <>
          <Button size="md" variant="outline" disabled={working} onClick={close}>
            {T.cancel}
          </Button>
          <Button
            size="md"
            variant="danger"
            className="border border-danger px-5!"
            disabled={working || total === 0}
            onClick={() => confirm(view.preview)}
          >
            {T.confirm(total)}
          </Button>
        </>
      );
    }
    if (view.kind === "error")
      return (
        <>
          <Button
            size="md"
            variant="outline"
            onClick={() => {
              setView({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            {T.retry}
          </Button>
          <Button size="md" variant="text" onClick={close}>
            {T.cancel}
          </Button>
        </>
      );
    if (view.kind === "progress" || view.kind === "result")
      return (
        <Button size="md" variant="outline" onClick={close}>
          {UI.close}
        </Button>
      );
    return (
      <Button size="md" variant="text" onClick={close}>
        {T.cancel}
      </Button>
    );
  }
}

function Preview({ preview }: { preview: Extract<PreviewReply, { ok: true }> }) {
  return (
    <>
      {preview.total === 0 ? (
        <p className="type-body text-strong">{T.nothingToPublish}</p>
      ) : (
        <p className="type-body text-strong">{T.dialogIntro(preview.total)}</p>
      )}
      {preview.top.length === 0 ? (
        preview.total > 0 && <p className="type-body text-meta">{T.noRisks}</p>
      ) : (
        <section aria-label={T.risksTitle}>
          <h3 className="type-label text-16 text-strong">{T.risksTitle}</h3>
          <ol className="mt-2 flex flex-col gap-2">
            {preview.top.map((r) => (
              <li key={r.key} className="rounded-lg border border-line-subtle p-3">
                <p className="type-body font-semibold text-strong">{T.risk[r.key](r.count)}</p>
                <p className="type-meta text-meta">
                  {T.example}: {r.example}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {preview.excluded.length > 0 && (
        <p className="type-body text-warn">{T.excluded(preview.excluded.length)}</p>
      )}
      <p className="type-body font-semibold text-strong">{T.responsibility}</p>
    </>
  );
}

function Result({ status }: { status: Extract<StatusReply, { ok: true }> }) {
  const left = status.excluded.length + status.failed;
  const items = [
    ...status.excluded.map((e) => ({ id: e.id, title: e.title, reason: e.reason })),
    ...status.failures.map((f) => ({ id: f.id ?? f.title, title: f.title, reason: f.reason })),
  ];
  const allFailed = status.done === 0 && status.failed > 0;
  return (
    <>
      <p
        className={
          allFailed
            ? "flex items-start gap-2 type-body text-danger"
            : "flex items-start gap-2 type-body text-service"
        }
      >
        <Icon name={allFailed ? "circle-alert" : "check"} size={20} className="mt-0.5 shrink-0" />
        {allFailed ? T.failed : left === 0 ? T.success(status.done) : T.partial(status.done, left)}
      </p>
      {items.length > 0 && (
        <section aria-label={T.resultTitle}>
          <h3 className="type-label text-16 text-strong">{T.resultTitle}</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={`${i.id}:${i.reason}`} className="type-meta text-meta">
                <span className="text-strong">{i.title}</span> · {T.reasons[i.reason] ?? i.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
