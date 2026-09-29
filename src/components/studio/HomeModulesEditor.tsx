"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { HOME_ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import {
  DEFAULT_HOME_MODULES,
  moveModule,
  type HomeModule,
  type HomeModuleKey,
} from "@/lib/home/modules";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export type HomeSaveReply = { ok: true; message: string } | { ok: false; message: string };

export interface HomeModulesEditorProps {
  initial: readonly HomeModule[];
  saveDraft: (modules: HomeModule[]) => Promise<HomeSaveReply>;
  publish: (modules: HomeModule[]) => Promise<HomeSaveReply>;
}

/**
 * Editor da ordem dos módulos da home. Por teclado: foco no módulo e Alt + seta para cima ou
 * para baixo muda a posição (o foco acompanha e a nova posição é anunciada). Botões de subir e
 * descer fazem o mesmo para quem não usa atalho. Nada vale na home pública até "Publicar".
 */
export function HomeModulesEditor({ initial, saveDraft, publish }: HomeModulesEditorProps) {
  const [modules, setModules] = useState<HomeModule[]>([...initial]);
  const [announce, setAnnounce] = useState("");
  const [reply, setReply] = useState<HomeSaveReply | null>(null);
  const [pending, start] = useTransition();
  const refs = useRef(new Map<HomeModuleKey, HTMLLIElement>());

  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= modules.length) return;
    const key = modules[index]?.key;
    if (!key) return;
    setModules(moveModule(modules, index, delta));
    setReply(null);
    setAnnounce(T.moved(T.modules[key].name, to + 1, modules.length));
    // O foco segue o módulo depois que a lista se reordena.
    requestAnimationFrame(() => refs.current.get(key)?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (!e.altKey || e.target !== e.currentTarget) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index, e.key === "ArrowUp" ? -1 : 1);
    }
  };

  const toggle = (key: HomeModuleKey, enabled: boolean) => {
    setModules(modules.map((m) => (m.key === key ? { ...m, enabled } : m)));
    setReply(null);
  };

  const run = (fn: HomeEditorFn) =>
    start(async () => {
      try {
        setReply(await fn(modules));
      } catch {
        setReply({ ok: false, message: T.error });
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <p id="home-editor-help" className="type-body text-meta">
        {T.keyboardHelp}
      </p>
      <ol aria-label={T.listLabel} className="flex flex-col gap-2">
        {modules.map((m, i) => {
          const name = T.modules[m.key].name;
          return (
            <li
              key={m.key}
              ref={(el) => {
                if (el) refs.current.set(m.key, el);
              }}
              tabIndex={0}
              aria-describedby="home-editor-help"
              aria-label={`${name}, ${T.position(i + 1, modules.length)}`}
              onKeyDown={(e) => onKeyDown(e, i)}
              data-module={m.key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-card-white p-3"
            >
              <span className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                <span className="type-body font-semibold text-strong">{name}</span>
                <span className="type-meta text-meta">{T.modules[m.key].text}</span>
              </span>
              <label className="flex items-center gap-2 type-body text-strong">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => toggle(m.key, e.target.checked)}
                  aria-label={T.show(name)}
                  className="size-5"
                />
                <span aria-hidden="true">Mostrar</span>
              </label>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={T.moveUp(name)}
                >
                  Subir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={i === modules.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={T.moveDown(name)}
                >
                  Descer
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {reply && (
        <InlineAlert tone={reply.ok ? "success" : "error"} role={reply.ok ? "status" : "alert"}>
          {reply.message}
        </InlineAlert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button size="md" icon="check" disabled={pending} onClick={() => run(publish)}>
          {T.publish}
        </Button>
        <Button size="md" variant="outline" disabled={pending} onClick={() => run(saveDraft)}>
          {T.saveDraft}
        </Button>
        <Button
          size="md"
          variant="text"
          disabled={pending}
          onClick={() => {
            setModules([...DEFAULT_HOME_MODULES]);
            setReply(null);
          }}
        >
          {T.reset}
        </Button>
      </div>
    </div>
  );
}

type HomeEditorFn = (modules: HomeModule[]) => Promise<HomeSaveReply>;
