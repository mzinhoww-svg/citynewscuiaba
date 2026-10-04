"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { PUBLISH_TEXT as T } from "@/content/pt-BR/studio";
import type { Label } from "@/lib/labels";
import { cx } from "../cx";
import { OriginLabel } from "../editorial/OriginLabel";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";

export type PublishDestination = "home" | "section" | "topic" | "newsletter";

/** Resposta da publicação; `pushQueueHref` chega quando o pedido de push urgente foi criado. */
export interface PublishReply {
  ok: boolean;
  message: string;
  pushQueueHref?: string;
}

export interface PublishDialogProps {
  articleId: string;
  /** Motivo do checklist incompleto; com ele, a publicação fica indisponível. */
  blocker?: string;
  labels: Label[];
  hasTopic: boolean;
  /** Manchete atual da home, para o aviso de conflito. */
  headline?: string | null;
  /** Pode pedir push urgente (admin ou editor-chefe, spec 2026-09-28 §10.7). */
  canRequestUrgent?: boolean;
  publish: (i: {
    id: string;
    when: "now" | { at: string };
    destinations: PublishDestination[];
    /** Pedido de push urgente junto com a publicação (só com `canRequestUrgent`). */
    push?: { justification: string };
  }) => Promise<PublishReply>;
  /** O editor tem alterações não salvas: publicar salva antes (item 4, E-02). */
  dirty?: boolean;
  /** Salva o editor; `false` (falha ou conflito) cancela a publicação. */
  onSaveFirst?: () => Promise<boolean>;
  className?: string;
}

const ALL: PublishDestination[] = ["home", "section", "topic", "newsletter"];
const JUSTIFICATION_MAX = 300;

/**
 * Publicação e agendamento (E06): resumo do checklist, rótulos finais, agora ou agendar (fuso de
 * Cuiabá), destinos, push urgente (cria e aprova o pedido em A09, A-128) e aviso de
 * manchete. `<dialog>` nativo: foco preso, Esc fecha, camada superior sem z-index.
 */
