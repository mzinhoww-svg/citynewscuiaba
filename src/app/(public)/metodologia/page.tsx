import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo/metadata";
import { DocPage, OriginLabel } from "@/components";
import { METHOD } from "@/content/pt-BR/institutional";
import { LABEL_EXPLAIN, LABEL_TEXT } from "@/content/pt-BR/labels";
import type { LabelKind } from "@/lib/labels";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

/** Metodologia (P24): como as matérias são feitas, rótulos e regras públicas, a partir do código. */
export const metadata: Metadata = pageMetadata({
  title: METHOD.title,
  documentTitle: METHOD.metaTitle,
  description: METHOD.description,
  path: METHOD.path,
});

const pct = (n: number | null) => (n === null ? METHOD.none : n.toFixed(2).replace(".", ","));

export default function MethodologyPage() {
  /* R34: oculta do público; abre só com CN_SHOW_LEGAL_PAGES=1 (código mantido). */
  if (process.env.CN_SHOW_LEGAL_PAGES !== "1") notFound();
  const kinds = Object.keys(LABEL_TEXT) as LabelKind[];
  const rules = Object.entries(DEFAULT_RULES.categories);
  return (
    <DocPage title={METHOD.title} intro={METHOD.intro} path={METHOD.path}>
      <div className="flex max-w-read flex-col gap-10">
        <section aria-labelledby="como" className="flex flex-col gap-3">
          <h2 id="como" className="type-section text-strong">
            {METHOD.howTitle}
          </h2>
          <p className="type-body-read text-body">{METHOD.howIntro}</p>
          <ul className="flex list-disc flex-col gap-2 pl-6 type-body-read text-body marker:text-meta">
            {METHOD.howItems.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="rotulos" className="flex flex-col gap-3">
          <h2 id="rotulos" className="type-section text-strong">
            {METHOD.labelsTitle}
          </h2>
          <p className="type-body-read text-body">{METHOD.labelsIntro}</p>
          <dl className="flex flex-col gap-4">
            {kinds.map((k) => (
              <div key={k} className="flex flex-col items-start gap-1.5">
                <dt>
                  <OriginLabel label={{ kind: k, text: LABEL_TEXT[k] }} />
                </dt>
                <dd className="type-body text-body">{LABEL_EXPLAIN[k]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section aria-labelledby="regras" className="flex flex-col gap-3">
        <h2 id="regras" className="type-section text-strong">
          {METHOD.rulesTitle}
        </h2>
        <p className="max-w-read type-body-read text-body">{METHOD.rulesIntro}</p>
        <div
          role="region"
          aria-label={METHOD.rulesCaption}
          tabIndex={0}
          className="-mx-gutter overflow-x-auto px-gutter lg:mx-0 lg:px-0"
        >
          <table className="w-full min-w-160 border-collapse text-left type-body text-body">
            <caption className="pb-3 text-left type-meta text-meta">{METHOD.rulesCaption}</caption>
            <thead>
              <tr className="border-b-2 border-line-strong type-meta text-strong">
                <th scope="col" className="py-2 pr-4">
                  {METHOD.columns.category}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {METHOD.columns.mode}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {METHOD.columns.sources}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {METHOD.columns.primary}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {METHOD.columns.image}
                </th>
                <th scope="col" className="py-2">
                  {METHOD.columns.score}
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map(([cat, r]) => {
                const blocked = r.mode === "blocked";
                return (
                  <tr key={cat} className="border-b border-line-subtle">
                    <th scope="row" className="py-2 pr-4 font-semibold text-strong">
                      {METHOD.categories[cat] ?? cat}
                    </th>
                    <td className="py-2 pr-4">{METHOD.modes[r.mode]}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {blocked ? METHOD.none : r.minSources}
                    </td>
                    <td className="py-2 pr-4">
                      {blocked ? METHOD.none : r.requirePrimary ? METHOD.yes : METHOD.no}
                    </td>
                    <td className="py-2 pr-4">
                      {blocked ? METHOD.none : r.requireApprovedImage ? METHOD.yes : METHOD.no}
                    </td>
                    <td className="py-2 tabular-nums">{pct(r.minScore)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 className="type-nav-title text-strong">{METHOD.sensitiveTitle}</h3>
        <p className="max-w-read type-body-read text-body">{METHOD.sensitive}</p>
      </section>
    </DocPage>
  );
}
