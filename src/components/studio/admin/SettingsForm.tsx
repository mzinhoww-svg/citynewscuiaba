"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import type { SettingRow } from "@/lib/db/queries/admin-ops";
import type { Json } from "@/lib/db/types";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/TextField";
import { Toggle } from "../../ui/Toggle";
import { AdminStatus, type AdminReply } from "./AdminStatus";

export interface SettingsFormProps {
  settings: SettingRow[];
  /** Chaves que a pessoa da sessão pode alterar. */
  editable: string[];
  save: (i: { key: string; value: Json }) => Promise<AdminReply>;
}

const S = T.settings;

/** Configurações (A14): uma linha por chave, com o editor conforme o tipo e "Salvar" por linha. */
export function SettingsForm({ settings, editable, save }: SettingsFormProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(
      settings.map((s) => [s.key, typeof s.value === "string" ? s.value : JSON.stringify(s.value)]),
    ),
  );
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) router.refresh();
  };
  const current = (s: SettingRow) =>
    typeof s.value === "string" ? s.value : JSON.stringify(s.value);
  const parse = (s: SettingRow, v: string): Json => {
    if (typeof s.value === "boolean") return v === "true";
    if (typeof s.value === "number") return Number(v);
    return v;
  };
  return (
    <div className="flex flex-col gap-4">
      <AdminStatus status={status} />
      <ul className="flex flex-col gap-3" aria-label={S.table}>
        {settings.map((s) => {
          const can = editable.includes(s.key);
          const v = draft[s.key] ?? current(s);
          const changed = v !== current(s);
          const label = S.labels[s.key] ?? s.key;
          return (
            <li
              key={s.key}
              className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4 md:flex-row md:items-end md:justify-between"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {typeof s.value === "boolean" ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="type-body font-medium text-strong">{label}</span>
                    <Toggle
                      checked={v === "true"}
                      label={label}
                      disabled={!can}
                      onChange={(on) => setDraft((d) => ({ ...d, [s.key]: String(on) }))}
                    />
                  </div>
                ) : (
                  <TextField
                    id={`${uid}-${s.key.replace(/\W/g, "-")}`}
                    label={label}
                    inputMode={typeof s.value === "number" ? "numeric" : "text"}
                    value={v}
                    disabled={!can}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                  />
                )}
                <p className="type-meta text-meta">
                  <code className="font-mono text-12">{s.key}</code> · {S.col.updated}:{" "}
                  {formatDateTime(s.updatedAt)}
                  {s.updatedBy ? ` · ${s.updatedBy}` : ""}
                </p>
              </div>
              {can && (
                <Button
                  size="md"
                  variant="outline-strong"
                  disabled={busy || !changed}
                  onClick={() =>
                    start(async () => done(await save({ key: s.key, value: parse(s, v) })))
                  }
                >
                  {S.save}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
