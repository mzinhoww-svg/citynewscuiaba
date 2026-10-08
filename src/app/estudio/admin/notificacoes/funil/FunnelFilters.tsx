"use client";

import { useId, useState } from "react";
import { FUNNEL_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { FunnelFilter } from "@/lib/push/funnel";
import { Button, CollapsibleFilters, DateField, Select } from "@/components";

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
        <Select
          id={`${uid}-periodo`}
          label={T.filters.period}
          size="sm"
          className="sm:w-44"
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
        {period === "personalizado" && (
          <>
            <DateField
              id={`${uid}-de`}
              name="de"
              label={T.filters.from}
              value={from}
              onChange={setFrom}
            />
            <DateField
              id={`${uid}-ate`}
              name="ate"
              label={T.filters.to}
              value={to}
              onChange={setTo}
            />
          </>
        )}
        <Select
          id={`${uid}-aparelho`}
          label={T.filters.device}
          size="sm"
          className="sm:w-44"
          name="aparelho"
          value={device}
          onChange={setDevice}
          options={[
            { value: "", label: T.filters.all },
            ...Object.entries(T.devices).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          id={`${uid}-navegador`}
          label={T.filters.browser}
          size="sm"
          className="sm:w-48"
          name="navegador"
          value={browser}
          onChange={setBrowser}
          options={[
            { value: "", label: T.filters.all },
            ...Object.entries(T.browsers).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Button type="submit" size="md" variant="outline">
          {T.filters.apply}
        </Button>
      </form>
    </CollapsibleFilters>
  );
}
