"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { EVENT_FORM_TEXT as T } from "@/content/pt-BR/sources-admin-events";
import { DETAIL_TEXT, WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { EVENT_ORIGIN_TEXT, EXTRACT_KIND_TEXT } from "@/content/pt-BR/studio-agenda";
import { isConflict, type ActionFn, type ActionState } from "@/lib/sources/action-state";
import type { EventSourceConfig, ExtractKind } from "@/lib/sources/event-source";
import { EVENT_ORIGINS, EXTRACT_KINDS } from "@/lib/sources/event-source-constants";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Select } from "../../ui/Select";
import { TextArea } from "../../ui/TextArea";
import { TextField } from "../../ui/TextField";
import { useHydratedForm } from "../../ui/useHydratedForm";
import { ActionMessage } from "./fields";

export interface EventSourceFormProps {
  /** Cadastro (com análise do link) ou edição de uma fonte de eventos existente. */
  mode: "create" | "edit";
  /** `analyzeEventLinkAction` (só no cadastro). */
  analyze?: ActionFn;
  /** `createEventSourceAction` ou `updateEventSourceAction`. */
  save: ActionFn;
  /** Categorias da Agenda (`slug` → nome). */
  categories: Readonly<Record<string, string>>;
  basePath: string;
  initialUrl?: string;
  source?: {
    id: string;
    version: number;
    name: string;
    baseUrl: string;
    config: EventSourceConfig;
    archived: boolean;
  };
  className?: string;
}

interface Analysis {
  status: "analyzed" | "duplicate";
  extractKind?: ExtractKind;
  collectUrl?: string;
  name?: string | null;
  duplicate?: { id: string; name: string; archived: boolean };
}

const EMPTY: EventSourceConfig = {
  extractKind: "ai_page",
  origin: "organizer",
  confirms: false,
  notes: [],
  listUrls: [],
  requireCity: false,
  defaultVenue: null,
  defaultNeighborhood: null,
  defaultCategory: null,
};

/**
 * Cadastro e edição de fonte de eventos (AGM-T6, spec §5.1): no cadastro, "Analisar" tenta API
 * Tribe, iCal, RSS e JSON-LD antes de sugerir a leitura da página com IA e preenche nome,
 * endereço e leitura; depois os campos da coleta (confirma fatos, origem, avisos, listagens,
 * exigir cidade, padrões). A fonte nasce pausada e a tela segue para a aba Coleta, onde o teste de
 * conexão mostra a prévia. Erros por campo com `aria-describedby`; resultado em `status`/`alert`.
 */
