import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import type { SettingKey } from "@/lib/admin/settings";
import { Button } from "../ui/Button";
import { AdminField } from "./AdminFields";

export interface SettingsFormField {
  key: SettingKey;
  hint?: string;
  type?: "text" | "email" | "time" | "number";
  multiline?: boolean;
  value: string;
}

export interface AdminSettingsFormProps {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: readonly SettingsFormField[];
  /** Sem permissão de escrita, os campos ficam somente para leitura. */
  canWrite: boolean;
  className?: string;
}

/** Formulário de `site_settings`: um campo por chave, salvando por Server Action. */
export function AdminSettingsForm({ id, action, fields, canWrite }: AdminSettingsFormProps) {
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {fields.map((f) => (
        <AdminField
          key={f.key}
          id={`${id}-${f.key.replace(".", "-")}`}
          name={f.key}
          label={T.fieldLabels[f.key]}
          hint={f.hint}
          type={f.type}
          multiline={f.multiline}
          defaultValue={f.value}
          disabled={!canWrite}
          required
          min={f.type === "number" ? 1 : undefined}
          max={f.type === "number" ? 10 : undefined}
        />
      ))}
      {canWrite && (
        <div>
          <Button type="submit" variant="primary" size="md">
            {T.common.save}
          </Button>
        </div>
      )}
    </form>
  );
}
