import type { Metadata } from "next";
import { Button, EmptyState, Select } from "@/components";
import { StudioScreen, VersionCompare } from "@/components/estudio";
import { EDITOR_TEXT, QUEUE_TEXT, VERSIONS_TEXT as T } from "@/content/pt-BR/studio";
import { requireRole } from "@/lib/auth/require-role";
import { listVersions } from "@/lib/db/queries/studio-article";
import { formatDateTime } from "@/lib/format/date";
import { versionDiff } from "@/lib/studio/diff";
import { LoadError, loadOrNull } from "../../../load-error";

export const metadata: Metadata = { title: "Versões · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const num = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  await requireRole("article.edit", undefined, { next: `/estudio/materias/${id}/versoes` });
  const sp = await searchParams;
  const loaded = await loadOrNull("versoes", () => listVersions(id));
  if (!loaded) return <LoadError retryHref={`/estudio/materias/${id}/versoes`} />;
  const data = loaded.value;
  if (!data) {
    return (
      <EmptyState as="h1" tone="error" icon="circle-alert" title={T.notFound}>
        {EDITOR_TEXT.notFound}
      </EmptyState>
    );
  }
  const { versions } = data;
  const latest = versions[0];
  const to = versions.find((v) => v.number === num(sp.para)) ?? latest;
  const from =
    versions.find((v) => v.number === num(sp.de)) ??
    versions.find((v) => to && v.number < to.number) ??
    versions[versions.length - 1];
  const label = (n: number, kind: string, at: string) =>
    T.option(n, T.kind[kind] ?? kind, formatDateTime(at));
  const options = versions.map((v) => ({
    value: String(v.number),
    label: label(v.number, v.changeKind, v.createdAt),
  }));
  const diff = from && to ? versionDiff(from.snapshot, to.snapshot) : null;

  return (
    <StudioScreen
      as="article"
      section={T.title}
      title={data.title}
      breadcrumbs={[
        { href: "/estudio/fila", label: QUEUE_TEXT.queueTitle },
        { href: `/estudio/materias/${id}`, label: data.title },
        { href: `/estudio/materias/${id}/versoes`, label: T.title },
      ]}
    >
      {versions.length < 2 || !from || !to || !diff ? (
        <EmptyState title={T.title} icon="history">
          {T.single}
        </EmptyState>
      ) : (
        <>
          <form
            method="get"
            className="grid grid-cols-1 items-end gap-3 rounded-lg border border-line-subtle bg-card-white p-4 md:grid-cols-[1fr_1fr_auto]"
          >
            <Select
              id="versao-de"
              name="de"
              label={T.from}
              options={options}
              defaultValue={String(from.number)}
            />
            <Select
              id="versao-para"
              name="para"
              label={T.to}
              options={options}
              defaultValue={String(to.number)}
            />
            <Button type="submit" size="md">
              {T.compare}
            </Button>
          </form>
          <VersionCompare
            fromLabel={`v${from.number}`}
            toLabel={`v${to.number}`}
            fields={[
              { label: EDITOR_TEXT.fields.title, ops: diff.fields.title },
              { label: EDITOR_TEXT.fields.dek, ops: diff.fields.dek },
              { label: EDITOR_TEXT.fields.body, ops: diff.fields.body },
            ]}
          />
        </>
      )}

      <section aria-labelledby="todas-versoes" className="flex flex-col gap-2">
        <h2 id="todas-versoes" className="type-section text-strong">
          {T.list}
        </h2>
        <ol className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white">
          {versions.map((v) => (
            <li key={v.number} className="flex flex-col gap-1 p-3">
              <span className="type-body text-strong">
                <span className="font-semibold">v{v.number}</span> ·{" "}
                {T.kind[v.changeKind] ?? v.changeKind} · {T.origin[v.origin]}
                {v.authorName ? ` · ${v.authorName}` : ""}
              </span>
              <span className="type-meta text-meta">{formatDateTime(v.createdAt)}</span>
              {v.publicNote && (
                <span className="type-meta text-strong">
                  {T.publicNote}: {v.publicNote}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </StudioScreen>
  );
}
