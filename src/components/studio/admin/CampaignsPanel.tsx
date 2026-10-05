"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { ADMIN_OPS_TEXT as T, CAMPAIGN_STATUS_LABEL } from "@/content/pt-BR/admin-ops";
import { NEVER_SECTIONS, type Campaign } from "@/lib/ads/rules";
import type { CampaignRow } from "@/lib/db/queries/admin-ops";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import { formatDate } from "@/lib/format/date";
import { OriginLabel } from "../../editorial/OriginLabel";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Panel } from "../../ui/Panel";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, CheckList, type AdminReply } from "./AdminStatus";

export interface CampaignsPanelProps {
  campaigns: CampaignRow[];
  sections: { slug: string; name: string }[];
  save: (i: Omit<Campaign, "id"> & { id?: string }) => Promise<AdminReply>;
  remove: (i: { id: string }) => Promise<AdminReply>;
}

const A = T.ads;
const STATUS = Object.entries(CAMPAIGN_STATUS_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Publicidade (A07): campanhas com anunciante, período, peça, editorias permitidas e entregas;
 * regras fixas visíveis; pré-visualização com o selo PATROCINADO.
 */
export function CampaignsPanel({ campaigns, sections, save, remove }: CampaignsPanelProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [open, setOpen] = useState<CampaignRow | "new" | null>(null);
  const [busy, start] = useTransition();
  const allowed = sections.filter((s) => !NEVER_SECTIONS.includes(s.slug));
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) {
      setOpen(null);
      router.refresh();
    }
  };
  const nameOf = (slug: string) => sections.find((s) => s.slug === slug)?.name ?? slug;
  return (
    <div className="flex flex-col gap-8">
      <Panel aria-labelledby={`${uid}-rules`} className="flex flex-col gap-2">
        <h2 id={`${uid}-rules`} className="type-section text-strong">
          {A.rulesTitle}
        </h2>
        <ul className="list-disc pl-5 type-body text-body">
          {A.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <Button size="md" icon="plus" onClick={() => setOpen("new")}>
          {A.create}
        </Button>
      </div>
      {campaigns.length === 0 ? (
        <EmptyState title={A.empty} />
      ) : (
        <AdminTable
          caption={A.table}
          headers={[
            A.col.advertiser,
            A.col.period,
            A.col.sections,
            A.col.status,
            A.col.deliveries,
            ADMIN_TEXT.users.col.actions,
          ]}
        >
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {c.advertiser}
                <span className="block type-meta font-normal text-meta">{c.creative.title}</span>
              </th>
              <td className="px-3 py-3 type-body text-body">
                {formatDate(c.startsOn)} – {formatDate(c.endsOn)}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {c.allowedSections.map(nameOf).join(", ")}
              </td>
              <td className="px-3 py-3 type-body text-body">{CAMPAIGN_STATUS_LABEL[c.status]}</td>
              <td className="px-3 py-3 type-body text-body tabular-nums">{c.deliveries}</td>
              <td className="px-3 py-3">
                <Button size="sm" variant="outline" onClick={() => setOpen(c)}>
                  {ADMIN_TEXT.users.edit}
                </Button>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {open && (
        <CampaignDialog
          campaign={open === "new" ? null : open}
          sections={allowed}
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await save(v)))}
          onRemove={
            open === "new"
              ? undefined
              : () => start(async () => done(await remove({ id: open.id })))
          }
        />
      )}
    </div>
  );
}

function CampaignDialog({
  campaign,
  sections,
  busy,
  onCancel,
  onSubmit,
  onRemove,
}: {
  campaign: CampaignRow | null;
  sections: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: Omit<Campaign, "id"> & { id?: string }) => void;
  onRemove?: () => void;
}) {
  const D = A.dialog;
  const uid = useId().replace(/:/g, "");
  const [advertiser, setAdvertiser] = useState(campaign?.advertiser ?? "");
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? "");
  const [title, setTitle] = useState(campaign?.creative.title ?? "");
  const [href, setHref] = useState(campaign?.creative.href ?? "");
  const [imageUrl, setImageUrl] = useState(campaign?.creative.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(campaign?.creative.imageAlt ?? "");
  const [secs, setSecs] = useState<string[]>(campaign?.allowedSections ?? []);
  const [st, setSt] = useState<Campaign["status"]>(campaign?.status ?? "draft");
  const [confirm, setConfirm] = useState(false);
  const dateOk =
    /^\d{4}-\d{2}-\d{2}$/.test(startsOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endsOn) &&
    endsOn >= startsOn;
  const ready =
    advertiser.trim().length >= 2 &&
    title.trim().length >= 2 &&
    /^https:\/\//.test(href) &&
    (imageUrl === "" || (/^https:\/\//.test(imageUrl) && imageAlt.trim().length > 0)) &&
    secs.length > 0 &&
    dateOk;
  return (
    <Dialog
      open
      title={campaign ? D.titleEdit(campaign.advertiser) : D.titleNew}
      onClose={onCancel}
    >
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...(campaign ? { id: campaign.id } : {}),
            advertiser: advertiser.trim(),
            startsOn,
            endsOn,
            allowedSections: secs,
            status: st,
            creative: {
              title: title.trim(),
              href: href.trim(),
              ...(imageUrl.trim() ? { imageUrl: imageUrl.trim(), imageAlt: imageAlt.trim() } : {}),
            },
          });
        }}
      >
        <TextField
          id={`${uid}-adv`}
          label={D.advertiser}
          value={advertiser}
          onChange={(e) => setAdvertiser(e.target.value)}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-ini`}
            label={D.startsOn}
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            placeholder="AAAA-MM-DD"
            required
          />
          <TextField
            id={`${uid}-fim`}
            label={D.endsOn}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            placeholder="AAAA-MM-DD"
            required
            error={startsOn && endsOn && !dateOk ? D.period : undefined}
          />
        </div>
        <TextField
          id={`${uid}-tit`}
          label={D.creativeTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-href`}
          label={D.creativeHref}
          type="url"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-img`}
          label={D.creativeImage}
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {imageUrl && (
          <TextField
            id={`${uid}-alt`}
            label={D.creativeAlt}
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
          />
        )}
        <CheckList
          label={D.sections}
          options={sections.map((s) => ({ value: s.slug, label: s.name }))}
          value={secs}
          onChange={setSecs}
        />
        <p className="type-meta text-meta">{D.forbiddenSection}</p>
        <Select
          id={`${uid}-st`}
          name="situacao"
          label={D.status}
          options={STATUS}
          value={st}
          onChange={(v) => setSt(v as Campaign["status"])}
        />
        <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-section p-3">
          <p className="type-meta font-semibold text-strong">{A.preview}</p>
          <OriginLabel
            label={{
              kind: "sponsored",
              text: LABEL_TEXT.sponsored,
              detail: advertiser || undefined,
            }}
            size="md"
          />
          <p className="type-headline-sm text-strong">{title || D.creativeTitle}</p>
        </div>
        {confirm && (
          <p role="alert" className="type-body text-strong">
            {D.remove}?
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          {onRemove && (
            <Button
              size="md"
              variant="danger"
              disabled={busy}
              onClick={() => (confirm ? onRemove() : setConfirm(true))}
            >
              {D.remove}
            </Button>
          )}
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {ADMIN_TEXT.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {D.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
