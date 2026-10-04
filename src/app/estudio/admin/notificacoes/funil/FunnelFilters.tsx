"use client";

import { useId, useState } from "react";
import { FUNNEL_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { FunnelFilter } from "@/lib/push/funnel";
import { Button, CollapsibleFilters } from "@/components";
import { NativeSelect, TextInput } from "@/components/estudio";

export interface FunnelFiltersProps {
  filter: FunnelFilter;
  basePath: string;
}

/**
 * Filtros do funil na URL (formulário GET, funciona sem JS): período, aparelho, navegador.
 * Recolhível (`CollapsibleFilters`): fechado no celular, aberto no desktop.
 */
export function FunnelFilters({ filter, basePath }: FunnelFiltersProps) {
  const uid = useId().replace(/:/g, "");
  const [period, setPeriod] = useState(
    filter.days === null ? "personalizado" : String(filter.days),
  );
  const [from, setFrom] = useState(filter.from ?? "");
  const [to, setTo] = useState(filter.to ?? "");
  const [device, setDevice] = useState(filter.device ?? "");
  const [browser, setBrowser] = useState(filter.browser ?? "");
  const activeCount = [filter.days !== 30, filter.device, filter.browser].filter(Boolean).length;
  return (
    <CollapsibleFilters activeCount={activeCount} clearHref={basePath}>
      <form
        method="get"
        action={basePath}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:w-44">
          <label htmlFor={`${uid}-periodo`} className="type-label text-16 text-strong">
            {T.filters.period}
          </label>
          <NativeSelect
            id={`${uid}-periodo`}
            name="periodo"
            value={period}
            onChange={setPeriod}
            options={[
              ...(["7", "30", "90"] as const).map((v) => ({
                value: v,
                label: T.periods[Number(v) as 7 | 30 | 90],
              })),
              { value: "personalizado", label: T.filters.custom },
            ]}
          />
        </div>
        {period === "personalizado" && (
          <>
            <TextInput
              id={`${uid}-de`}
              name="de"
              label={T.filters.from}
              type="date"
              value={from}
              onChange={setFrom}
            />
            <TextInput
              id={`${uid}-ate`}
              name="ate"
              label={T.filters.to}
              type="date"
              value={to}
              onChange={setTo}
            />
          </>
        )}
        <div className="flex min-w-0 flex-col gap-2 sm:w-44">
          <label htmlFor={`${uid}-aparelho`} className="type-label text-16 text-strong">
            {T.filters.device}
          </label>
          <NativeSelect
            id={`${uid}-aparelho`}
            name="aparelho"
            value={device}
            onChange={setDevice}
            options={[
              { value: "", label: T.filters.all },
              ...Object.entries(T.devices).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:w-48">
          <label htmlFor={`${uid}-navegador`} className="type-label text-16 text-strong">
            {T.filters.browser}
          </label>
          <NativeSelect
            id={`${uid}-navegador`}
            name="navegador"
            value={browser}
            onChange={setBrowser}
            options={[
              { value: "", label: T.filters.all },
              ...Object.entries(T.browsers).map(([value, label]) => ({ value, label })),
            ]}
          />
        </div>
        <Button type="submit" size="md" variant="outline">
          {T.filters.apply}
        </Button>
      </form>
    </CollapsibleFilters>
  );
}
