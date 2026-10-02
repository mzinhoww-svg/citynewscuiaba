"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MIGRATE_TEXT as T } from "@/content/pt-BR/account";
import {
  DEFAULT_MIGRATION_CHOICE,
  hasLocalData,
  migrationCounts,
  migrationPayload,
  type MigrationChoice,
} from "@/lib/anon/migrate";
import type { AnonProfile } from "@/lib/anon/types";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { useTrack } from "@/lib/events/use-track";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { Skeleton } from "../ui/Skeleton";

type Result = { ok: true; summary: string } | { ok: false; reason: "session" | "error" };

export interface MigrateLocalProps {
  action: (local: unknown, choice: unknown) => Promise<Result>;
  next: string;
  method: "email" | "magic_link" | "google";
  /** Conta que acabou de entrar: lembra neste navegador o que já foi levado para ela. */
  userId: string;
}

const KEYS: (keyof MigrationChoice)[] = [
  "follows",
  "saved",
  "interests",
  "history",
  "conversations",
];
const DONE_KEY = "cn_migrated";

/** Assinatura do que há neste navegador, para não perguntar de novo a mesma coisa. */
function signature(p: AnonProfile): string {
  return JSON.stringify([
    p.follows.map((f) => `${f.kind}:${f.id}`).sort(),
    p.saved.map((s) => s.ref).sort(),
    p.interests.map((i) => i.key).sort(),
    p.hidden.map((h) => h.sourceSlug).sort(),
    p.collections.map((c) => c.name).sort(),
    p.alerts.map((a) => a.id).sort(),
  ]);
}

function readDone(userId: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, unknown>;
    const v = all[userId];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

function writeDone(userId: string, sig: string) {
  try {
    const all = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(DONE_KEY, JSON.stringify({ ...all, [userId]: sig }));
  } catch {
    // Sem armazenamento: a pergunta volta no próximo login (a migração não duplica).
  }
}

/**
 * Migrar dados locais (C06): caixas com contagens (padrão: fontes, salvos e interesses
 * marcados; histórico e conversas não), "Levar selecionados" · "Começar do zero", progresso e
 * resumo ("2 fontes e 3 salvos sincronizados"). Nada é apagado deste navegador.
 */
export function MigrateLocal({ action, next, method, userId }: MigrateLocalProps) {
  const { profile, ready } = useAnonProfile();
  const router = useRouter();
  const send = useTrack();
  const id = useId();
  const [choice, setChoice] = useState<MigrationChoice>(DEFAULT_MIGRATION_CHOICE);
  const [phase, setPhase] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [summary, setSummary] = useState("");
  const done = useRef<HTMLDivElement>(null);
  const left = useRef(false);

  const skip =
    phase === "ask" &&
    ready &&
    profile !== null &&
    (!hasLocalData(profile) || readDone(userId) === signature(profile));

  useEffect(() => {
    if (!skip || left.current) return;
    left.current = true;
    void send("login_completed", { method, migrated: false });
    router.replace(next);
    router.refresh();
  }, [skip, method, next, router, send]);

  useEffect(() => {
    if (phase === "done") done.current?.focus();
  }, [phase]);

  if (!ready || !profile || skip) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p className="type-meta text-meta">{skip ? T.entering : T.loading}</p>
        <Skeleton lines={4} />
      </div>
    );
  }

  const counts = migrationCounts(profile);
  const finish = (migrated: boolean) => {
    writeDone(userId, signature(profile));
    void send("login_completed", { method, migrated });
  };
  const submit = async () => {
    setPhase("busy");
    // Só o que foi marcado sai do navegador (buscas nunca; id anônimo só com o histórico).
    const r = await action(migrationPayload(profile, choice), choice).catch((): Result => ({
      ok: false,
      reason: "error",
    }));
    if (!r.ok) {
      if (r.reason === "session") router.replace(`/entrar?next=${encodeURIComponent(next)}`);
      setPhase("error");
      return;
    }
    setSummary(r.summary);
    finish(true);
    setPhase("done");
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-5">
        <InlineAlert ref={done} tone="success" title={T.done}>
          <p>{summary}</p>
        </InlineAlert>
        <Button
          fullWidth
          onClick={() => {
            router.replace(next);
            router.refresh();
          }}
        >
          {T.continue}
        </Button>
      </div>
    );
  }

  const busy = phase === "busy";
  return (
    <div className="flex flex-col gap-6" aria-busy={busy}>
      <fieldset className="flex flex-col gap-1" disabled={busy}>
        <legend className="mb-2 type-label text-strong">{T.legend}</legend>
        {KEYS.map((k) => {
          const n = counts[k];
          const off = k === "conversations" && n === 0;
          const hint = T.hints[k];
          return (
            <label
              key={k}
              htmlFor={`${id}-${k}`}
              className="flex min-h-tap cursor-pointer items-start gap-3 border-b border-line-subtle py-3 last:border-b-0"
            >
              <input
                id={`${id}-${k}`}
                type="checkbox"
                checked={choice[k] && !off}
                disabled={off}
                aria-describedby={hint ? `${id}-${k}-hint` : undefined}
                onChange={(e) => setChoice({ ...choice, [k]: e.target.checked })}
                className="mt-0.5 size-5 shrink-0 accent-(--action-primary)"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-body text-strong">{T.options[k]}</span>
                <span className="type-meta text-meta">{off ? T.noConversations : T.count(n)}</span>
                {hint && (
                  <span id={`${id}-${k}-hint`} className="type-meta text-meta">
                    {hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>

      {phase === "error" && <InlineAlert tone="error" title={T.error} role="alert" />}
      <p role="status" className="sr-only">
        {busy ? T.busy : ""}
      </p>

      <div className="flex flex-col gap-3">
        <Button fullWidth disabled={busy} onClick={() => void submit()}>
          {busy ? T.busy : phase === "error" ? T.retry : T.submit}
        </Button>
        <Button
          fullWidth
          variant="outline"
          disabled={busy}
          onClick={() => {
            finish(false);
            router.replace(next);
            router.refresh();
          }}
        >
          {T.fresh}
        </Button>
        <p className="type-meta text-meta">{T.freshNote}</p>
      </div>
    </div>
  );
}
