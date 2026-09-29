"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type KeyboardEvent } from "react";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import {
  moveModule,
  sameLayout,
  toggleModule,
  validateHomeLayout,
  type HomeModule,
  type HomeModuleId,
} from "@/lib/admin/home-layout";
import type { HomeLayoutsView } from "@/lib/db/queries/admin";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { TextField } from "../../ui/TextField";
import { Toggle } from "../../ui/Toggle";
import { AdminStatus, AdminTable, type AdminReply } from "./AdminStatus";

export interface HomeModulesEditorProps {
  data: HomeLayoutsView;
  saveDraft: (i: { modules: HomeModule[]; note: string }) => Promise<AdminReply>;
  publish: (i: { id: string }) => Promise<AdminReply>;
  discard: (i: { id: string }) => Promise<AdminReply>;
}

const H = T.home;
const name = (id: HomeModuleId) => H.modules[id];

/**
 * Home e módulos (A06): lista reordenável por teclado (Alt + seta para cima/baixo com o foco no
 * módulo) e por botões, com interruptor por módulo; salva como rascunho versionado e publica.
 * A posição nova é anunciada por `aria-live`.
 */
export function HomeModulesEditor({ data, saveDraft, publish, discard }: HomeModulesEditorProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const base = data.draft ?? data.published;
  const [modules, setModules] = useState<HomeModule[]>(base?.modules ?? []);
  const [note, setNote] = useState(data.draft?.note ?? "");
  // Depois de salvar ou publicar, a tela recarrega com outra versão: o editor volta ao que está
  // no banco sem perder a mensagem de resultado (padrão "ajustar estado ao mudar a prop").
  const loaded = `${data.draft?.id ?? "no-draft"}:${data.published?.id ?? "none"}`;
  const [seen, setSeen] = useState(loaded);
  if (seen !== loaded) {
    setSeen(loaded);
    setModules(base?.modules ?? []);
    setNote(data.draft?.note ?? "");
  }
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [announce, setAnnounce] = useState("");
  const [busy, start] = useTransition();
  const dirty = !base || !sameLayout(modules, base.modules) || note !== (data.draft?.note ?? "");
  const valid = validateHomeLayout(modules);

  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) router.refresh();
  };
  const move = (id: HomeModuleId, dir: "up" | "down") => {
    setModules((m) => {
      const next = moveModule(m, id, dir);
      const i = next.findIndex((x) => x.id === id);
      setAnnounce(H.moved(name(id), i + 1));
      return next;
    });
  };
  const onKey = (id: HomeModuleId) => (e: KeyboardEvent<HTMLLIElement>) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(id, e.key === "ArrowUp" ? "up" : "down");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4">
        <p className="type-body text-strong">
          {data.published
            ? H.published(
                data.published.version,
                formatDateTime(data.published.publishedAt ?? data.published.createdAt),
                data.published.publishedBy ?? T.none,
              )
            : H.noPublished}
        </p>
        <p className="type-meta text-meta">
          {data.draft ? H.draft(data.draft.version) : H.noDraft}
        </p>
      </div>

      <AdminStatus status={status} />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <section aria-labelledby={`${uid}-list`} className="flex flex-col gap-3">
        <h2 id={`${uid}-list`} className="type-section text-strong">
          {H.list}
        </h2>
        <p className="type-meta text-meta">{H.help}</p>
        <p className="type-meta text-meta">{H.previewFixed}</p>
        <ol className="flex flex-col gap-2" aria-label={H.list}>
          {modules.map((m, i) => (
            <li
              key={m.id}
              tabIndex={0}
              onKeyDown={onKey(m.id)}
              aria-label={`${name(m.id)}, ${H.position(i + 1, modules.length)}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-card-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-strong"
            >
              <span className="w-6 text-center type-meta text-meta tabular-nums" aria-hidden="true">
                {i + 1}
              </span>
              <Icon name="layers" size={18} className="text-meta" />
              <span className="min-w-0 flex-1 type-body font-medium text-strong">{name(m.id)}</span>
              <Toggle
                checked={m.enabled}
                label={H.enabled(name(m.id))}
                onChange={() => setModules((cur) => toggleModule(cur, m.id))}
              />
              <span className="flex gap-1">
                <IconButton
                  icon="arrow-up"
                  variant="ghost"
                  size={44}
                  label={H.moveUp(name(m.id))}
                  disabled={i === 0}
                  onClick={() => move(m.id, "up")}
                />
                <IconButton
                  icon="arrow-down"
                  variant="ghost"
                  size={44}
                  label={H.moveDown(name(m.id))}
                  disabled={i === modules.length - 1}
                  onClick={() => move(m.id, "down")}
                />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-card-white p-4">
        <TextField
          id={`${uid}-note`}
          label={H.note}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
        {!valid.ok && (
          <p role="alert" className="type-body text-danger">
            {H.noneEnabled}
          </p>
        )}
        {dirty && <p className="type-meta font-medium text-warn">{H.unsaved}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            size="md"
            disabled={busy || !dirty || !valid.ok}
            onClick={() => start(async () => done(await saveDraft({ modules, note })))}
          >
            {H.saveDraft}
          </Button>
          {data.draft && (
            <>
              <Button
                size="md"
                variant="outline-strong"
                disabled={busy || dirty}
                onClick={() => start(async () => done(await publish({ id: data.draft!.id })))}
              >
                {H.publish}
              </Button>
              <Button
                size="md"
                variant="danger"
                disabled={busy}
                onClick={() => start(async () => done(await discard({ id: data.draft!.id })))}
              >
                {H.discard}
              </Button>
            </>
          )}
        </div>
      </div>

      <section aria-labelledby={`${uid}-hist`} className="flex flex-col gap-3">
        <h2 id={`${uid}-hist`} className="type-section text-strong">
          {H.history}
        </h2>
        <AdminTable
          caption={H.history}
          headers={[
            H.historyCol.version,
            H.historyCol.status,
            H.historyCol.who,
            H.historyCol.when,
            H.historyCol.note,
          ]}
        >
          {data.history.map((h) => (
            <tr key={h.id} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-2 type-body font-medium text-strong tabular-nums">
                v{h.version}
              </th>
              <td className="px-3 py-2 type-body text-body">{H.status[h.status]}</td>
              <td className="px-3 py-2 type-body text-body">
                {h.publishedBy ?? h.createdBy ?? T.none}
              </td>
              <td className="px-3 py-2 type-body text-body">
                {formatDateTime(h.publishedAt ?? h.createdAt)}
              </td>
              <td className="px-3 py-2 type-body text-body">{h.note || T.none}</td>
            </tr>
          ))}
        </AdminTable>
      </section>
    </div>
  );
}
