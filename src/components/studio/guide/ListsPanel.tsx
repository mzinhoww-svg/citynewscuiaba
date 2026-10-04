"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { GUIDE_ADMIN_TEXT } from "@/content/pt-BR/guide";
import { formatDate, formatWhen } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, type AdminReply } from "../admin/AdminStatus";
import { AdjustDialog, type AdjustPayload, type VenueChoice } from "./AdjustDialog";
import { ReasonDialog } from "./ProposalsPanel";
import type { AdminList } from "./types";

const T = GUIDE_ADMIN_TEXT.lists;

export type SponsorPayload =
  | { id: string; sponsored: false }
  | { id: string; sponsored: true; sponsorKind: "citynews" | "partner"; sponsorName: string };

export interface ListsPanelProps {
  lists: AdminList[];
  venues: VenueChoice[];
  /** Só quem tem `site.manage` liga a flag Patrocinado. */
  canSponsor: boolean;
  adjust: (i: AdjustPayload) => Promise<AdminReply>;
  suspend: (i: { id: string; reason: string }) => Promise<AdminReply>;
  restore: (i: { id: string }) => Promise<AdminReply>;
  sponsor: (i: SponsorPayload) => Promise<AdminReply>;
}

/**
 * Listas (GUIA-T5): situação, atualização de 90 dias, suspensão e reativação, ajuste e a flag
 * Patrocinado (só CityNews e parceiros, nunca altera a ordem). A amostra de revisão mostra o que
 * as regras do Guia publicaram sozinhas.
 */
export function ListsPanel(props: ListsPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [dialogError, setDialogError] = useState<AdminReply | null>(null);
  const [dialog, setDialog] = useState<{
    kind: "adjust" | "suspend" | "sponsor";
    id: string;
  } | null>(null);
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
  const current = dialog ? props.lists.find((l) => l.id === dialog.id) : null;
  const sample = props.lists.filter((l) => l.status === "published" && l.publishedBy === "rule");

  return (
    <div className="flex flex-col gap-8">
      <AdminStatus status={status} />
      {props.lists.length === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <AdminTable
          caption={T.table}
          minWidth="min-w-[56rem]"
          headers={[
            T.col.title,
            T.col.status,
            T.col.origin,
            T.col.updated,
            T.col.next,
            T.col.sponsor,
            T.col.actions,
          ]}
        >
          {props.lists.map((l) => (
            <tr key={l.id} className="border-b border-line-subtle align-top last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {l.title}
                <span className="block type-meta font-normal text-meta">
                  {l.items.length} lugares
                  {l.status === "suspended" && l.suspendedReason
                    ? ` · ${T.reason}: ${l.suspendedReason}`
                    : ""}
                </span>
              </th>
              <td className="px-3 py-3 type-body text-body">{T.status[l.status]}</td>
              <td className="px-3 py-3 type-body text-body">
                {GUIDE_ADMIN_TEXT.proposals.origin[l.origin]}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {l.refreshedAt ? formatDate(l.refreshedAt) : T.never}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {l.nextRefreshAt && l.status === "published"
                  ? formatDate(l.nextRefreshAt)
                  : T.never}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {l.sponsored ? `Patrocinado · ${l.sponsorName}` : T.sponsorOff}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {l.status === "published" && (
                    <Button size="sm" variant="outline" href={`/guia-cuiaba/${l.slug}`}>
                      {T.view}
                    </Button>
                  )}
                  {l.status !== "discarded" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: "adjust", id: l.id })}
                    >
                      {GUIDE_ADMIN_TEXT.proposals.adjust}
                    </Button>
                  )}
                  {l.status === "published" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: "suspend", id: l.id })}
                    >
                      {T.suspend}
                    </Button>
                  )}
                  {l.status === "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run(() => props.restore({ id: l.id }))}
                    >
                      {T.restore}
                    </Button>
                  )}
                  {props.canSponsor && l.status !== "discarded" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: "sponsor", id: l.id })}
                    >
                      {T.sponsor}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {sample.length > 0 && (
        <section aria-labelledby="guia-amostra" className="flex flex-col gap-2">
          <h2 id="guia-amostra" className="type-section text-strong">
            {T.sample}
          </h2>
          <p className="type-meta text-meta">{T.sampleHint}</p>
          <ul className="flex flex-col gap-1">
            {sample.map((l) => (
              <li key={l.id} className="type-body text-body">
                <Link href={`/guia-cuiaba/${l.slug}`} className="text-link underline">
                  {l.title}
                </Link>{" "}
                <span className="text-meta">
                  · {l.publishedAt ? formatWhen(l.publishedAt) : ""} · {T.ruleBy}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog?.kind === "adjust" && current && (
        <AdjustDialog
          list={current}
          candidates={props.venues}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.adjust(v))}
        />
      )}
      {dialog?.kind === "suspend" && current && (
        <ReasonDialog
          title={T.suspendTitle}
          label={T.suspendReason}
          confirm={T.suspendConfirm}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(() => props.suspend({ id: current.id, reason }))}
        />
      )}
      {dialog?.kind === "sponsor" && current && (
        <SponsorDialog
          list={current}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => run(() => props.sponsor(v))}
        />
      )}
    </div>
  );
}

function SponsorDialog({
  list,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  list: AdminList;
  busy: boolean;
  error: AdminReply | null;
  onClose: () => void;
  onSubmit: (v: SponsorPayload) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [on, setOn] = useState(list.sponsored);
  const [kind, setKind] = useState<"citynews" | "partner">(list.sponsorKind ?? "citynews");
  const [name, setName] = useState(list.sponsorKind === "partner" ? (list.sponsorName ?? "") : "");
  const ready = !on || kind === "citynews" || name.trim().length >= 2;
  return (
    <Dialog open wide title={T.sponsorTitle} onClose={onClose}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(
            on
              ? {
                  id: list.id,
                  sponsored: true,
                  sponsorKind: kind,
                  sponsorName: kind === "citynews" ? "CityNews" : name.trim(),
                }
              : { id: list.id, sponsored: false },
          );
        }}
      >
        <p className="type-body text-body">{T.sponsorRule}</p>
        <label className="flex min-h-tap items-center gap-2.5 type-body text-strong">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="size-5 shrink-0 accent-action-primary"
          />
          Patrocinado
        </label>
        {on && (
          <>
            <Select
              id={`${uid}-tipo`}
              name="tipo"
              label={T.sponsorKind}
              options={[
                { value: "citynews", label: T.sponsorKinds.citynews },
                { value: "partner", label: T.sponsorKinds.partner },
              ]}
              value={kind}
              onChange={(v) => setKind(v === "partner" ? "partner" : "citynews")}
            />
            {kind === "partner" && (
              <TextField
                id={`${uid}-nome`}
                label={T.sponsorName}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
          </>
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
          <Button size="md" type="submit" disabled={busy || !ready}>
            {T.sponsorSave}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
