import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { campaignStatus, FORBIDDEN_SECTION, type SponsoredCampaign } from "@/lib/ads/rules";
import { formatDate } from "@/lib/format/date";
import { OriginLabel } from "../editorial/OriginLabel";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { AdminBlock, AdminField } from "./AdminFields";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

type FormAction = (formData: FormData) => void | Promise<void>;

export interface AdsPanelProps {
  flagEnabled: boolean | null;
  campaigns: readonly SponsoredCampaign[];
  sections: readonly { slug: string; name: string }[];
  today: string;
  canWrite: boolean;
  canToggleFlag: boolean;
  createAction: FormAction;
  toggleAction: FormAction;
  flagAction: FormAction;
}

const STATUS_ICON = {
  active: "check",
  paused: "clock",
  scheduled: "calendar",
  expired: "clock",
} as const;

/** Publicidade (A07): flag, regras fixas, nova campanha e tabela com pré-visualização e selo. */
export function AdsPanel({
  flagEnabled,
  campaigns,
  sections,
  today,
  canWrite,
  canToggleFlag,
  createAction,
  toggleAction,
  flagAction,
}: AdsPanelProps) {
  const on = flagEnabled === true;
  const names = new Map(sections.map((s) => [s.slug, s.name]));
  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="ads-flag" title={T.ads.flagTitle}>
        <p className="type-body" data-testid="ads-flag-state">
          {on ? T.ads.flagOn : T.ads.flagOff}
        </p>
        {canToggleFlag ? (
          <form action={flagAction}>
            <input type="hidden" name="enabled" value={on ? "0" : "1"} />
            <Button type="submit" variant={on ? "outline" : "primary"} size="md">
              {on ? T.ads.flagOffAction : T.ads.flagOnAction}
            </Button>
          </form>
        ) : (
          <p className="type-meta text-meta">{T.ads.flagAdminOnly}</p>
        )}
      </AdminBlock>

      <AdminBlock id="ads-rules" title={T.ads.rulesTitle}>
        <ul className="flex list-disc flex-col gap-1 pl-6 type-body">
          {T.ads.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </AdminBlock>

      {canWrite && (
        <AdminBlock id="ads-new" title={T.ads.formTitle}>
          <form action={createAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                id="ads-adv"
                name="advertiser"
                label={T.ads.advertiser}
                required
                maxLength={120}
              />
              <AdminField
                id="ads-head"
                name="headline"
                label={T.ads.headline}
                required
                maxLength={120}
              />
              <AdminField
                id="ads-start"
                name="startsOn"
                label={T.ads.startsOn}
                type="date"
                required
              />
              <AdminField id="ads-end" name="endsOn" label={T.ads.endsOn} type="date" required />
              <AdminField
                id="ads-url"
                name="url"
                label={T.ads.url}
                type="url"
                required
                maxLength={300}
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="type-label text-16 text-strong">{T.ads.sections}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {sections
                  .filter((s) => s.slug !== FORBIDDEN_SECTION)
                  .map((s) => (
                    <label key={s.slug} className="flex min-h-tap items-center gap-2 type-body">
                      <input type="checkbox" name="sections" value={s.slug} />
                      {s.name}
                    </label>
                  ))}
              </div>
              <p className="type-meta text-meta">{T.ads.sectionsHint}</p>
            </fieldset>
            <div>
              <Button type="submit" variant="primary" size="md">
                {T.ads.create}
              </Button>
            </div>
          </form>
        </AdminBlock>
      )}

      <AdminBlock id="ads-list" title={T.ads.tableCaption}>
        {campaigns.length === 0 ? (
          <EmptyState title={T.ads.empty} icon="layers" as="h3">
            {T.ads.emptyBody}
          </EmptyState>
        ) : (
          <AiOpsTable
            caption={T.ads.tableCaption}
            minWidthClass="min-w-[60rem]"
            columns={[
              T.ads.colAdvertiser,
              T.ads.colPeriod,
              T.ads.colSections,
              T.ads.colStatus,
              T.ads.colPreview,
              T.ads.colActions,
            ]}
          >
            {campaigns.map((c) => {
              const st = campaignStatus(c, today);
              return (
                <tr key={c.id} className={ROW}>
                  <th scope="row" className={`${CELL} font-semibold text-strong`}>
                    {c.advertiser}
                  </th>
                  <td className={`${CELL} tabular-nums`}>
                    {formatDate(c.startsOn)} a {formatDate(c.endsOn)}
                  </td>
                  <td className={CELL}>
                    {c.allowedSections.map((s) => names.get(s) ?? s).join(", ")}
                  </td>
                  <td className={CELL}>
                    <span className="inline-flex items-center gap-1">
                      <Icon name={STATUS_ICON[st]} size={16} />
                      {T.ads[st]}
                    </span>
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-col items-start gap-2">
                      <OriginLabel
                        label={{ kind: "sponsored", text: T.ads.sponsoredLabel }}
                        size="sm"
                      />
                      <a
                        href={c.creative.url}
                        target="_blank"
                        rel="sponsored noopener noreferrer"
                        className="type-body text-link underline underline-offset-4"
                      >
                        {c.creative.headline}
                      </a>
                      <span className="type-meta text-meta">{T.ads.previewNote}</span>
                    </div>
                  </td>
                  <td className={CELL}>
                    {canWrite && st !== "expired" ? (
                      <form action={toggleAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          aria-label={
                            c.active ? T.ads.pause(c.advertiser) : T.ads.activate(c.advertiser)
                          }
                        >
                          {c.active ? T.ads.pauseShort : T.ads.activateShort}
                        </Button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </AiOpsTable>
        )}
      </AdminBlock>
    </div>
  );
}
