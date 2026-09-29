import type { Metadata } from "next";
import { AdminInput, AdminFlash, AdminTable, Button, Select } from "@/components";
import { TAXONOMY_TEXT as T } from "@/content/pt-BR/admin";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { requireRole } from "@/lib/auth/require-role";
import { getTaxonomy, type TaxonomyData } from "@/lib/admin/taxonomy";
import { AdminLoadError } from "../load-error";
import { errorText, okText } from "../flash";
import {
  createSubsectionAction,
  createTagAction,
  deleteTagAction,
  mergeTagsAction,
  renameSectionAction,
  renameTagAction,
} from "./actions";

export const metadata: Metadata = { title: "Taxonomia · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/taxonomia";
type Params = Record<string, string | string[] | undefined>;

export default async function TaxonomyPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("users.manage", undefined, { next: NEXT });
  const sp = await searchParams;
  let data: TaxonomyData | null = null;
  try {
    data = await getTaxonomy();
  } catch (e) {
    console.error("estudio taxonomia:", e instanceof Error ? e.message : e);
  }
  const moved = Number(typeof sp.n === "string" ? sp.n : "0");
  const ok = okText(sp.ok, {
    "tag-criada": T.tagCreated,
    "tag-renomeada": T.tagRenamed,
    "tag-excluida": T.tagDeleted,
    mesclada: T.tagMerged(Number.isFinite(moved) && moved >= 0 ? Math.floor(moved) : 0),
    "editoria-salva": T.sectionSaved,
    "editoria-criada": T.sectionCreated,
  });
  const parentName = (slug: string | null) =>
    slug ? (data?.sections.find((s) => s.slug === slug)?.name ?? slug) : T.top;
  const tagOptions = (data?.tags ?? []).map((t) => ({
    value: t.id,
    label: `${t.name} (${t.articles})`,
  }));
  return (
    <section className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <AdminFlash ok={ok} error={errorText(sp.erro)} />
      {data === null ? (
        <AdminLoadError href={NEXT} />
      ) : (
        <>
          <section aria-labelledby="editorias" className="flex flex-col gap-4">
            <h2 id="editorias" className="type-section text-strong">
              {T.sectionsTitle}
            </h2>
            <AdminTable
              caption={T.sectionsCaption}
              columns={[T.colName, T.colSlug, T.colParent, T.colAutonomy]}
              wide
            >
              {data.sections.map((s) => (
                <tr key={s.slug} className="border-b border-line-subtle align-top last:border-b-0">
                  <th scope="row" className="px-3 py-3">
                    <form
                      action={renameSectionAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="slug" value={s.slug} />
                      <AdminInput
                        id={`sec-${s.slug}`}
                        name="name"
                        label={T.renameNamed(s.name)}
                        defaultValue={s.name}
                        required
                        maxLength={60}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        aria-label={T.saveNamed(s.name)}
                      >
                        {T.save}
                      </Button>
                    </form>
                  </th>
                  <td className="px-3 py-3 type-body">{s.slug}</td>
                  <td className="px-3 py-3 type-body">{parentName(s.parentSlug)}</td>
                  <td className="px-3 py-3 type-body">{s.autonomyCategory}</td>
                </tr>
              ))}
            </AdminTable>
            <h3 className="type-headline-sm text-strong">{T.newSectionTitle}</h3>
            <form action={createSubsectionAction} className="flex flex-wrap items-end gap-3">
              <AdminInput
                id="sub-name"
                name="name"
                label={T.newSectionName}
                showLabel
                required
                maxLength={60}
              />
              <Select
                id="sub-parent"
                name="parentSlug"
                label={T.newSectionParent}
                options={data.sections
                  .filter((s) => s.parentSlug === null)
                  .map((s) => ({ value: s.slug, label: s.name }))}
              />
              <Button type="submit" size="md" variant="outline">
                {T.newSection}
              </Button>
            </form>
          </section>

          <section aria-labelledby="tags" className="flex flex-col gap-4">
            <h2 id="tags" className="type-section text-strong">
              {T.tagsTitle}
            </h2>
            <form action={createTagAction} className="flex flex-wrap items-end gap-3">
              <AdminInput
                id="tag-new"
                name="name"
                label={T.newTagName}
                showLabel
                required
                maxLength={60}
              />
              <Button type="submit" size="md">
                {T.createTag}
              </Button>
            </form>
            {data.tags.length === 0 ? (
              <p className="type-body text-meta">{T.emptyTags}</p>
            ) : (
              <AdminTable caption={T.tagsCaption} columns={[T.colTag, T.colArticles, T.colActions]}>
                {data.tags.map((t) => (
                  <tr
                    key={t.id}
                    data-tag={t.slug}
                    className="border-b border-line-subtle align-top last:border-b-0"
                  >
                    <th scope="row" className="px-3 py-3">
                      <form action={renameTagAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <AdminInput
                          id={`tag-${t.id}`}
                          name="name"
                          label={`Novo nome da tag ${t.name}`}
                          defaultValue={t.name}
                          required
                          maxLength={60}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          aria-label={`Salvar nome da tag ${t.name}`}
                        >
                          {T.save}
                        </Button>
                      </form>
                    </th>
                    <td className="px-3 py-3 type-body tabular-nums">{t.articles}</td>
                    <td className="px-3 py-3">
                      {t.articles === 0 ? (
                        <form action={deleteTagAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="danger"
                            aria-label={T.deleteNamed(t.name)}
                          >
                            {T.delete}
                          </Button>
                        </form>
                      ) : (
                        <span className="type-meta text-meta">{T.deleteBlocked}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </section>

          <section aria-labelledby="duplicadas" className="flex flex-col gap-4">
            <h2 id="duplicadas" className="type-section text-strong">
              {T.duplicatesTitle}
            </h2>
            <p className="type-body text-meta">{T.duplicatesIntro}</p>
            {data.duplicates.length === 0 ? (
              <p className="type-body text-meta">{T.noDuplicates}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.duplicates.map((g) => (
                  <li key={g.key} className="flex flex-col gap-2 border-b border-line-subtle pb-3">
                    {g.others.map((o) => (
                      <form
                        key={o.id}
                        action={mergeTagsAction}
                        className="flex flex-wrap items-center gap-3"
                      >
                        <input type="hidden" name="fromId" value={o.id} />
                        <input type="hidden" name="intoId" value={g.keep.id} />
                        <span className="type-body text-strong">
                          {o.name} ({o.articles}) e {g.keep.name} ({g.keep.articles})
                        </span>
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          aria-label={T.mergeNamed(o.name, g.keep.name)}
                        >
                          {T.mergeInto(g.keep.name)}
                        </Button>
                      </form>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="type-headline-sm text-strong">{T.mergeTitle}</h3>
            <form action={mergeTagsAction} className="flex flex-wrap items-end gap-3">
              <Select
                id="merge-from"
                name="fromId"
                label={T.mergeFrom}
                placeholder="Escolha a tag"
                options={tagOptions}
                required
              />
              <Select
                id="merge-into"
                name="intoId"
                label={T.mergeTo}
                placeholder="Escolha a tag"
                options={tagOptions}
                required
              />
              <Button type="submit" size="md" variant="outline">
                {T.merge}
              </Button>
            </form>
          </section>

          <section aria-labelledby="lugares" className="flex flex-col gap-2">
            <h2 id="lugares" className="type-section text-strong">
              {T.placesTitle}
            </h2>
            <p className="type-body text-meta">{T.placesIntro}</p>
            <p className="type-body text-strong">{T.places(NEIGHBORHOODS.length)}</p>
          </section>
        </>
      )}
    </section>
  );
}
