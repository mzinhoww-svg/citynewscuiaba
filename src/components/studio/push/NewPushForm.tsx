"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { NEW_PUSH_TEXT as T, PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import type { AdminAudience, ArticleOption, PushTemplate } from "@/lib/db/queries/push-admin";
import { cuiabaLocalToIso, scheduleProblem } from "@/lib/push/rules";
import { BODY_MAX, sanitizeNotificationText, TITLE_MAX } from "@/lib/push/text";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { InlineAlert } from "../../ui/InlineAlert";
import {
  ActionMessage,
  CONTROL_CLASS,
  describedBy,
  FieldShell,
  SelectField,
} from "../sources/fields";
import { ArticlePicker } from "./ArticlePicker";
import { AudienceField, type ReachState } from "./AudienceField";
import { PushPreview } from "./PushPreview";

export type RequestableKind = "urgent" | "highlight";

export interface NewPushFormProps {
  /** Tipos que a pessoa pode pedir (editor: só Destaque). */
  kinds: readonly RequestableKind[];
  sections: readonly { slug: string; name: string }[];
  templates: readonly PushTemplate[];
  /** Envios pausados: o pedido entra e a tela avisa. */
  paused: boolean;
  /** `requestPushAction`. */
  request: ActionFn;
  /** `estimateAudienceAction`. */
  estimate: ActionFn;
  /** `searchArticlesAction`. */
  search: ActionFn;
  /** Relógio da validação do agendamento (testes). */
  now?: () => Date;
  queueHref?: string;
  className?: string;
}

const count = (s: string) =>
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(s)].length
    : [...s].length;

function fill(template: string, article: ArticleOption | null): string {
  const t = article ? sanitizeNotificationText(article.title, TITLE_MAX) : "";
  const d = article ? sanitizeNotificationText(article.dek, BODY_MAX) : "";
  return template.replace(/\{titulo\}/g, t).replace(/\{linha_fina\}/g, d);
}

function audienceForm(a: AdminAudience): Record<string, string> {
  return a.type === "all"
    ? { audienceType: "all" }
    : { audienceType: a.type, audienceSlug: a.slug };
}

/**
 * Novo envio (spec §10.2): tipo, matéria com busca, título e texto com contadores (60/120),
 * prévia nas três plataformas, público com alcance estimado, quando (urgente só agora; Destaque
 * agora ou agendado até 7 dias fora de 22h–7h), justificativa (obrigatória no urgente) e
 * "Enviar para aprovação". Erros por campo com `aria-describedby`; resultado em `role="status"`.
 */