export function PublishDialog({
  articleId,
  blocker,
  labels,
  hasTopic,
  headline,
  canRequestUrgent = false,
  publish,
  dirty = false,
  onSaveFirst,
  className,
}: PublishDialogProps) {
  const router = useRouter();
  const uid = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [at, setAt] = useState("");
  const [dest, setDest] = useState<Set<PublishDestination>>(new Set(["home", "section"]));
  const [push, setPush] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<PublishReply | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);

  const toggle = (d: PublishDestination, on: boolean) =>
    setDest((prev) => {
      const next = new Set(prev);
      if (on) next.add(d);
      else next.delete(d);
      return next;
    });

  const wantsPush = canRequestUrgent && push && mode === "now";

  const confirm = () => {
    if (mode === "schedule" && !at) {
      setError(T.invalidDate);
      return;
    }
    if (wantsPush && !justification.trim()) {
      setFieldError(T.pushJustificationRequired);
      return;
    }
    start(async () => {
      // Nunca publica a versão antiga em silêncio: com edição pendente, salva antes ou para.
      if (dirty && !(onSaveFirst && (await onSaveFirst()))) {
        setError(T.saveFailed);
        return;
      }
      const r = await publish({
        id: articleId,
        when: mode === "now" ? "now" : { at },
        destinations: ALL.filter((d) => dest.has(d)),
        ...(wantsPush ? { push: { justification: justification.trim() } } : {}),
      });
      if (r.ok) {
        setOpen(false);
        setStatus(r);
        router.refresh();
      } else setError(r.message);
    });
  };

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <Button
        size="md"
        icon="check"
        disabled={Boolean(blocker)}
        aria-describedby={blocker ? `${uid}-bloqueio` : undefined}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {T.open}
      </Button>
      {blocker && (
        <p id={`${uid}-bloqueio`} className="flex items-start gap-1.5 type-meta text-warn">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
          {T.blocked(blocker)}
        </p>
      )}
      <p role="status" aria-live="polite" className="type-meta text-service">
        {status?.message}
        {status?.pushQueueHref && (
          <>
            {" "}
            <Link
              href={status.pushQueueHref}
              className="text-link underline-offset-4 hover:underline"
            >
              {T.pushQueueLink}
            </Link>
          </>
        )}
      </p>

      <dialog
        ref={ref}

        tabIndex={-1}
        aria-labelledby={`${uid}-titulo`}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-auto w-full max-w-lg bg-transparent p-4 backdrop:bg-overlay backdrop:backdrop-blur-scrim open:motion-safe:animate-fade-in"
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          className="relative flex max-h-[90dvh] flex-col gap-5 overflow-y-auto rounded-xl bg-card-white p-6 shadow-dialog"
        >
          <span className="absolute top-2 right-2">
            <IconButton
              icon="x"
              variant="ghost"
              size={44}
              label={T.cancel}
              onClick={() => setOpen(false)}
            />
          </span>
          <h2 id={`${uid}-titulo`} className="pr-12 text-18 font-semibold text-strong">
            {T.title}
          </h2>

          <section className="flex flex-col gap-2">
            <h3 className="type-eyebrow text-meta">{T.checklist}</h3>
            <p className="flex items-center gap-2 type-body text-service">
              <Icon name="check" size={20} />
              {T.checklistOk}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="type-eyebrow text-meta">{T.labels}</h3>
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <OriginLabel key={l.kind} label={l} />
              ))}
            </div>
          </section>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 type-eyebrow text-meta">{T.when}</legend>
            {(["now", "schedule"] as const).map((m) => (
              <label key={m} className="flex min-h-tap items-center gap-3 type-body text-strong">
                <input
                  type="radio"
                  name={`${uid}-quando`}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="size-5 accent-(--action-primary)"
                />
                {m === "now" ? T.now : T.schedule}
              </label>
            ))}
            {mode === "schedule" && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-hora`} className="type-label text-strong">
                  {T.at}
                </label>
                <input
                  id={`${uid}-hora`}
                  type="datetime-local"
                  value={at}
                  onChange={(e) => {
                    setAt(e.target.value);
                    setError(null);
                  }}
                  aria-describedby={`${uid}-hora-dica`}
                  className="border-control h-input rounded-lg bg-input px-4 type-body text-strong"
                />
                <p id={`${uid}-hora-dica`} className="type-meta text-meta">
                  {T.atHint}
                </p>
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 type-eyebrow text-meta">{T.destinations}</legend>
            {ALL.map((d) => {
              const disabled = d === "topic" && !hasTopic;
              return (
                <label
                  key={d}
                  className={cx(
                    "flex min-h-tap items-center gap-3 type-body",
                    disabled ? "text-placeholder" : "text-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={dest.has(d) && !disabled}
                    disabled={disabled}
                    onChange={(e) => toggle(d, e.target.checked)}
                    className="size-5 accent-(--action-primary)"
                  />
                  {T.destination[d]}
                  {disabled && <span className="type-meta">({T.noTopic})</span>}
                </label>
              );
            })}
            {(() => {
              const pushDisabled = !canRequestUrgent || mode === "schedule";
              return (
                <label
                  className={cx(
                    "flex min-h-tap items-center gap-3 type-body",
                    pushDisabled ? "text-placeholder" : "text-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={push && !pushDisabled}
                    disabled={pushDisabled}
                    onChange={(e) => {
                      setPush(e.target.checked);
                      setFieldError(null);
                    }}
                    aria-describedby={`${uid}-push`}
                    className="size-5 accent-(--action-primary)"
                  />
                  {T.push}
                </label>
              );
            })()}
            <p id={`${uid}-push`} className="type-meta text-meta">
              {canRequestUrgent ? T.pushNote : T.pushUnavailable}
            </p>
            {wantsPush && (
              <div className="mt-2 flex flex-col gap-2">
                <label htmlFor={`${uid}-just`} className="type-label text-strong">
                  {T.pushJustification}
                </label>
                <textarea
                  id={`${uid}-just`}
                  value={justification}
                  aria-required
                  maxLength={JUSTIFICATION_MAX}
                  rows={3}
                  onChange={(e) => {
                    setJustification(e.target.value);
                    setFieldError(null);
                  }}
                  aria-describedby={`${uid}-just-dica${fieldError ? ` ${uid}-just-erro` : ""}`}
                  aria-invalid={fieldError ? true : undefined}
                  className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
                />
                <p id={`${uid}-just-dica`} className="type-meta text-meta">
                  {T.pushJustificationHint} {justification.length}/{JUSTIFICATION_MAX}
                </p>
                {fieldError && (
                  <p
                    id={`${uid}-just-erro`}
                    role="alert"
                    className="flex items-start gap-1.5 type-meta text-danger"
                  >
                    <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
                    {fieldError}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {headline && dest.has("home") && (
            <p className="flex items-start gap-2 rounded-md bg-atencao-soft p-3 type-meta text-strong">
              <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0 text-warn" />
              {T.headline(headline)}
            </p>
          )}

          {dirty && (
            <p className="flex items-start gap-2 rounded-md bg-atencao-soft p-3 type-meta text-strong">
              <Icon name="pencil" size={16} className="mt-0.5 shrink-0 text-warn" />
              {T.unsaved}
            </p>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-1.5 type-body text-danger">
              <Icon name="circle-alert" size={20} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" size="md" disabled={pending}>
              {mode === "now"
                ? dirty
                  ? T.saveAndPublish
                  : T.confirm
                : dirty
                  ? T.saveAndSchedule
                  : T.confirmSchedule}
            </Button>
            <Button size="md" variant="text" onClick={() => setOpen(false)}>
              {T.cancel}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