export function EventSourceForm({
  mode,
  analyze,
  save,
  categories,
  basePath,
  initialUrl = "",
  source,
  className,
}: EventSourceFormProps) {
  const router = useRouter();
  const uid = useId();
  const cfg = source?.config ?? EMPTY;
  const [url, setUrl] = useState(initialUrl);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<ActionState | null>(null);
  const [duplicate, setDuplicate] = useState<Analysis["duplicate"] | null>(null);
  const [name, setName] = useState(source?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(source?.baseUrl ?? "");
  const [extractKind, setExtractKind] = useState<string>(cfg.extractKind);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Texto digitado antes da hidratação não se perde (campos controlados).
  const { ref: analyzeRef, ready: analyzeReady } = useHydratedForm((f) => {
    const v = f.text("url");
    if (v) setUrl(v);
  });
  const { ref: mainRef, ready: mainReady } = useHydratedForm((f) => {
    const n = f.text("name");
    if (n) setName(n);
    const b = f.text("baseUrl");
    if (b) setBaseUrl(b);
    const k = f.text("extractKind");
    if (k) setExtractKind(k);
  });
  const ready = analyzeReady && mainReady;

  async function runAnalyze(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!analyze || !url.trim()) return;
    const form = new FormData();
    form.set("url", url.trim());
    setAnalyzing(true);
    setAnalyzeResult(null);
    setDuplicate(null);
    let r: ActionState;
    try {
      r = await analyze(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setAnalyzing(false);
    setAnalyzeResult(r);
    if (!r.ok) return;
    const a = r.data as Analysis | undefined;
    if (a?.status === "duplicate") {
      setDuplicate(a.duplicate ?? null);
      return;
    }
    if (a?.extractKind) setExtractKind(a.extractKind);
    if (a?.collectUrl) setBaseUrl(a.collectUrl);
    if (a?.name && !name.trim()) setName(a.name);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (source) {
      form.set("id", source.id);
      form.set("version", String(source.version));
    }
    setSaving(true);
    setResult(null);
    let r: ActionState;
    try {
      r = await save(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setSaving(false);
    setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
    if (r.ok && mode === "create") {
      const id = (r.data as { id?: string } | undefined)?.id;
      if (id) {
        router.push(`${basePath}/${id}/coleta?cadastro=eventos`);
        return;
      }
    }
    setResult(r);
    if (r.ok) router.refresh();
  }

  const disabled = saving || source?.archived === true;
  const err = (k: string) => errors[k];

  return (
    <div className={className}>
      {mode === "create" && (
        <div className="mb-6 flex flex-col gap-3">
          <form
            ref={analyzeRef}
            onSubmit={runAnalyze}
            noValidate
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            data-ready={ready ? "true" : undefined}
          >
            <TextField
              id={`${uid}-url`}
              name="url"
              type="url"
              inputMode="url"
              label={T.analyze.label}
              hint={T.analyze.hint}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              error={!analyzeResult?.ok ? analyzeResult?.fieldErrors?.url : undefined}
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              size="lg"
              variant="secondary"
              disabled={!ready || analyzing || url.trim() === ""}
            >
              {analyzing ? T.analyze.working : T.analyze.submit}
            </Button>
          </form>
          <div className="empty:hidden">
            {analyzeResult && (
              <ActionMessage result={analyzeResult}>
                {duplicate && (
                  <Link
                    href={`${basePath}/${duplicate.id}`}
                    className="font-semibold text-link underline-offset-4 hover:underline"
                  >
                    {duplicate.archived
                      ? WIZARD_TEXT.duplicate.restore
                      : WIZARD_TEXT.duplicate.open(duplicate.name)}
                  </Link>
                )}
              </ActionMessage>
            )}
          </div>
        </div>
      )}

      <form
        ref={mainRef}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-5"
        aria-label={mode === "create" ? T.title : T.configTitle}
        data-ready={ready ? "true" : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id={`${uid}-name`}
            name="name"
            label={T.fields.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={err("name")}
            required
            disabled={disabled}
          />
          {mode === "create" ? (
            <TextField
              id={`${uid}-slug`}
              name="slug"
              label={T.fields.slug}
              hint={T.fields.slugHint}
              error={err("slug")}
              disabled={disabled}
            />
          ) : null}
          {mode === "create" ? (
            <TextField
              id={`${uid}-base`}
              name="baseUrl"
              type="url"
              inputMode="url"
              label={T.fields.baseUrl}
              hint={T.fields.baseUrlHint}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              error={err("baseUrl")}
              required
              disabled={disabled}
              className="md:col-span-2"
            />
          ) : (
            <TextField
              id={`${uid}-base`}
              name="baseUrlShown"
              label={T.fields.baseUrl}
              value={baseUrl}
              readOnly
              className="md:col-span-2"
            />
          )}
          <Select
            id={`${uid}-kind`}
            name="extractKind"
            label={T.fields.extractKind}
            value={extractKind}
            onChange={setExtractKind}
            options={EXTRACT_KINDS.map((k) => ({ value: k, label: EXTRACT_KIND_TEXT[k] }))}
            error={err("extractKind")}
            disabled={disabled}
          />
          <Select
            id={`${uid}-origin`}
            name="eventOrigin"
            label={T.fields.eventOrigin}
            defaultValue={cfg.origin}
            options={EVENT_ORIGINS.map((o) => ({ value: o, label: EVENT_ORIGIN_TEXT[o] }))}
            error={err("eventOrigin")}
            disabled={disabled}
          />
        </div>

        <Checkbox
          name="confirms"
          label={T.fields.confirms}
          hint={T.fields.confirmsHint}
          defaultChecked={cfg.confirms}
          disabled={disabled}
        />
        <Checkbox
          name="requireCity"
          label={T.fields.requireCity}
          hint={T.fields.requireCityHint}
          defaultChecked={cfg.requireCity}
          disabled={disabled}
        />

        <TextArea
          id={`${uid}-notes`}
          name="collectorNotes"
          label={T.fields.collectorNotes}
          hint={T.fields.collectorNotesHint}
          defaultValue={cfg.notes.join("\n")}
          rows={3}
          error={err("collectorNotes")}
          disabled={disabled}
        />
        <TextArea
          id={`${uid}-lists`}
          name="listUrls"
          label={T.fields.listUrls}
          hint={T.fields.listUrlsHint}
          defaultValue={cfg.listUrls.join("\n")}
          rows={2}
          error={err("listUrls")}
          disabled={disabled}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            id={`${uid}-venue`}
            name="defaultVenue"
            label={T.fields.defaultVenue}
            hint={T.fields.defaultVenueHint}
            defaultValue={cfg.defaultVenue ?? ""}
            error={err("defaultVenue")}
            disabled={disabled}
          />
          <TextField
            id={`${uid}-hood`}
            name="defaultNeighborhood"
            label={T.fields.defaultNeighborhood}
            defaultValue={cfg.defaultNeighborhood ?? ""}
            error={err("defaultNeighborhood")}
            disabled={disabled}
          />
          <Select
            id={`${uid}-cat`}
            name="defaultCategory"
            label={T.fields.defaultCategory}
            placeholder={T.fields.defaultCategoryNone}
            defaultValue={cfg.defaultCategory ?? ""}
            options={Object.entries(categories).map(([value, label]) => ({ value, label }))}
            error={err("defaultCategory")}
            disabled={disabled}
          />
        </div>

        {mode === "create" && (
          <Checkbox name="termsReviewed" label={T.fields.termsReviewed} disabled={disabled} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="md" disabled={disabled || !ready}>
            {saving ? T.saving : mode === "create" ? T.submitCreate : T.submitUpdate}
          </Button>
        </div>
        <div className="empty:hidden">
          <ActionMessage result={result}>
            {isConflict(result) && (
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                {DETAIL_TEXT.actions.reload}
              </Button>
            )}
          </ActionMessage>
        </div>
      </form>
    </div>
  );
}
