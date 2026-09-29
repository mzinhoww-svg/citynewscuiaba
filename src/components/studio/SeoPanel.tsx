import type { MetadataRoute } from "next";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { applyTitleTemplate } from "@/lib/admin/settings";
import { AdminBlock } from "./AdminFields";
import { AdminSettingsForm, type SettingsFormField } from "./AdminSettingsForm";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

export interface SeoPanelProps {
  action: (formData: FormData) => void | Promise<void>;
  canWrite: boolean;
  titleTemplate: string;
  defaultDescription: string;
  robots: MetadataRoute.Robots;
  missing: { missing: number; total: number } | null;
}

const asList = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** SEO (A08): padrões editáveis, sitemaps e robots em leitura, páginas sem descrição. */
export function SeoPanel({
  action,
  canWrite,
  titleTemplate,
  defaultDescription,
  robots,
  missing,
}: SeoPanelProps) {
  const fields: SettingsFormField[] = [
    { key: "seo.title_template", hint: T.seo.titleTemplateHint, value: titleTemplate },
    {
      key: "seo.default_description",
      hint: T.seo.defaultDescriptionHint,
      value: defaultDescription,
      multiline: true,
    },
  ];
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="seo-defaults" title={T.seo.defaultsTitle}>
        <AdminSettingsForm id="seo" action={action} fields={fields} canWrite={canWrite} />
        <p className="type-meta text-meta">
          {T.seo.sample}{" "}
          <strong className="text-strong">
            {applyTitleTemplate(titleTemplate, T.seo.sampleTitle)}
          </strong>
        </p>
      </AdminBlock>

      <AdminBlock id="seo-sitemaps" title={T.seo.sitemapsTitle}>
        <AiOpsTable
          caption={T.seo.sitemapsCaption}
          minWidthClass="min-w-[32rem]"
          columns={[T.seo.colPath, T.seo.colWhat]}
        >
          {T.seo.sitemaps.map((s) => (
            <tr key={s.path} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                <a href={s.path} className="text-link underline underline-offset-4">
                  {s.path}
                </a>
              </th>
              <td className={CELL}>{s.what}</td>
            </tr>
          ))}
        </AiOpsTable>
      </AdminBlock>

      <AdminBlock id="seo-robots" title={T.seo.robotsTitle}>
        <AiOpsTable
          caption={T.seo.robotsCaption}
          minWidthClass="min-w-[32rem]"
          columns={[T.seo.colRule, T.seo.colPaths]}
        >
          {rules.flatMap((r, i) => [
            <tr key={`a${i}`} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {T.seo.robotsAllow}
              </th>
              <td className={CELL}>{asList(r.allow).join(", ") || "—"}</td>
            </tr>,
            <tr key={`d${i}`} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {T.seo.robotsDisallow}
              </th>
              <td className={`${CELL} break-words`}>{asList(r.disallow).join(", ") || "—"}</td>
            </tr>,
          ])}
          {asList(robots.sitemap).map((s) => (
            <tr key={s} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {T.seo.robotsSitemap}
              </th>
              <td className={`${CELL} break-all`}>{s}</td>
            </tr>
          ))}
        </AiOpsTable>
        <p className="type-meta text-meta">{T.seo.readonlyNote}</p>
      </AdminBlock>

      {missing && (
        <AdminBlock id="seo-missing" title={T.seo.missingTitle}>
          <p className="type-body">{T.seo.missingBody(missing.missing, missing.total)}</p>
        </AdminBlock>
      )}
    </div>
  );
}
