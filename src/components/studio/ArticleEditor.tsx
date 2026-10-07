"use client";

import type { JSONContent } from "@tiptap/react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
  type Ref,
} from "react";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import type { DiffPart } from "@/lib/diff/words";
import { formatHour } from "@/lib/format/date";
import { ARTICLE_LIMITS } from "@/lib/studio/checklist";
import {
  clearDraft,
  hasDraft,
  loadDraft,
  saveDraft,
  subscribeDrafts,
  type DraftData,
} from "@/lib/studio/draft-store";
import { useHotkeys } from "@/lib/studio/use-hotkeys";
import { useUnsavedGuard } from "@/lib/studio/use-unsaved-guard";
import { HOTKEYS_TEXT as H } from "@/content/pt-BR/hotkeys";
import { cx } from "../cx";
import { VersionDiff } from "../editorial/VersionDiff";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { Select, type SelectOption } from "../ui/Select";
import { TextField } from "../ui/TextField";
import { RichEditor } from "./editor/LazyRichEditor";

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
  /** ISO do último salvamento no servidor, para a barra "Salvo às 14h02" (item 48). */
  savedAt?: string;
  /** Avisa quando o formulário passa a ter (ou deixa de ter) alterações não salvas. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Controle para quem publica: salvar o formulário antes (item 4). */
  handleRef?: Ref<ArticleEditorHandle>;
  className?: string;
}

/** Ações do editor expostas ao diálogo de publicação. */
export interface ArticleEditorHandle {
  /** Salva o formulário atual; `null` quando não há como salvar (modo leitura). */
  save: () => Promise<SaveReply | null>;
}

type FormState = EditorDraft & { tagsText: string; placesText: string };

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const toDoc = (d: FormState) => ({
  title: d.title,
  dek: d.dek,
  body: d.body,
  sectionSlug: d.sectionSlug,
  topicId: d.topicId,
  tags: splitList(d.tagsText),
  neighborhoods: splitList(d.placesText).map((x) => x.toLowerCase()),
  seoTitle: d.seoTitle,
  seoDescription: d.seoDescription,
});

const fromDraft = (r: DraftData): FormState => ({
  title: r.title,
  dek: r.dek,
  body: r.body as JSONContent,
  sectionSlug: r.sectionSlug,
  topicId: r.topicId,
  tags: r.tags,
  neighborhoods: r.neighborhoods,
  seoTitle: r.seoTitle,
  seoDescription: r.seoDescription,
  tagsText: r.tags.join(", "),
  placesText: r.neighborhoods.join(", "),
});

