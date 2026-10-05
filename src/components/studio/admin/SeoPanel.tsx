"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import type { SeoOverview } from "@/lib/db/queries/admin-ops";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Panel } from "../../ui/Panel";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, type AdminReply } from "./AdminStatus";

export interface SeoPanelProps {
  data: SeoOverview;
  sitemaps: readonly string[];
  robotsDisallow: readonly string[];
  saveTitleTemplate: (i: { value: string }) => Promise<AdminReply>;
  saveRedirect: (i: {
    fromPath: string;
    toPath: string;
    kind: 301 | 302;
    reason: string;
  }) => Promise<AdminReply>;
  removeRedirect: (i: { id: string }) => Promise<AdminReply>;
}

const S = T.seo;

/** SEO (A08): modelo de título, sitemaps, robots, redirecionamentos, dados estruturados e páginas sem meta description. */
export function SeoPanel({
  data,
  sitemaps,
  robotsDisallow,
  saveTitleTemplate,
  saveRedirect,
  removeRedirect,
}: SeoPanelProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [template, setTemplate] = useState(data.titleTemplate);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  };
  const templateOk =
    template.includes("{title}") && template.trim().length > 0 && template.length <= 120;
  return (
    <div className="flex flex-col gap-10">
      <AdminStatus status={status} />

      <Panel aria-labelledby={`${uid}-title`} className="flex flex-col gap-3">
        <h2 id={`${uid}-title`} className="type-section text-strong">
          {S.titleTemplate}
        </h2>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => done(await saveTitleTemplate({ value: template.trim() })));
          }}
        >
          <TextField
            id={`${uid}-tpl`}
            label={S.titleTemplate}
            hint={S.titleTemplateHint}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="flex-1"
            error={template && !templateOk ? S.titleTemplateInvalid : undefined}
          />
          <Button
            size="md"
            type="submit"
            disabled={busy || !templateOk || template === data.titleTemplate}
          >
            {S.titleTemplateSave}
          </Button>
        </form>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel aria-labelledby={`${uid}-sm`} className="flex flex-col gap-2">
          <h2 id={`${uid}-sm`} className="type-section text-strong">
            {S.sitemaps}
          </h2>
          <p className="type-meta text-meta">{S.sitemapsIntro}</p>
          <ul className="flex flex-col gap-1 type-body">
            {["/sitemap.xml", ...sitemaps].map((p) => (
              <li key={p}>
                <a
                  href={p}
                  className="font-medium text-link underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {p}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel aria-labelledby={`${uid}-robots`} className="flex flex-col gap-2">
          <h2 id={`${uid}-robots`} className="type-section text-strong">
            {S.robots}
          </h2>
          <p className="type-meta text-meta">{S.robotsIntro}</p>
          <p className="type-body text-body">
            <a
              href="/robots.txt"
              className="font-medium text-link underline"
              target="_blank"
              rel="noreferrer"
            >
              /robots.txt
            </a>
            {" · Disallow: "}
            {robotsDisallow.join(", ")}
          </p>
        </Panel>
        <Panel aria-labelledby={`${uid}-ld`} className="flex flex-col gap-2">
          <h2 id={`${uid}-ld`} className="type-section text-strong">
            {S.structured}
          </h2>
          <p className="type-meta text-meta">{S.structuredIntro}</p>
          <ul className="list-disc pl-5 type-body text-body">
            {S.structuredTypes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Panel>
        <Panel aria-labelledby={`${uid}-missing`} className="flex flex-col gap-2">
          <h2 id={`${uid}-missing`} className="type-section text-strong">
            {S.missing}
          </h2>
          <p className="type-meta text-meta">{S.missingIntro}</p>
          {data.missingDescription.length === 0 ? (
            <p className="type-body text-body">{S.missingEmpty}</p>
          ) : (
            <>
              <p className="type-body font-medium text-warn">{S.missingCount(data.missingCount)}</p>
              <ul className="flex flex-col divide-y divide-line-subtle">
                {data.missingDescription.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate type-body text-strong">{a.title}</span>
                    <Link
                      href={`/estudio/materias/${a.id}`}
                      className="shrink-0 type-body font-medium text-link underline"
                    >
                      {S.edit}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <section aria-labelledby={`${uid}-red`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id={`${uid}-red`} className="type-section text-strong">
              {S.redirects}
            </h2>
            <p className="type-meta text-meta">{S.redirectsIntro}</p>
          </div>
          <Button size="sm" variant="outline" icon="plus" onClick={() => setOpen(true)}>
            {S.addRedirect}
          </Button>
        </div>
        {data.redirects.length === 0 ? (
          <EmptyState title={S.redirectsEmpty} />
        ) : (
          <AdminTable
            caption={S.redirectsTable}
            headers={[
              S.col.from,
              S.col.to,
              S.col.kind,
              S.col.reason,
              S.col.when,
              ADMIN_TEXT.users.col.actions,
            ]}
          >
            {data.redirects.map((r) => (
              <tr key={r.id} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                  {r.fromPath}
                </th>
                <td className="px-3 py-2 type-body text-body">{r.toPath}</td>
                <td className="px-3 py-2 type-body text-body tabular-nums">{r.kind}</td>
                <td className="px-3 py-2 type-body text-body">{r.reason || ADMIN_TEXT.none}</td>
                <td className="px-3 py-2 type-body text-body">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => start(async () => done(await removeRedirect({ id: r.id })))}
                  >
                    {S.remove}
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </section>
      {open && (
        <RedirectDialog
          busy={busy}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => start(async () => done(await saveRedirect(v)))}
        />
      )}
    </div>
  );
}

function RedirectDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { fromPath: string; toPath: string; kind: 301 | 302; reason: string }) => void;
}) {
  const D = S.dialog;
  const uid = useId().replace(/:/g, "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"301" | "302">("301");
  const [reason, setReason] = useState("");
  const ready =
    from.trim().startsWith("/") && to.trim().startsWith("/") && from.trim() !== to.trim();
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            fromPath: from.trim(),
            toPath: to.trim(),
            kind: kind === "302" ? 302 : 301,
            reason: reason.trim(),
          });
        }}
      >
        <TextField
          id={`${uid}-from`}
          label={D.from}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="/materia/titulo-antigo"
          required
        />
        <TextField
          id={`${uid}-to`}
          label={D.to}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="/materia/titulo-novo"
          required
        />
        <Select
          id={`${uid}-kind`}
          name="tipo"
          label={D.kind}
          options={[
            { value: "301", label: D.permanent },
            { value: "302", label: D.temporary },
          ]}
          value={kind}
          onChange={(v) => setKind(v === "302" ? "302" : "301")}
        />
        <TextField
          id={`${uid}-reason`}
          label={D.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
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
