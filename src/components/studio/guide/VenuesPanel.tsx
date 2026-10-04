"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { DATA_SOURCE_LABEL, GUIDE_ADMIN_TEXT } from "@/content/pt-BR/guide";
import { formatWhen } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, type AdminReply } from "../admin/AdminStatus";
import { ReasonDialog } from "./ProposalsPanel";
import type { AdminReport, AdminVenue, CategoryOption } from "./types";

const T = GUIDE_ADMIN_TEXT.venues;

export interface VenuePayload {
  id?: string;
  name: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  hours: string | null;
  status: "active" | "inactive";
}

export interface VenuesPanelProps {
  venues: AdminVenue[];
  reports: AdminReport[];
  categories: CategoryOption[];
  save: (i: VenuePayload) => Promise<AdminReply>;
  takedown: (i: { mediaId: string; reason: string }) => Promise<AdminReply>;
  decide: (i: {
    id: string;
    decision: "dismiss" | "confirm";
    note?: string;
  }) => Promise<AdminReply>;
  canTakedown: boolean;
}

/** Lugares (GUIA-T5): cadastro, reclamações abertas e retirada de foto oficial a pedido. */
export function VenuesPanel(props: VenuesPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [dialogError, setDialogError] = useState<AdminReply | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "edit"; venue: AdminVenue | null } | { kind: "takedown"; venue: AdminVenue } | null
  >(null);
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    setDialogError(null);
    if (r.ok) {
      setDialog(null);
      router.refresh();
    } else if (dialog) setDialogError(r);
  };
  const run = (fn: () => Promise<AdminReply>) => start(async () => done(await fn()));
  const catName = (slug: string) => props.categories.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="guia-reclamacoes" className="flex flex-col gap-3">
        <h2 id="guia-reclamacoes" className="type-section text-strong">
          {T.reports.title}
        </h2>
        {props.reports.length === 0 ? (
          <p className="type-body text-meta">{T.reports.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {props.reports.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
              >
                <p className="type-body font-medium text-strong">{T.reports.about(r.venueName)}</p>
                <p className="type-body text-body">{r.reason}</p>
                <p className="type-meta text-meta">
                  {formatWhen(r.createdAt)}
                  {r.contact ? ` · ${r.contact}` : ""} · {T.reports.lists(r.suspendedLists)}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const reply = await props.decide({ id: r.id, decision: "dismiss" });
                        done(reply);
                      })
                    }
                  >
                    {T.reports.dismiss}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const reply = await props.decide({ id: r.id, decision: "confirm" });
                        done(reply);
                      })
                    }
                  >
                    {T.reports.confirm}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <Button size="md" icon="plus" onClick={() => setDialog({ kind: "edit", venue: null })}>
          {T.new}
        </Button>
      </div>

      {props.venues.length === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <AdminTable
          caption={T.table}
          minWidth="min-w-[56rem]"
          headers={[
            T.col.name,
            T.col.category,
            T.col.neighborhood,
            T.col.sources,
            T.col.rating,
            T.col.status,
            T.col.photo,
            T.col.actions,
          ]}
        >
          {props.venues.map((v) => (
            <tr key={v.id} className="border-b border-line-subtle align-top last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {v.name}
                {v.address && (
                  <span className="block type-meta font-normal text-meta">{v.address}</span>
                )}
              </th>
              <td className="px-3 py-3 type-body text-body">{catName(v.category)}</td>
              <td className="px-3 py-3 type-body text-body">{v.neighborhood ?? "—"}</td>
              <td className="px-3 py-3 type-body text-body">
                {v.sources
                  .map((s) => DATA_SOURCE_LABEL[s as keyof typeof DATA_SOURCE_LABEL] ?? s)
                  .join(", ") || "—"}
              </td>
              <td className="px-3 py-3 type-body text-body tabular-nums">
                {v.rating !== null
                  ? `${v.rating.toLocaleString("pt-BR")} (${v.ratingCount ?? 0})`
                  : "—"}
                {v.tripadvisorRank !== null ? ` · #${v.tripadvisorRank}` : ""}
              </td>
              <td className="px-3 py-3 type-body text-body">{T.status[v.status]}</td>
              <td className="px-3 py-3 type-body text-body">
                {v.photoMediaId ? T.photo.yes : T.photo.no}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDialog({ kind: "edit", venue: v })}
                  >
                    {T.edit}
                  </Button>
                  {props.canTakedown && v.photoMediaId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: "takedown", venue: v })}
                    >
                      {T.takedown}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {dialog?.kind === "edit" && (
        <VenueDialog
          venue={dialog.venue}
          categories={props.categories}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.save(v))}
        />
      )}
      {dialog?.kind === "takedown" && dialog.venue.photoMediaId && (
        <ReasonDialog
          title={T.takedownTitle}
          label={T.takedownReason}
          confirm={T.takedownConfirm}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(reason) =>
            run(() => props.takedown({ mediaId: dialog.venue.photoMediaId as string, reason }))
          }
        />
      )}
    </div>
  );
}

function VenueDialog({
  venue,
  categories,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  venue: AdminVenue | null;
  categories: CategoryOption[];
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (v: VenuePayload) => void;
}) {
  const D = T.dialog;
  const uid = useId().replace(/:/g, "");
  const [f, setF] = useState({
    name: venue?.name ?? "",
    category: venue?.category ?? categories[0]?.slug ?? "restaurante",
    subcategory: venue?.subcategory ?? "",
    neighborhood: venue?.neighborhood ?? "",
    address: venue?.address ?? "",
    phone: venue?.phone ?? "",
    website: venue?.website ?? "",
    instagram: venue?.instagram ?? "",
    hours: venue?.hours ?? "",
    status: venue?.status === "inactive" ? "inactive" : "active",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const nn = (s: string) => (s.trim() ? s.trim() : null);
  return (
    <Dialog open wide title={venue ? D.titleEdit(venue.name) : D.titleNew} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...(venue ? { id: venue.id } : {}),
            name: f.name.trim(),
            category: f.category,
            subcategory: nn(f.subcategory),
            neighborhood: nn(f.neighborhood),
            address: nn(f.address),
            phone: nn(f.phone),
            website: nn(f.website),
            instagram: nn(f.instagram),
            hours: nn(f.hours),
            status: f.status === "inactive" ? "inactive" : "active",
          });
        }}
      >
        <TextField
          id={`${uid}-nome`}
          label={D.name}
          value={f.name}
          onChange={set("name")}
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
            id={`${uid}-end`}
            label={D.address}
            value={f.address}
            onChange={set("address")}
          />
          <TextField
            id={`${uid}-tel`}
            label={D.phone}
            type="tel"
            value={f.phone}
            onChange={set("phone")}
          />
          <TextField
            id={`${uid}-site`}
            label={D.website}
            type="url"
            value={f.website}
            onChange={set("website")}
          />
          <TextField
            id={`${uid}-insta`}
            label={D.instagram}
            value={f.instagram}
            onChange={set("instagram")}
          />
          <TextField id={`${uid}-hor`} label={D.hours} value={f.hours} onChange={set("hours")} />
        </div>
        <Select
          id={`${uid}-st`}
          name="situacao"
          label={D.status}
          options={[
            { value: "active", label: T.status.active },
            { value: "inactive", label: T.status.inactive },
          ]}
          value={f.status}
          onChange={(v) => setF({ ...f, status: v })}
        />
        {error && !error.ok && (
          <p role="alert" className="type-body text-danger">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {GUIDE_ADMIN_TEXT.proposals.cancel}
          </Button>
          <Button size="md" type="submit" disabled={busy || f.name.trim().length < 2}>
            {D.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
