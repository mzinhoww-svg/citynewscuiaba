"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { formatWhen } from "@/lib/format/date";
import { PIN_DURATIONS, untilText } from "@/lib/featured";
import { parseCuiabaDateTime } from "@/lib/studio/plan";
import type { BoardSlot } from "@/lib/studio/featured";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { TextField } from "../../ui/TextField";
import { AdminStatus, type AdminReply } from "../admin/AdminStatus";
import type { FeaturedApi, PinDurationChoice, SearchHit } from "./types";

export interface PinFormProps {
  slot: BoardSlot;
  /** Fixação que será encerrada junto (botão Trocar ou "Escolher outra"). */
  replaceId?: string;
  api: Pick<FeaturedApi, "pin" | "search">;
  /** Agora (ISO), para o texto de pré-visualização. */
  nowIso: string;
  onDone: (r: AdminReply) => void;
  onCancel: () => void;
}

const F = T.form;
type Choice = (typeof PIN_DURATIONS)[number] | "until_date";
const CHOICES: readonly Choice[] = [
  ...PIN_DURATIONS.filter((d) => d !== "until_removed"),
  "until_date",
  "until_removed",
];
const label = (c: Choice) => (c === "until_date" ? F.untilDate : F.durations[c]);

/**
 * Formulário de fixação: busca a matéria por título (só publicadas, não patrocinadas), escolhe o
 * prazo (1 h a 3 dias, data final ou até remover) e mostra como a posição ficará antes de confirmar.
 * Matéria sem capa aprovada aparece com aviso e não pode ser escolhida (R39).
 */
export function PinForm({ slot, replaceId, api, nowIso, onDone, onCancel }: PinFormProps) {
  const uid = useId().replace(/:/g, "");
  const [q, setQ] = useState("");
  // Resultado da busca e o termo a que ele responde: "buscando" e "sem busca" saem daí, sem
  // estado extra mexido de dentro do efeito.
  const [found, setFound] = useState<{ term: string; hits: SearchHit[] } | null>(null);
  const [chosen, setChosen] = useState<SearchHit | null>(null);
  const [choice, setChoice] = useState<Choice>("until_removed");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [busy, start] = useTransition();

  // Busca com pequena espera: só pergunta ao servidor depois que a pessoa para de digitar.
  const term = q.trim();
  const searchable = term.length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const t = setTimeout(async () => {
      let hits: SearchHit[] = [];
      try {
        hits = await api.search(term);
      } catch {
        hits = [];
      }
      if (live) setFound({ term, hits });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term, searchable, api]);
  const searching = searchable && found?.term !== term;
  const hits = searchable && found?.term === term ? found.hits : null;

  const now = new Date(nowIso);
  const untilDate = choice === "until_date" ? parseCuiabaDateTime(until) : null;
  const duration: PinDurationChoice | null =
    choice === "until_date" ? (untilDate ? { until: untilDate.toISOString() } : null) : choice;
  const endsAt = (() => {
    if (!duration) return null;
    if (typeof duration === "object") return duration.until;
    if (duration === "until_removed") return null;
    const hours = { "1h": 1, "3h": 3, "6h": 6, "12h": 12, "24h": 24, "3d": 72 }[duration];
    return new Date(now.getTime() + hours * 3_600_000).toISOString();
  })();
  const ready = !!chosen?.imageSrc && !!duration;

  const submit = () => {
    if (!chosen || !duration) return;
    start(async () => {
      const r = await api.pin({
        slotKey: slot.slotKey,
        sectionSlug: slot.section?.slug,
        articleId: chosen.id,
        duration,
        note: note.trim() || undefined,
        replaceId,
      });
      if (r.ok) onDone(r);
      else setStatus(r);
    });
  };

  return (
    <form
      className="flex flex-col gap-6 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) submit();
      }}
      aria-label={F.title}
    >
      <p className="type-body text-strong">
        <span className="font-semibold">{F.slot}:</span> {slot.label}
      </p>

      <div className="flex flex-col gap-3">
        <TextField
          id={`${uid}-q`}
          label={F.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          hint={F.searchHint}
          icon="search"
          autoComplete="off"
          maxLength={80}
        />
        <div aria-live="polite" className="flex flex-col gap-2">
          {searching && <p className="type-meta text-meta">…</p>}
          {hits && !searching && hits.length === 0 && (
            <p className="type-body text-meta">{F.noResults}</p>
          )}
          {hits && hits.length > 0 && (
            <ul aria-label={F.results} className="flex flex-col gap-2">
              {hits.map((h) => (
                <li
                  key={h.id}
                  className={cx(
                    "flex flex-wrap items-center gap-3 border px-3 py-2",
                    chosen?.id === h.id ? "border-line-strong bg-section" : "border-line-subtle",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="type-body font-medium text-strong">{h.title}</p>
                    <p className="type-meta text-meta">
                      {h.sectionName} · {formatWhen(h.publishedAt, now)}
                    </p>
                    {!h.imageSrc && (
                      <p className="inline-flex items-center gap-1.5 type-meta font-medium text-warn">
                        <Icon name="triangle-alert" size={16} />
                        {T.noCover}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!h.imageSrc}
                    aria-label={`${F.pick}: ${h.title}`}
                    onClick={() => setChosen(h)}
                  >
                    {F.pick}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {chosen && (
          <p className="type-body font-medium text-strong" data-testid="pin-chosen">
            {F.chosen(chosen.title)}
          </p>
        )}
        {hits?.some((h) => !h.imageSrc) && (
          <p role="note" className="type-meta text-warn">
            {T.noCoverWarning}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="type-meta font-semibold text-strong">{F.duration}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={F.duration}>
          {CHOICES.map((c) => (
            <label
              key={c}
              className={cx(
                "inline-flex min-h-tap cursor-pointer items-center rounded-md border px-4 type-body font-medium text-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-line-strong",
                choice === c
                  ? "border-line-strong bg-section"
                  : "border-line-control bg-card-white",
              )}
            >
              <input
                type="radio"
                name={`${uid}-duration`}
                value={c}
                checked={choice === c}
                onChange={() => setChoice(c)}
                className="sr-only"
              />
              {label(c)}
            </label>
          ))}
        </div>
        {choice === "until_date" && (
          <TextField
            id={`${uid}-until`}
            label={F.untilDateLabel}
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            error={until && !untilDate ? T.error.duration : undefined}
          />
        )}
      </fieldset>

      <TextField
        id={`${uid}-note`}
        label={F.note}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
      />

      <section
        aria-labelledby={`${uid}-preview`}
        className="flex flex-col gap-1 border-l-2 border-line-strong bg-section px-4 py-3"
      >
        <h3 id={`${uid}-preview`} className="type-eyebrow">
          {F.preview}
        </h3>
        <p className="type-body text-strong" data-testid="pin-preview">
          {chosen ? F.previewText(slot.label, chosen.title) : F.previewNone}
        </p>
        {chosen && (
          <p className="type-meta text-meta">
            {endsAt ? F.previewEnds(untilText(endsAt, now)) : F.previewOpen}
          </p>
        )}
      </section>

      <AdminStatus status={status} />

      <div className="flex flex-wrap gap-3">
        <Button size="md" type="submit" disabled={!ready || busy}>
          {replaceId ? T.actions.swap : T.actions.submit}
        </Button>
        <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
          {T.actions.cancel}
        </Button>
      </div>
    </form>
  );
}
