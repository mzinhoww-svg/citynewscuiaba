import type { Metadata } from "next";
import { APP_PAGE_TEXT as T } from "@/content/pt-BR/app";
import { pageMetadata } from "@/lib/seo/metadata";
import { InstallButton } from "./InstallButton";

/** P26 · Baixar o app (spec 2026-09-28 §7.9): instruções por plataforma, sem banco. */
export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.description,
  path: "/app",
});

export default function Page() {
  return (
    <div className="mx-auto flex max-w-page flex-col gap-8 px-gutter py-8">
      <header className="flex max-w-read flex-col gap-3">
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
        <InstallButton />
      </header>
      <section aria-labelledby="app-como" className="flex max-w-read flex-col gap-4">
        <h2 id="app-como" className="type-section text-strong">
          {T.howTo}
        </h2>
        {T.platforms.map((p) => (
          <section key={p.id} aria-labelledby={`app-${p.id}`} className="flex flex-col gap-2">
            <h3 id={`app-${p.id}`} className="type-headline-sm text-strong">
              {p.title}
            </h3>
            {p.steps.length > 1 ? (
              <ol className="flex list-decimal flex-col gap-1 pl-5 type-body text-body">
                {p.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : (
              <p className="type-body text-body">{p.steps[0]}</p>
            )}
          </section>
        ))}
      </section>
      <section aria-labelledby="app-porque" className="flex max-w-read flex-col gap-3">
        <h2 id="app-porque" className="type-section text-strong">
          {T.whyTitle}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body text-body">
          {T.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