/** Rascunho automático: grava neste aparelho 5 s depois da última edição (item 48, E-18). */
const AUTOSAVE_MS = 5000;

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
 * Recarregar no conflito guarda o texto local neste aparelho (`draft-store`) e oferece
 * "Restaurar meu texto" (item 5). Em modo leitura nenhum campo muda (item 6).
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
  savedAt,
  onDirtyChange,
  handleRef,
  className,
}: ArticleEditorProps) {
  const router = useRouter();
  const uid = useId();
  const fromInitial = (): FormState => ({
    ...initial,
    tagsText: initial.tags.join(", "),
    placesText: initial.neighborhoods.join(", "),
  });
  const [d, setD] = useState(fromInitial);
  // Nova versão no servidor (salvamento próprio, sugestão aplicada, conflito recarregado):
  // o formulário volta ao que está salvo, sem desmontar (a mensagem de status fica).
  const [synced, setSynced] = useState(baseVersion);
  const [editorKey, setEditorKey] = useState(0);
  // Documento do último salvamento feito aqui, até a versão nova chegar do servidor.
  const [savedSnap, setSavedSnap] = useState<string | null>(null);
  if (synced !== baseVersion) {
    setSynced(baseVersion);
    setD(fromInitial());
    setSavedSnap(null);
    setEditorKey((k) => k + 1);
  }
  const [lastSavedAt, setLastSavedAt] = useState(savedAt ?? null);
  // Rascunho automático desta sessão: não vira aviso de "restaurar" e some ao salvar.
  const [autoOwned, setAutoOwned] = useState(false);
  const [autoAt, setAutoAt] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveReply | null>(null);
  const [pending, start] = useTransition();
  const [reloading, startReload] = useTransition();
  // Texto local guardado neste aparelho (conflito recarregado ou sessão anterior). Lido do
  // armazenamento local depois da hidratação (no servidor é sempre `false`), então um rascunho
  // de uma sessão anterior também volta a ser oferecido.
  const stored = useSyncExternalStore(
    subscribeDrafts,
    () => hasDraft(articleId),
    () => false,
  );
  // Sem armazenamento local (janela privada, cota), o texto fica na memória desta página.
  const [memDraft, setMemDraft] = useState<DraftData | null>(null);
  const kept = (stored && !autoOwned) || memDraft !== null;
  const disabled = readOnly || !save;
  const offerPending = kept && !disabled;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setD((p) => ({ ...p, [k]: v }));

  const savedDoc = savedSnap ?? JSON.stringify(toDoc(fromInitial()));
  const dirty = useMemo(
    () => !disabled && JSON.stringify(toDoc(d)) !== savedDoc,
    [d, savedDoc, disabled],
  );
  useUnsavedGuard(dirty);

  // Debounce de 5 s: cada edição reinicia a contagem. Com um texto guardado à espera de decisão
  // (restaurar ou descartar), não grava por cima dele. Voltar ao salvo apaga o rascunho desta
  // sessão, para ele não ser oferecido depois sem motivo.
  useEffect(() => {
    if (disabled || offerPending || (!dirty && !autoOwned)) return;
    const t = setTimeout(() => {
      if (!dirty) {
        clearDraft(articleId);
        setAutoOwned(false);
        setAutoAt(null);
        return;
      }
      const now = new Date().toISOString();
      setAutoOwned(true);
      saveDraft(articleId, { ...toDoc(d), baseVersion, savedAt: now });
      setAutoAt(hasDraft(articleId) ? now : null);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [d, dirty, disabled, offerPending, autoOwned, articleId, baseVersion]);
  const lastDirty = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastDirty.current === dirty) return;
    lastDirty.current = dirty;
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const persist = async (): Promise<SaveReply | null> => {
    if (!save || readOnly) return null;
    const doc = toDoc(d);
    const r = await save({ id: articleId, baseVersion, doc });
    setStatus(r);
    if (r.ok) {
      setSavedSnap(JSON.stringify(doc));
      setLastSavedAt(new Date().toISOString());
      if (autoOwned) {
        clearDraft(articleId);
        setAutoOwned(false);
        setAutoAt(null);
      }
      router.refresh();
    }
    return r;
  };

  useImperativeHandle(handleRef, () => ({ save: persist }));

  const submit = () => {
    start(async () => {
      await persist();
    });
  };

  // Ctrl/⌘+S (item 53) salva como o botão, também com o foco no campo; o navegador não abre
  // o "Salvar página". Em modo leitura o atalho fica desligado.
  useHotkeys(
    {
      "mod+s": () => {
        if (!pending) submit();
      },
    },
    { enabled: !disabled, help: [{ keys: ["Ctrl+S", "⌘+S"], label: H.save }] },
  );

  // Conflito: guarda o texto local antes de trazer a versão atual (nada se perde).
  const reload = () => {
    const local: DraftData = { ...toDoc(d), baseVersion, savedAt: new Date().toISOString() };
    setAutoOwned(false);
    setAutoAt(null);
    saveDraft(articleId, local);
    setMemDraft(hasDraft(articleId) ? null : local);
    setStatus(null);
    startReload(() => router.refresh());
  };

  const restore = () => {
    const r = loadDraft(articleId) ?? memDraft;
    if (r) {
      setD(fromDraft(r));
      setEditorKey((k) => k + 1);
    }
    discardKept();
  };

  function discardKept() {
    clearDraft(articleId);
    setMemDraft(null);
  }

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
          readOnly={disabled}
          hint={disabled ? undefined : T.titleCounter(d.title.length, ARTICLE_LIMITS.title)}
          error={
            !disabled && d.title.length > ARTICLE_LIMITS.title
              ? T.titleTooLong(ARTICLE_LIMITS.title)
              : undefined
          }
          onChange={(e) => set("title", e.target.value)}
        />
        <OriginNote origin={origins.title} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${uid}-linha`} className="type-label text-strong">
          {T.fields.dek}
        </label>
        <textarea
          id={`${uid}-linha`}
          rows={2}
          maxLength={400}
          value={d.dek}
          readOnly={disabled}
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
          disabled={disabled}
          onChange={(v) => set("sectionSlug", v)}
        />
        <Select
          id={`${uid}-assunto`}
          name="assunto"
          label={T.fields.topic}
          options={[{ value: "", label: T.fields.noTopic }, ...options.topics]}
          value={d.topicId ?? ""}
          disabled={disabled}
          onChange={(v) => set("topicId", v || null)}
        />
        <TextField
          id={`${uid}-tags`}
          label={T.fields.tags}
          hint={T.fields.tagsHint}
          value={d.tagsText}
          readOnly={disabled}
          onChange={(e) => set("tagsText", e.target.value)}
        />
        <TextField
          id={`${uid}-local`}
          label={T.fields.neighborhoods}
          hint={T.fields.neighborhoodsHint}
          value={d.placesText}
          readOnly={disabled}
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
          readOnly={disabled}
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
        <label htmlFor={`${uid}-seo-desc`} className="type-label text-strong">
          {T.fields.seoDescription}
        </label>
        <textarea
          id={`${uid}-seo-desc`}
          rows={2}
          maxLength={300}
          value={d.seoDescription}
          readOnly={disabled}
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
                <Button size="sm" variant="outline" onClick={reload}>
                  {T.conflictReload}
                </Button>
              </div>
            </div>
          )}
        </InlineAlert>
      )}
      {kept && !disabled && (
        <InlineAlert tone="info" role="status" title={T.draftKept}>
          <p>{T.draftKeptHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={reloading} onClick={restore}>
              {T.restoreDraft}
            </Button>
            <Button size="sm" variant="text" disabled={reloading} onClick={discardKept}>
              {T.discardDraft}
            </Button>
          </div>
        </InlineAlert>
      )}
      {disabled ? (
        <p role="status" aria-live="polite" className="type-body empty:hidden">
          {status?.ok && <span className="text-service">{status.message}</span>}
        </p>
      ) : (
        // Barra de salvar fixa no pé da tela (item 48): ação e estado sempre à vista.
        <div className="sticky bottom-0 z-sticky flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle bg-page pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="submit" size="md" disabled={pending}>
            {pending ? T.saving : T.save}
          </Button>
          <div className="flex min-w-0 flex-col gap-0.5">
            {dirty ? (
              <p className="flex items-center gap-1.5 type-meta font-semibold text-warn">
                <Icon name="pencil" size={16} className="shrink-0" />
                <span>{T.unsaved}</span>
              </p>
            ) : lastSavedAt ? (
              <p className="flex items-center gap-1.5 type-meta text-service">
                <Icon name="check" size={16} className="shrink-0" />
                <span>{T.savedAt(formatHour(lastSavedAt))}</span>
              </p>
            ) : null}
            {dirty && autoAt && (
              <p className="type-meta text-meta">{T.autosaved(formatHour(autoAt))}</p>
            )}
            <p role="status" aria-live="polite" className="type-meta empty:hidden">
              {status?.ok && <span className="text-service">{status.message}</span>}
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
