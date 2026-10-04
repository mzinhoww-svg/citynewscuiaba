"use client";

import { useId } from "react";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { NEW_PUSH_TEXT as T, PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import type { AdminAudience } from "@/lib/db/queries/push-admin";
import { cx } from "../../cx";
import { SelectField } from "../sources/fields";

export type ReachState =
  { state: "idle" } | { state: "loading" } | { state: "ready"; n: number } | { state: "error" };

export interface AudienceFieldProps {
  kind: "urgent" | "highlight";
  sections: readonly { slug: string; name: string }[];
  value: AdminAudience;
  onChange: (a: AdminAudience) => void;
  reach: ReachState;
  className?: string;
}

/**
 * Público do envio (spec §10.2): todos que ativaram o tipo, ou um segmento (editoria ou bairro)
 * contando só inscrições que seguem o alvo e ligaram o tipo. O alcance estimado (D-P24) chega
 * de fora e é anunciado em `aria-live`.
 */
export function AudienceField({
  kind,
  sections,
  value,
  onChange,
  reach,
  className,
}: AudienceFieldProps) {
  const uid = useId().replace(/:/g, "");
  const segment = value.type !== "all";
  const segType = value.type === "bairro" ? "bairro" : "section";
  const slugOptions =
    segType === "bairro"
      ? NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name }))
      : sections.map((s) => ({ value: s.slug, label: s.name }));
  const firstSlug = slugOptions[0]?.value ?? "";

  const setSegment = (type: "section" | "bairro", slug?: string) => {
    const opts = type === "bairro" ? NEIGHBORHOODS.map((n) => n.slug) : sections.map((s) => s.slug);
    onChange({ type, slug: slug && opts.includes(slug) ? slug : (opts[0] ?? "") });
  };

  return (
    <fieldset className={cx("flex flex-col gap-3", className)}>
      <legend className="mb-1 type-label text-strong">{T.audience}</legend>
      <label className="flex min-h-tap items-center gap-3 type-body text-strong">
        <input
          type="radio"
          name={`${uid}-publico`}
          checked={!segment}
          onChange={() => onChange({ type: "all" })}
          className="size-5 accent-(--action-primary)"
        />
        {T.audienceAll(kind)}
      </label>
      <label className="flex min-h-tap items-center gap-3 type-body text-strong">
        <input
          type="radio"
          name={`${uid}-publico`}
          checked={segment}
          onChange={() => setSegment("section")}
          className="size-5 accent-(--action-primary)"
        />
        {T.audienceSegment}
      </label>
      {segment && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            id={`${uid}-tipo`}
            name="audienceType"
            label={T.segmentType}
            value={segType}
            onChange={(v) => setSegment(v === "bairro" ? "bairro" : "section")}
            options={[
              { value: "section", label: T.segmentSection },
              { value: "bairro", label: T.segmentBairro },
            ]}
          />
          <SelectField
            id={`${uid}-alvo`}
            name="audienceSlug"
            label={segType === "bairro" ? T.segmentBairro : T.segmentSection}
            value={"slug" in value ? value.slug : firstSlug}
            onChange={(v) => setSegment(segType, v)}
            options={slugOptions}
            hint={T.segmentHint}
          />
        </div>
      )}
      {!segment && <input type="hidden" name="audienceType" value="all" />}
      <p aria-live="polite" className="flex items-center gap-2 type-body text-strong">
        <span className="type-meta text-meta">{PUSH_ADMIN_TEXT.reach.label}:</span>
        <span>
          {reach.state === "ready"
            ? PUSH_ADMIN_TEXT.reach.subs(reach.n)
            : reach.state === "loading"
              ? PUSH_ADMIN_TEXT.reach.loading
              : reach.state === "error"
                ? PUSH_ADMIN_TEXT.reach.unavailable
                : "—"}
        </span>
      </p>
    </fieldset>
  );
}
