"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import type { DiffPart } from "@/lib/diff/words";
import { cx } from "../cx";
import { VersionDiff } from "../editorial/VersionDiff";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { Select, type SelectOption } from "../ui/Select";
import { TextField } from "../ui/TextField";
import { RichEditor } from "./editor/Editor";

export type OriginField = "title" | "dek" | "seoTitle" | "seoDescription";

export interface EditorDraft {
  title: string;
  dek: string;
  body: JSONContent;
  sectionSlug: string;
  topicId: string | null;
  tags: string[];
  neighborhoods: string[];
  seoTitle: string;
  seoDescription: string;
}

export type DiffOp = { op: "eq" | "add" | "del"; text: string };

export type SaveReply =
  | { ok: true; message: string; version: number }
  | {
      ok: false;
      message: string;
      conflict?: { version: number; diff: { title: DiffOp[]; dek: DiffOp[]; body: DiffOp[] } };
    };

export interface ArticleEditorProps {
  articleId: string;
  baseVersion: number;
  userId: string;
  initial: EditorDraft;
  /** Origem de cada campo já em texto ("Sugerido pela IA · aceito por Juliana Campos"). */
  origins: Partial<Record<OriginField, { text: string; ai: boolean }>>;
  options: { sections: readonly SelectOption[]; topics: readonly SelectOption[] };
  readOnly?: boolean;
  /** Aviso fixo acima do formulário (ex.: matéria publicada pede modo). */
  notice?: ReactNode;
  save?: (i: { id: string; baseVersion: number; doc: unknown }) => Promise<SaveReply>;
  seoLimits: { title: number; description: number };
  className?: string;
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const toParts = (ops: DiffOp[]): DiffPart[] =>
  ops.map((o) => ({ type: o.op === "eq" ? "same" : o.op, text: o.text }));

function OriginNote({ origin }: { origin?: { text: string; ai: boolean } }) {
  if (!origin) return null;
  return (
    <p
      className={cx("flex items-center gap-1.5 type-meta", origin.ai ? "text-ai" : "text-service")}
    >
      <Icon name={origin.ai ? "layers" : "pencil"} size={16} />
      {origin.text}
    </p>
  );
}

/**
 * Formulário do editor de matéria (E04): título, linha fina, texto rico com marcas de origem,
 * editoria, assunto, tags, local e SEO com contadores. Salvar envia a versão base; conflito
 * mostra o diff do que outra pessoa salvou × o que você tentou salvar, sem sobrescrever.
 */
export function ArticleEditor({
  articleId,
  baseVersion,
  userId,
  initial,
  origins,
  options,
  readOnly = false,
  notice,
  save,
  seoLimits,
  className,
}: ArticleEditorProps) {
  const router = useRouter();
  const uid = useId();
  const fromInitial = () => ({
    ...initial,
    tagsText: initial.tags.join(", "),
    placesText: initial.neighborhoods.join(", "),
  });
  const [d, setD] = useState(fromInitial);
  // Nova versão no servidor (salvamento próprio, sugestão aplicada, conflito recarregado):
  // o formulário volta ao que está salvo, sem desmontar (a mensagem de status fica).
  const [synced, setSynced] = useState(baseVersion);
  const [editorKey, setEditorKey] = useState(0);
  if (synced !== baseVersion) {
    setSynced(baseVersion);
    setD(fromInitial());
    setEditorKey((k) => k + 1);
  }
  const [status, setStatus] = useState<SaveReply | null>(null);
  const [pending, start] = useTransition();
  const disabled = readOnly || !save;

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!save) return;
    start(async () => {
      const r = await save({
        id: articleId,
        baseVersion,
        doc: {
          title: d.title,
          dek: d.dek,
          body: d.body,
          sectionSlug: d.sectionSlug,
          topicId: d.topicId,
          tags: splitList(d.tagsText),
          neighborhoods: splitList(d.placesText).map((x) => x.toLowerCase()),
          seoTitle: d.seoTitle,
          seoDescription: d.seoDescription,
        },
      });
      setStatus(r);
      if (r.ok) router.refresh();
    });
  };

  return (
    <form
      className={cx("flex flex-col gap-5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      aria-describedby={notice ? `${uid}-aviso` : undefined}
    >
      {notice && <div id={`${uid}-aviso`}>{notice}</div>}
      <div className="flex flex-col gap-1">
        <TextField
          id={`${uid}-titulo`}
          label={T.fields.title}
          value={d.title}
          maxLength={200}
          disabled={disabled}
          onChange={(e) => set("title", e.target.value)}
        />
        <OriginNote origin={origins.title} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-linha`} className="type-label text-16 text-strong">
          {T.fields.dek}
        </label>
        <textarea
          id={`${uid}-linha`}
          rows={2}
          maxLength={400}
          value={d.dek}
          disabled={disabled}
          onChange={(e) => set("dek", e.target.value)}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <OriginNote origin={origins.dek} />
      </div>
      <RichEditor
        key={editorKey}
        label={T.fields.body}
        value={d.body}
        userId={userId}
        readOnly={disabled}
        onChange={(doc) => set("body", doc)}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select
          id={`${uid}-editoria`}
          name="editoria"
          label={T.fields.section}
          options={options.sections}
          value={d.sectionSlug}
          onChange={(v) => set("sectionSlug", v)}
        />
        <Select
          id={`${uid}-assunto`}
          name="assunto"
          label={T.fields.topic}
          options={[{ value: "", label: T.fields.noTopic }, ...options.topics]}
          value={d.topicId ?? ""}
          onChange={(v) => set("topicId", v || null)}
        />
        <TextField
          id={`${uid}-tags`}
          label={T.fields.tags}
          hint={T.fields.tagsHint}
          value={d.tagsText}
          disabled={disabled}
          onChange={(e) => set("tagsText", e.target.value)}
        />
        <TextField
          id={`${uid}-local`}
          label={T.fields.neighborhoods}
          hint={T.fields.neighborhoodsHint}
          value={d.placesText}
          disabled={disabled}
          onChange={(e) => set("placesText", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <TextField
          id={`${uid}-seo-titulo`}
          label={T.fields.seoTitle}
          hint={T.counter(d.seoTitle.length, seoLimits.title)}
          value={d.seoTitle}
          maxLength={120}
          disabled={disabled}
          error={
            d.seoTitle.length > seoLimits.title
              ? T.counter(d.seoTitle.length, seoLimits.title)
              : undefined
          }
          onChange={(e) => set("seoTitle", e.target.value)}
        />
        <OriginNote origin={origins.seoTitle} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-seo-desc`} className="type-label text-16 text-strong">
          {T.fields.seoDescription}
        </label>
        <textarea
          id={`${uid}-seo-desc`}
          rows={2}
          maxLength={300}
          value={d.seoDescription}
          disabled={disabled}
          aria-describedby={`${uid}-seo-desc-dica`}
          onChange={(e) => set("seoDescription", e.target.value)}
          className={cx(
            "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
            d.seoDescription.length > seoLimits.description && "field-error",
          )}
        />
        <p
          id={`${uid}-seo-desc-dica`}
          className={cx(
            "type-meta",
            d.seoDescription.length > seoLimits.description ? "text-danger" : "text-meta",
          )}
        >
          {T.counter(d.seoDescription.length, seoLimits.description)}
        </p>
        <OriginNote origin={origins.seoDescription} />
      </div>

      <p role="status" aria-live="polite" className="type-body">
        {status?.ok && <span className="text-service">{status.message}</span>}
      </p>
      {status && !status.ok && (
        <InlineAlert
          tone="error"
          role="alert"
          title={status.conflict ? T.conflictTitle : undefined}
        >
          <p>{status.message}</p>
          {status.conflict && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="type-meta">
                <del className="line-through">{T.conflictSaved}</del> ·{" "}
                <ins className="underline">{T.conflictMine}</ins>
              </p>
              {(["title", "dek", "body"] as const).map((k) =>
                status.conflict!.diff[k].some((o) => o.op !== "eq") ? (
                  <div key={k}>
                    <p className="type-eyebrow text-meta">{T.fields[k]}</p>
                    <VersionDiff parts={toParts(status.conflict!.diff[k])} />
                  </div>
                ) : null,
              )}
              <div>
                <Button size="sm" variant="outline" onClick={() => router.refresh()}>
                  {T.conflictReload}
                </Button>
              </div>
            </div>
          )}
        </InlineAlert>
      )}
      {!disabled && (
        <div>
          <Button type="submit" size="md" disabled={pending}>
            {pending ? T.saving : T.save}
          </Button>
        </div>
      )}
    </form>
  );
}
