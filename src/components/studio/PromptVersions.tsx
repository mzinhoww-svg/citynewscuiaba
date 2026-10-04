"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { PROMPTS_TEXT as T, PROMPT_STATUS_TEXT } from "@/content/pt-BR/ai-prompts";
import type { PromptStatus } from "@/lib/ai/prompts";
import { diffPrompt, rollbackTargets } from "@/lib/ai/prompts";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { VersionCompare } from "./VersionDiff";

export interface PromptVersionItem {
  id: string;
  version: number;
  status: PromptStatus;
  body: string;
  rationale: string;
  author: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null }[];
  createdAt: string;
  /** Pedido `prompt.publish` desta versão, quando existe. */
  approval: { id: string; status: string; requestedBy: string } | null;
}

export type PromptReply = { ok: boolean; message: string };

export interface PromptVersionsProps {
  agentId: string;
  versions: PromptVersionItem[];
  currentUserId: string;
  /** Pode escrever versões (operador de IA). */
  canWrite: boolean;
  /** Aprova e publica (admin ou editor-chefe); pode ser quem escreveu (A-128). */
  canApprove: boolean;
  request: (i: { agentId: string; version: number; justification: string }) => Promise<PromptReply>;
  publish: (i: { approvalId: string }) => Promise<PromptReply>;
  rollback: (i: { agentId: string; toVersion: number }) => Promise<PromptReply>;
  create: (i: { agentId: string; body: string; rationale: string }) => Promise<PromptReply>;
  className?: string;
}

const SYSTEM = "00000000-0000-0000-0000-000000000000";

/**
 * Versões do prompt de um agente (O12): tabela com situação e assinaturas, comparação com a
 * produção (diff por palavra), pedido de publicação com justificativa, publicação por quem
 * aprovou, rollback para versões que já estiveram em produção e formulário de nova versão.
 */
