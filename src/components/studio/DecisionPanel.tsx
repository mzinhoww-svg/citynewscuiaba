"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { REVIEW_TEXT as T } from "@/content/pt-BR/studio";
import { DECISION_FLOW_TEXT as F } from "@/content/pt-BR/studio-flow";
import { HOTKEYS_TEXT as H } from "@/content/pt-BR/hotkeys";
import { useHotkeys, type HotkeyHelpEntry } from "@/lib/studio/use-hotkeys";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Menu, type MenuItem } from "../ui/Menu";
import { Panel } from "../ui/Panel";
import type { ActionReply } from "./QueueTable";

export interface DecisionPanelProps {
  articleId: string;
  recommended: { label: string; rationale: string | null } | null;
  human: { label: string; by: string | null; at: string } | null;
  /** Motivo do checklist incompleto: Aprovar fica desabilitado com o texto visível. */
  blocker?: string;
  editHref: string;
  /**
   * Próximo item da fila com a mesma aba e filtros (`?de=` incluso): mostra "Aprovar e ir para o
   * próximo", que aprova e navega para ele.
   */
  nextHref?: string | null;
  actions?: {
    approve?: (i: { id: string }) => Promise<ActionReply>;
    reject?: (i: { id: string; reason: string }) => Promise<ActionReply>;
    requestChanges?: (i: { id: string; reason: string }) => Promise<ActionReply>;
    reprocess?: (i: { id: string }) => Promise<ActionReply>;
  };
  className?: string;
}

type Asking = "reject" | "requestChanges" | null;

/**
 * Decisão recomendada × decisão humana (E03) e as ações Rejeitar, Pedir ajuste, Reprocessar e
 * Aprovar e publicar. Rejeitar e Pedir ajuste pedem motivo; Aprovar só com checklist completo.
 *
 * Abaixo de `xl` (item 45) as ações viram uma barra fixa no rodapé, com área segura: Aprovar,
 * Pedir ajuste e o menu "Mais ações" com o resto. A página reserva o espaço da barra no fim.
 * Com `nextHref` (item 46), "Aprovar e ir para o próximo" aprova e segue para o próximo item.
 */
