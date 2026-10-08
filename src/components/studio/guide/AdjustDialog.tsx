"use client";

import { useId, useState } from "react";
import { GUIDE_ADMIN_TEXT } from "@/content/pt-BR/guide";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { TextArea } from "../../ui/TextArea";
import { TextField } from "../../ui/TextField";
import type { AdminReply } from "../admin/AdminStatus";
import type { AdminList } from "./types";

const T = GUIDE_ADMIN_TEXT.adjust;

export interface AdjustPayload {
  id: string;
  title: string;
  intro: string | null;
  criteria: string;
  items: { venueId: string; note: string | null }[];
}

export interface VenueChoice {
  id: string;
  name: string;
  category: string;
  neighborhood: string | null;
}

/**
 * Ajustar uma lista (proposta ou publicada): título, introdução, "Como escolhemos", ordem, nota do
 * editor por lugar e inclusão ou retirada de lugares. O servidor recalcula as pontuações e
 * confere o mínimo de lugares e o texto do critério.
 */
export function AdjustDialog({
  list,
  candidates,
  busy,
  onClose,
  onSubmit,
  error,
}: {
  list: AdminList;
  candidates: readonly VenueChoice[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (p: AdjustPayload) => void;
  error?: AdminReply | null;
}) {
  const uid = useId().replace(/:/g, "");
  const [title, setTitle] = useState(list.title);
  const [intro, setIntro] = useState(list.intro ?? "");
  const [criteria, setCriteria] = useState(list.criteria);
  const [items, setItems] = useState(
    list.items.map((i) => ({ venueId: i.venueId, name: i.name, note: i.note ?? "" })),
  );
  const [add, setAdd] = useState("");
  const [moved, setMoved] = useState(false);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    if (x) next.splice(to, 0, x);
    setItems(next);
    setMoved(true);
  };
  const inList = new Set(items.map((i) => i.venueId));
  const options = candidates
    .filter((c) => !inList.has(c.id) && c.category === list.category)
    .map((c) => ({
      value: c.id,
      label: c.neighborhood ? `${c.name} (${c.neighborhood})` : c.name,
    }));
  const ready = title.trim().length >= 8 && items.length >= 3;

  return (
    <Dialog open wide title={T.title(list.title)} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            id: list.id,
            title: title.trim(),
            intro: intro.trim() || null,
            criteria: criteria.trim(),
            items: items.map((i) => ({ venueId: i.venueId, note: i.note.trim() || null })),
          });
        }}
      >
        <TextField
          id={`${uid}-titulo`}
          label={T.titleField}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-intro`}
          label={T.introField}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
        />
        <TextArea
          id={`${uid}-criterio`}
          name="criterio"
          label={T.criteriaField}
          value={criteria}
          onChange={setCriteria}
          rows={5}
          hint={T.criteriaHint}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="type-meta font-semibold text-strong">{T.items}</legend>
          <ol className="flex flex-col gap-3">
            {items.map((it, i) => (
              <li
                key={it.venueId}
                className="flex flex-col gap-2 rounded-md border border-line-subtle p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-body font-medium text-strong">
                    <span className="tabular-nums">{i + 1}.</span> {it.name}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon="arrow-up"
                      aria-label={`${T.up}: ${it.name}`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      {T.up}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon="arrow-down"
                      aria-label={`${T.down}: ${it.name}`}
                      disabled={i === items.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      {T.down}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon="x"
                      aria-label={`${T.remove}: ${it.name}`}
                      onClick={() => setItems(items.filter((x) => x.venueId !== it.venueId))}
                    >
                      {T.remove}
                    </Button>
                  </div>
                </div>
                <TextField
                  id={`${uid}-nota-${i}`}
                  label={T.note}
                  value={it.note}
                  maxLength={400}
                  onChange={(e) =>
                    setItems(
                      items.map((x) =>
                        x.venueId === it.venueId ? { ...x, note: e.target.value } : x,
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ol>
        </fieldset>
        {options.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <Select
              id={`${uid}-incluir`}
              name="incluir"
              label={T.add}
              placeholder={T.addNone}
              options={options}
              value={add}
              onChange={setAdd}
              className="min-w-64 flex-1"
            />
            <Button
              size="md"
              variant="outline"
              icon="plus"
              disabled={!add}
              onClick={() => {
                const c = candidates.find((x) => x.id === add);
                if (c) setItems([...items, { venueId: c.id, name: c.name, note: "" }]);
                setAdd("");
              }}
            >
              {T.add}
            </Button>
          </div>
        )}
        {moved && (
          <p role="note" className="type-meta text-meta">
            {T.manualOrder}
          </p>
        )}
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {GUIDE_ADMIN_TEXT.proposals.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {T.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