export function PromptVersions({
  agentId,
  versions,
  currentUserId,
  canWrite,
  canApprove,
  request,
  publish,
  rollback,
  create,
  className,
}: PromptVersionsProps) {
  const uid = useId();
  const router = useRouter();
  const production = versions.find((v) => v.status === "production") ?? null;
  const [compare, setCompare] = useState<number | null>(null);
  const [asking, setAsking] = useState<PromptVersionItem | null>(null);
  const [justification, setJustification] = useState("");
  const [rollingBack, setRollingBack] = useState<PromptVersionItem | null>(null);
  const [status, setStatus] = useState<PromptReply | null>(null);
  const [body, setBody] = useState(production?.body ?? "");
  const [rationale, setRationale] = useState("");
  const [busy, start] = useTransition();
  const rollbackable = new Set(rollbackTargets(versions).map((v) => v.version));

  const done = (r: PromptReply) => {
    setStatus(r);
    if (r.ok) {
      setAsking(null);
      setRollingBack(null);
      setJustification("");
      router.refresh();
    }
  };
  const who = (p: { id: string; name: string | null }) =>
    p.id === SYSTEM ? T.system : (p.name ?? T.someone);
  const compared = compare === null ? null : (versions.find((v) => v.version === compare) ?? null);

  return (
    <div className={cx("flex flex-col gap-8", className)}>
      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
        {status && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              status.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>

      <section aria-labelledby={`${uid}-versions`} className="flex flex-col gap-3">
        <h2 id={`${uid}-versions`} className="type-section text-strong">
          {T.versionsTitle}
        </h2>
        <div
          role="region"
          aria-label={T.versionsCaption}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[60rem] border-collapse text-left">
            <caption className="sr-only">{T.versionsCaption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                {(
                  [
                    "version",
                    "status",
                    "author",
                    "approvals",
                    "rationale",
                    "when",
                    "actions",
                  ] as const
                ).map((k) => (
                  <th key={k} scope="col" className="px-3 py-3">
                    {T.col[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const own = v.author.id === currentUserId;
                const ap = v.approval;
                return (
                  <tr key={v.id} className="border-b border-line-subtle last:border-0 align-top">
                    <th
                      scope="row"
                      className="px-3 py-3 type-body font-medium text-strong whitespace-nowrap"
                    >
                      v{v.version}
                    </th>
                    <td
                      className={cx(
                        "px-3 py-3 type-body whitespace-nowrap",
                        v.status === "production" ? "font-semibold text-service" : "text-body",
                      )}
                    >
                      {PROMPT_STATUS_TEXT[v.status]}
                    </td>
                    <td className="px-3 py-3 type-body">{who(v.author)}</td>
                    <td className="px-3 py-3 type-body">
                      {v.approvedBy.length === 0 ? "—" : v.approvedBy.map(who).join(", ")}
                    </td>
                    <td className="max-w-xs px-3 py-3 type-meta text-body">{v.rationale}</td>
                    <td className="px-3 py-3 type-meta text-meta whitespace-nowrap">
                      {formatDateTime(v.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {v.status !== "production" && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-pressed={compare === v.version}
                            onClick={() => setCompare(compare === v.version ? null : v.version)}
                          >
                            {T.compare(v.version)}
                          </Button>
                        )}
                        {canWrite && own && v.status === "draft" && (
                          <Button size="sm" variant="outline-strong" onClick={() => setAsking(v)}>
                            {(canApprove ? T.publishDirect : T.requestPublish)(v.version)}
                          </Button>
                        )}
                        {ap && ap.status === "pending" && !canApprove && (
                          <span className="type-meta text-strong">{T.waitApprover}</span>
                        )}
                        {ap && ap.status === "pending" && canApprove && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              start(async () => done(await publish({ approvalId: ap.id })))
                            }
                          >
                            {T.approveAndPublish(v.version)}
                          </Button>
                        )}
                        {ap && ap.status === "approved" && canApprove && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              start(async () => done(await publish({ approvalId: ap.id })))
                            }
                          >
                            {T.publish(v.version)}
                          </Button>
                        )}
                        {canApprove && rollbackable.has(v.version) && (
                          <Button
                            size="sm"
                            variant="outline-strong"
                            onClick={() => setRollingBack(v)}
                          >
                            {T.rollback(v.version)}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {compared && (
        <section aria-labelledby={`${uid}-diff`} className="flex flex-col gap-3">
          <h2 id={`${uid}-diff`} className="type-section text-strong">
            {T.compareTitle(production?.version ?? 0, compared.version)}
          </h2>
          <VersionCompare
            fromLabel={T.compareFrom(production?.version ?? 0)}
            toLabel={T.compareTo(compared.version)}
            fields={[
              { label: T.bodyLabel, ops: diffPrompt(production?.body ?? "", compared.body) },
            ]}
          />
        </section>
      )}

      {canWrite && (
        <section aria-labelledby={`${uid}-new`} className="flex flex-col gap-3">
          <h2 id={`${uid}-new`} className="type-section text-strong">
            {T.newTitle}
          </h2>
          <p className="type-body text-meta">{T.newIntro}</p>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!body.trim()) return setStatus({ ok: false, message: T.bodyRequired });
              if (!rationale.trim()) return setStatus({ ok: false, message: T.rationaleRequired });
              start(async () => {
                const r = await create({ agentId, body: body.trim(), rationale: rationale.trim() });
                setStatus(r);
                if (r.ok) {
                  setRationale("");
                  router.refresh();
                }
              });
            }}
          >
            <label htmlFor={`${uid}-body`} className="type-label text-strong">
              {T.newBody}
            </label>
            <textarea
              id={`${uid}-body`}
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="border-control min-h-32 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
            />
            <label htmlFor={`${uid}-rationale`} className="type-label text-strong">
              {T.newRationale}
            </label>
            <textarea
              id={`${uid}-rationale`}
              rows={3}
              required
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="border-control min-h-20 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
            />
            <div>
              <Button type="submit" size="md" icon="plus" disabled={busy}>
                {busy ? T.creating : T.create}
              </Button>
            </div>
          </form>
        </section>
      )}

      {asking && (
        <Dialog
          open
          title={(canApprove ? T.publishDirect : T.requestPublish)(asking.version)}
          onClose={() => setAsking(null)}
          actions={
            <>
              <Button size="md" variant="outline" onClick={() => setAsking(null)}>
                Cancelar
              </Button>
              <Button
                size="md"
                disabled={busy}
                onClick={() => {
                  if (!justification.trim())
                    return setStatus({ ok: false, message: T.justificationRequired });
                  start(async () =>
                    done(
                      await request({
                        agentId,
                        version: asking.version,
                        justification: justification.trim(),
                      }),
                    ),
                  );
                }}
              >
                {(canApprove ? T.publishDirect : T.requestPublish)(asking.version)}
              </Button>
            </>
          }
        >
          <label htmlFor={`${uid}-just`} className="block text-left type-label text-strong">
            {T.requestJustification}
          </label>
          <textarea
            id={`${uid}-just`}
            rows={3}
            required
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="border-control mt-2 min-h-20 w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
        </Dialog>
      )}

      {rollingBack && (
        <Dialog
          open
          title={T.rollback(rollingBack.version)}
          onClose={() => setRollingBack(null)}
          actions={
            <>
              <Button size="md" variant="outline" onClick={() => setRollingBack(null)}>
                Cancelar
              </Button>
              <Button
                size="md"
                disabled={busy}
                onClick={() =>
                  start(async () =>
                    done(await rollback({ agentId, toVersion: rollingBack.version })),
                  )
                }
              >
                {T.rollback(rollingBack.version)}
              </Button>
            </>
          }
        >
          <p className="type-body text-body">{T.rollbackConfirm(rollingBack.version)}</p>
        </Dialog>
      )}
    </div>
  );
}