export function DecisionPanel({
  articleId,
  recommended,
  human,
  blocker,
  editHref,
  nextHref,
  actions,
  className,
}: DecisionPanelProps) {
  const router = useRouter();
  const uid = useId();
  const [asking, setAsking] = useState<Asking>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();

  const done = (r: ActionReply) => {
    setStatus(r);
    if (r.ok) router.refresh();
  };
  const approve = (andNext: boolean) => {
    const fn = actions?.approve;
    if (!fn) return;
    start(async () => {
      const r = await fn({ id: articleId });
      if (r.ok && andNext && nextHref) {
        setStatus(r);
        router.push(nextHref);
        return;
      }
      done(r);
    });
  };
  const canApprove = !blocker && !pending && Boolean(actions?.approve);
  // Menu "Mais ações" da barra do celular: o que não cabe ao lado de Aprovar e Pedir ajuste.
  const more: MenuItem[] = [];
  if (actions?.approve && nextHref && canApprove)
    more.push({ label: F.approveNext, icon: "move-right", onSelect: () => approve(true) });
  if (actions?.reprocess) {
    const reprocess = actions.reprocess;
    more.push({
      label: T.reprocess,
      icon: "refresh-cw",
      onSelect: () => start(async () => done(await reprocess({ id: articleId }))),
    });
  }
  if (actions?.reject)
    more.push({
      label: T.reject,
      icon: "ban",
      destructive: true,
      onSelect: () => setAsking("reject"),
    });
  more.push({ label: T.edit, icon: "pencil", onSelect: () => router.push(editHref) });
  // a/r (item 53): as mesmas ações dos botões Aprovar e Pedir ajuste, com as mesmas travas
  // (checklist, pendência). Pedir ajuste abre o diálogo do motivo, como o botão.
  const canAsk = Boolean(actions?.requestChanges) && !pending;
  const keyHelp: HotkeyHelpEntry[] = [];
  if (actions?.approve) keyHelp.push({ keys: ["a"], label: H.approve });
  if (actions?.requestChanges) keyHelp.push({ keys: ["r"], label: H.requestChanges });
  useHotkeys(
    {
      a: () => {
        if (canApprove) approve(false);
      },
      r: () => {
        if (canAsk) setAsking("requestChanges");
      },
    },
    { enabled: Boolean(actions), help: keyHelp },
  );
  const close = () => {
    setAsking(null);
    setReason("");
    setError(null);
  };
  const confirm = () => {
    if (!reason.trim()) {
      setError(T.reasonRequired);
      return;
    }
    const fn = asking === "reject" ? actions?.reject : actions?.requestChanges;
    if (!fn) return;
    start(async () => {
      const r = await fn({ id: articleId, reason });
      close();
      done(r);
    });
  };

  return (
    <Panel aria-labelledby={`${uid}-titulo`} className={className}>
      <h2 id={`${uid}-titulo`} className="type-section text-strong">
        {T.recommendedVsHuman}
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-dashed border-ai bg-ia-soft p-3">
          <dt className="type-eyebrow text-ai">{T.recommended}</dt>
          <dd className="mt-1 type-body font-semibold text-strong">{recommended?.label ?? "—"}</dd>
          {recommended?.rationale && (
            <dd className="mt-1 type-meta text-meta">{recommended.rationale}</dd>
          )}
        </div>
        <div className="rounded-md border border-line-subtle p-3">
          <dt className="type-eyebrow text-meta">{T.human}</dt>
          <dd className="mt-1 type-body font-semibold text-strong">
            {human ? human.label : T.pendingHuman}
          </dd>
          {human?.by && (
            <dd className="mt-1 type-meta text-meta">
              {human.by} · {human.at}
            </dd>
          )}
        </div>
      </dl>

      {!actions && (
        <p role="status" aria-live="polite" className="mt-3 type-body">
          {status && (
            <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
          )}
        </p>
      )}

      {actions && (
        <div
          role="group"
          aria-label={F.bar}
          className={cx(
            "mt-3 flex flex-col gap-3",
            "max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-sticky max-xl:mt-0 max-xl:gap-2",
            "max-xl:border-t max-xl:border-line-subtle max-xl:bg-card-white max-xl:px-4 max-xl:pt-3",
            "max-xl:pb-safe",
          )}
        >
          <p role="status" aria-live="polite" className="type-body empty:hidden">
            {status && (
              <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 max-xl:pb-3">
            <Button
              size="md"
              disabled={!canApprove}
              onClick={() => approve(false)}
              aria-describedby={blocker ? `${uid}-bloqueio` : undefined}
              className="max-xl:flex-1 xl:w-full"
            >
              {T.approve}
            </Button>
            {nextHref && actions.approve && (
              <Button
                size="md"
                variant="outline"
                disabled={!canApprove}
                onClick={() => approve(true)}
                aria-describedby={blocker ? `${uid}-bloqueio` : undefined}
                className="max-xl:hidden xl:w-full"
              >
                {F.approveNext}
              </Button>
            )}
            {blocker && (
              <p
                id={`${uid}-bloqueio`}
                className="flex w-full items-start gap-1.5 type-meta text-warn"
              >
                <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
                {T.approveDisabled(blocker)}
              </p>
            )}
            {actions.requestChanges && (
              <Button
                size="md"
                variant="outline"
                disabled={pending}
                onClick={() => setAsking("requestChanges")}
              >
                {T.requestChanges}
              </Button>
            )}
            {actions.reprocess && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => start(async () => done(await actions.reprocess!({ id: articleId })))}
                className="max-xl:hidden"
              >
                {T.reprocess}
              </Button>
            )}
            {actions.reject && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setAsking("reject")}
                className="max-xl:hidden"
              >
                {T.reject}
              </Button>
            )}
            <Button size="sm" variant="text" href={editHref} className="max-xl:hidden">
              {T.edit}
            </Button>
            <Menu
              label={F.moreMenu}
              items={more}
              side="top"
              className="xl:hidden"
              trigger={({ ref, props }) => (
                <button
                  ref={ref}
                  {...props}
                  type="button"
                  aria-label={F.more}
                  disabled={pending}
                  className="border-control inline-flex size-tap items-center justify-center rounded-lg bg-card-white text-strong hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name="ellipsis" size={20} />
                </button>
              )}
            />
          </div>
        </div>
      )}

      <Dialog
        open={asking !== null}
        onClose={close}
        title={asking === "reject" ? T.reject : T.requestChanges}
        actions={
          <>
            <Button size="md" fullWidth disabled={pending} onClick={confirm}>
              {T.confirm}
            </Button>
            <Button size="md" variant="text" onClick={close}>
              {T.cancel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-left">
          <label htmlFor={`${uid}-motivo`} className="type-label text-strong">
            {asking === "reject" ? T.reasonLabel : T.noteLabel}
          </label>
          <textarea
            id={`${uid}-motivo`}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-erro` : undefined}
            className={cx(
              "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
              error && "field-error",
            )}
          />
          {error && (
            <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </Panel>
  );
}
