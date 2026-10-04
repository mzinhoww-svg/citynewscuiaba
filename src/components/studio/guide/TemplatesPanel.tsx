"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { GUIDE_ADMIN_TEXT } from "@/content/pt-BR/guide";
import { formatDate } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, type AdminReply } from "../admin/AdminStatus";
import type { AdminTemplate, CategoryOption } from "./types";

const T = GUIDE_ADMIN_TEXT.templates;

export interface TemplatePayload {
  id?: string;
  title: string;
  noun: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  take: number;
  minVenues: number;
  active: boolean;
}

export interface TemplatesPanelProps {
  templates: AdminTemplate[];
  categories: CategoryOption[];
  save: (i: TemplatePayload) => Promise<AdminReply>;
  proposeNow: (i: { id: string }) => Promise<AdminReply>;
}

/** Modelos (GUIA-T5): catálogo de categoria x bairro x cozinha, com "Propor agora". */
export function TemplatesPanel(props: TemplatesPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [dialogError, setDialogError] = useState<AdminReply | null>(null);
  const [open, setOpen] = useState<AdminTemplate | "new" | null>(null);
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    setDialogError(null);
    if (r.ok) {
      setOpen(null);
      router.refresh();
    } else if (open) setDialogError(r);
  };
  const catName = (slug: string) => props.categories.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <Button size="md" icon="plus" onClick={() => setOpen("new")}>
          {T.new}
        </Button>
      </div>
      {props.templates.length === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <AdminTable
          caption={T.table}
          minWidth="min-w-[48rem]"
          headers={[
            T.col.title,
            T.col.category,
            T.col.take,
            T.col.active,
            T.col.last,
            T.col.actions,
          ]}
        >
          {props.templates.map((t) => (
            <tr key={t.id} className="border-b border-line-subtle align-top last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {t.title}
                <span className="block type-meta font-normal text-meta">
                  {[t.subcategory, t.neighborhood].filter(Boolean).join(" · ")}
                </span>
              </th>
              <td className="px-3 py-3 type-body text-body">{catName(t.category)}</td>
              <td className="px-3 py-3 type-body text-body tabular-nums">{t.take}</td>
              <td className="px-3 py-3 type-body text-body">{t.active ? "Sim" : "Não"}</td>
              <td className="px-3 py-3 type-body text-body">
                {t.lastProposedAt ? formatDate(t.lastProposedAt) : T.never}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpen(t)}>
                    {T.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !t.active}
                    onClick={() => start(async () => done(await props.proposeNow({ id: t.id })))}
                  >
                    {T.now}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {open && (
        <TemplateDialog
          template={open === "new" ? null : open}
          categories={props.categories}
          busy={busy}
          error={dialogError}
          onClose={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await props.save(v)))}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  template,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  template: AdminTemplate | null;
  categories: CategoryOption[];
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (v: TemplatePayload) => void;
}) {
  const D = T.dialog;
  const uid = useId().replace(/:/g, "");
  const [f, setF] = useState({
    title: template?.title ?? "",
    noun: template?.noun ?? "",
    category: template?.category ?? categories[0]?.slug ?? "restaurante",
    subcategory: template?.subcategory ?? "",
    neighborhood: template?.neighborhood ?? "",
    take: String(template?.take ?? 5),
    min: String(template?.minVenues ?? 5),
    active: template?.active ?? true,
  });
  const set =
    (k: "title" | "noun" | "subcategory" | "neighborhood" | "take" | "min") =>
    (e: { target: { value: string } }) =>
      setF({ ...f, [k]: e.target.value });
  const take = Number(f.take);
  const min = Number(f.min);
  const ready =
    f.title.trim().length >= 8 &&
    f.noun.trim().length >= 3 &&
    Number.isInteger(take) &&
    take >= 3 &&
    take <= 20 &&
    Number.isInteger(min) &&
    min >= 3 &&
    min <= 20;
  return (
    <Dialog open wide title={template ? D.titleEdit(template.title) : D.titleNew} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...(template ? { id: template.id } : {}),
            title: f.title.trim(),
            noun: f.noun.trim(),
            category: f.category,
            subcategory: f.subcategory.trim() || null,
            neighborhood: f.neighborhood.trim() || null,
            take,
            minVenues: min,
            active: f.active,
          });
        }}
      >
        <TextField
          id={`${uid}-titulo`}
          label={D.title}
          value={f.title}
          onChange={set("title")}
          required
        />
        <TextField
          id={`${uid}-noun`}
          label={D.noun}
          value={f.noun}
          onChange={set("noun")}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id={`${uid}-cat`}
            name="categoria"
            label={D.category}
            options={categories.map((c) => ({ value: c.slug, label: c.label }))}
            value={f.category}
            onChange={(v) => setF({ ...f, category: v })}
          />
          <TextField
            id={`${uid}-sub`}
            label={D.subcategory}
            value={f.subcategory}
            onChange={set("subcategory")}
          />
          <TextField
            id={`${uid}-bairro`}
            label={D.neighborhood}
            value={f.neighborhood}
            onChange={set("neighborhood")}
          />
          <TextField
            id={`${uid}-take`}
            label={D.take}
            inputMode="numeric"
            value={f.take}
            onChange={set("take")}
          />
          <TextField
            id={`${uid}-min`}
            label={D.min}
            inputMode="numeric"
            value={f.min}
            onChange={set("min")}
          />
        </div>
        <label className="flex min-h-tap items-center gap-2.5 type-body text-strong">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
            className="size-5 shrink-0 accent-action-primary"
          />
          {D.active}
        </label>
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {GUIDE_ADMIN_TEXT.proposals.cancel}
          </Button>
          <Button size="md" type="submit" disabled={busy || !ready}>
            {D.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