export function NewPushForm({
  kinds,
  sections,
  templates,
  paused,
  request,
  estimate,
  search,
  now = () => new Date(),
  queueHref = "/estudio/admin/notificacoes/fila",
  className,
}: NewPushFormProps) {
  const uid = useId().replace(/:/g, "");
  const [kind, setKind] = useState<RequestableKind>(kinds[0] ?? "highlight");
  const [article, setArticle] = useState<ArticleOption | null>(null);
  const [template, setTemplate] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AdminAudience>({ type: "all" });
  const [whenType, setWhenType] = useState<"now" | "at">("now");
  const [at, setAt] = useState("");
  const [justification, setJustification] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionState | null>(null);
  const [sending, setSending] = useState(false);
  // Alcance por chave (tipo + público): enquanto a resposta não é da chave atual, está carregando.
  const [reachFor, setReachFor] = useState<{ key: string; reach: ReachState } | null>(null);

  const audienceKey = JSON.stringify(audience);
  const reachKey = `${kind}|${audienceKey}`;
  const reach: ReachState =
    reachFor && reachFor.key === reachKey ? reachFor.reach : { state: "loading" };
  useEffect(() => {
    let alive = true;
    const form = new FormData();
    form.set("kind", kind);
    for (const [k, v] of Object.entries(audienceForm(JSON.parse(audienceKey) as AdminAudience)))
      form.set(k, v);
    const key = `${kind}|${audienceKey}`;
    estimate(form)
      .then((r) => {
        if (!alive) return;
        const n = r?.ok ? (r.data as { reach?: number } | undefined)?.reach : undefined;
        setReachFor({
          key,
          reach: typeof n === "number" ? { state: "ready", n } : { state: "error" },
        });
      })
      .catch(() => alive && setReachFor({ key, reach: { state: "error" } }));
    return () => {
      alive = false;
    };
  }, [kind, audienceKey, estimate]);

  const applyTexts = (a: ArticleOption | null, tpl: string) => {
    const t = templates.find((x) => x.name === tpl);
    setTitle(sanitizeNotificationText(t ? fill(t.title, a) : a ? a.title : "", TITLE_MAX));
    setBody(sanitizeNotificationText(t ? fill(t.body, a) : a ? a.dek : "", BODY_MAX));
  };

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const titleN = count(title);
  const bodyN = count(body);
  const scheduleError =
    kind === "highlight" && whenType === "at" && at
      ? (() => {
          const iso = cuiabaLocalToIso(at);
          if (!iso) return PUSH_ADMIN_TEXT.errors.schedule.invalid;
          const p = scheduleProblem(kind, { type: "at", at: iso }, now().toISOString());
          return p ? PUSH_ADMIN_TEXT.errors.schedule[p] : null;
        })()
      : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!article) next.articleId = T.articleRequired;
    if (!title.trim()) next.title = T.required;
    else if (titleN > TITLE_MAX) next.title = T.overLimit(TITLE_MAX);
    if (!body.trim()) next.body = T.required;
    else if (bodyN > BODY_MAX) next.body = T.overLimit(BODY_MAX);
    if (kind === "highlight" && whenType === "at") {
      if (!at) next.at = PUSH_ADMIN_TEXT.errors.schedule.invalid;
      else if (scheduleError) next.at = scheduleError;
    }
    if (kind === "urgent" && !justification.trim())
      next.justification = PUSH_ADMIN_TEXT.errors.justificationRequired;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setResult({ ok: false, message: T.failed });
      return;
    }
    const form = new FormData();
    form.set("kind", kind);
    form.set("articleId", article!.id);
    form.set("title", title.trim());
    form.set("body", body.trim());
    for (const [k, v] of Object.entries(audienceForm(audience))) form.set(k, v);
    form.set("whenType", kind === "urgent" ? "now" : whenType);
    if (kind === "highlight" && whenType === "at") form.set("at", at);
    if (justification.trim()) form.set("justification", justification.trim());
    setSending(true);
    let r: ActionState;
    try {
      r = await request(form);
    } catch {
      r = { ok: false, message: PUSH_ADMIN_TEXT.errors.unavailable };
    }
    setSending(false);
    setResult(r);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return;
    }
    setErrors({});
    setArticle(null);
    setTemplate("");
    setTitle("");
    setBody("");
    setJustification("");
    setWhenType("now");
    setAt("");
  }

  const originLabel = article?.originLabel ?? "ORIGINAL CITYNEWS";

  return (
    <form onSubmit={submit} noValidate className={cx("flex flex-col gap-6", className)}>
      <InlineAlert tone="info" role="none">
        {PUSH_ADMIN_TEXT.followNote}
      </InlineAlert>
      {paused && (
        <InlineAlert tone="warn" role="status">
          {T.pausedNotice}
        </InlineAlert>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 type-label text-16 text-strong">{T.kind}</legend>
        {kinds.map((k) => (
          <label key={k} className="flex min-h-tap items-start gap-3 type-body text-strong">
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                if (k === "urgent") setWhenType("now");
                clearError("justification");
              }}
              className="mt-2.5 size-5 shrink-0 accent-(--action-primary)"
            />
            <span className="flex flex-col py-2">
              <span>{PUSH_ADMIN_TEXT.kind[k]}</span>
              <span className="type-meta text-meta">{T.kindHint[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <ArticlePicker
        search={async (q) => {
          const form = new FormData();
          form.set("q", q);
          const r = await search(form);
          return r?.ok ? ((r.data as { items?: ArticleOption[] } | undefined)?.items ?? []) : [];
        }}
        value={article}
        onChange={(a) => {
          setArticle(a);
          clearError("articleId");
          applyTexts(a, template);
        }}
        error={errors.articleId}
      />

      {templates.length > 0 && (
        <SelectField
          id={`${uid}-modelo`}
          name="template"
          label={T.template}
          value={template}
          onChange={(v) => {
            setTemplate(v);
            applyTexts(article, v);
          }}
          options={[
            { value: "", label: T.templateNone },
            ...templates.map((t) => ({ value: t.name, label: t.name })),
          ]}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldShell
          id={`${uid}-titulo`}
          label={T.titleField}
          error={errors.title}
          aside={
            <span
              aria-live="polite"
              className={cx("type-meta", titleN > TITLE_MAX ? "text-danger" : "text-meta")}
            >
              {T.counter(titleN, TITLE_MAX)}
            </span>
          }
        >
          <input
            id={`${uid}-titulo`}
            name="title"
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError("title");
            }}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy(`${uid}-titulo`, undefined, errors.title)}
            className={cx(CONTROL_CLASS, errors.title && "field-error")}
          />
        </FieldShell>
        <FieldShell
          id={`${uid}-texto`}
          label={T.bodyField}
          error={errors.body}
          aside={
            <span
              aria-live="polite"
              className={cx("type-meta", bodyN > BODY_MAX ? "text-danger" : "text-meta")}
            >
              {T.counter(bodyN, BODY_MAX)}
            </span>
          }
        >
          <textarea
            id={`${uid}-texto`}
            name="body"
            value={body}
            rows={3}
            maxLength={BODY_MAX}
            onChange={(e) => {
              setBody(e.target.value.replace(/\s*\n\s*/g, " "));
              clearError("body");
            }}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby={describedBy(`${uid}-texto`, undefined, errors.body)}
            className={cx(
              "border-control min-h-24 w-full rounded-lg bg-input px-4 py-3 type-body text-strong",
              errors.body && "field-error",
            )}
          />
        </FieldShell>
      </div>

      <section aria-label={T.preview} className="flex flex-col gap-2">
        <h3 className="type-label text-16 text-strong">{T.preview}</h3>
        <PushPreview title={title} body={body} originLabel={originLabel} />
      </section>

      <AudienceField
        kind={kind}
        sections={sections}
        value={audience}
        onChange={setAudience}
        reach={reach}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 type-label text-16 text-strong">{T.when}</legend>
        {kind === "urgent" ? (
          <p className="flex flex-wrap items-center gap-2 type-body text-strong">
            <span>{T.now}</span>
            <span className="type-meta text-meta">{T.urgentNowOnly}</span>
            <input type="hidden" name="whenType" value="now" />
          </p>
        ) : (
          <>
            {(["now", "at"] as const).map((w) => (
              <label key={w} className="flex min-h-tap items-center gap-3 type-body text-strong">
                <input
                  type="radio"
                  name="whenType"
                  value={w}
                  checked={whenType === w}
                  onChange={() => {
                    setWhenType(w);
                    clearError("at");
                  }}
                  className="size-5 accent-(--action-primary)"
                />
                {w === "now" ? T.now : T.schedule}
              </label>
            ))}
            {whenType === "at" && (
              <FieldShell
                id={`${uid}-hora`}
                label={T.at}
                hint={T.atHint}
                error={errors.at ?? scheduleError}
              >
                <input
                  id={`${uid}-hora`}
                  name="at"
                  type="datetime-local"
                  value={at}
                  onChange={(e) => {
                    setAt(e.target.value);
                    clearError("at");
                  }}
                  aria-invalid={errors.at || scheduleError ? true : undefined}
                  aria-describedby={describedBy(
                    `${uid}-hora`,
                    T.atHint,
                    errors.at ?? scheduleError,
                  )}
                  className={cx(CONTROL_CLASS, (errors.at || scheduleError) && "field-error")}
                />
              </FieldShell>
            )}
          </>
        )}
      </fieldset>

      <FieldShell
        id={`${uid}-just`}
        label={T.justification}
        hint={T.justificationHint}
        error={errors.justification}
        aside={
          kind === "urgent" ? undefined : <span className="type-meta text-meta">opcional</span>
        }
      >
        <textarea
          id={`${uid}-just`}
          name="justification"
          value={justification}
          rows={2}
          maxLength={300}
          aria-required={kind === "urgent"}
          onChange={(e) => {
            setJustification(e.target.value);
            clearError("justification");
          }}
          aria-invalid={errors.justification ? true : undefined}
          aria-describedby={describedBy(`${uid}-just`, T.justificationHint, errors.justification)}
          className={cx(
            "border-control min-h-20 w-full rounded-lg bg-input px-4 py-3 type-body text-strong",
            errors.justification && "field-error",
          )}
        />
      </FieldShell>

      <div className="flex flex-col gap-3">
        <div>
          <Button type="submit" size="md" icon="bell" disabled={sending}>
            {sending ? T.sending : T.submit}
          </Button>
        </div>
        <ActionMessage result={result}>
          {result?.ok && (
            <Link
              href={queueHref}
              className="text-16 font-medium text-link underline-offset-4 hover:underline"
            >
              {T.queueLink}
            </Link>
          )}
        </ActionMessage>
      </div>
    </form>
  );
}
