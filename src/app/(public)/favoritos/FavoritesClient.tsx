"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import {
  AccountInvite,
  Button,
  Chip,
  EmptyState,
  IconButton,
  InlineAlert,
  Skeleton,
  Tabs,
  TextField,
  useToast,
} from "@/components";
import { FAVORITES_TEXT as T } from "@/content/pt-BR/favorites";
import { SECTIONS } from "@/content/pt-BR/nav";
import { ANON_TEXT } from "@/content/pt-BR/privacy";
import { requestLoginInvite } from "@/lib/anon/invite";
import type { AnonProfile, AnonStore } from "@/lib/anon/types";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { formatWhen } from "@/lib/format/date";
import { cacheSaved } from "@/lib/offline/sw";

type Tab = keyof typeof T.tabs;
const TABS: Tab[] = ["saved", "sources", "topics", "collections"];
/** Aba no endereço (`?aba=`), para voltar ou compartilhar a aba aberta (item 71). */
const TAB_SLUG: Record<Tab, string> = {
  saved: "salvos",
  sources: "fontes",
  topics: "assuntos",
  collections: "colecoes",
};
const tabFromSlug = (slug?: string): Tab => TABS.find((t) => TAB_SLUG[t] === slug) ?? "saved";
const sectionName = (slug?: string) => SECTIONS.find((s) => s.id === slug)?.label ?? slug ?? "";

export interface FavoritesClientProps {
  sourceNames: Record<string, string>;
  /** Valor de `?aba=` lido pela página (salvos, fontes, assuntos, colecoes). */
  initialTab?: string;
}

export function FavoritesClient({ sourceNames, initialTab }: FavoritesClientProps) {
  const { profile, degraded, ready, act: rawAct } = useAnonProfile();
  const toast = useToast();
  // Toda gravação no perfil local que falha vira aviso (item 88); cada ação desfaz o otimismo.
  const act: Act = useCallback(
    async <T,>(fn: (s: AnonStore) => Promise<T>) => {
      const r = await rawAct(fn);
      if (!r.ok) toast.show({ message: ANON_TEXT.actFailed, tone: "error" });
      return r;
    },
    [rawAct, toast],
  );
  const [tab, setTab] = useState<Tab>(() => tabFromSlug(initialTab));
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();

  const savedPaths = (profile?.saved ?? []).flatMap((s) => (s.href ? [s.href] : [])).join("|");
  useEffect(() => {
    if (savedPaths) void cacheSaved(savedPaths.split("|"));
  }, [savedPaths]);

  const tabIndex = TABS.indexOf(tab);
  return (
    <div
      data-ready={ready ? "true" : undefined}
      className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-6"
    >
      <aside className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:col-start-9 lg:row-start-1">
        <InlineAlert tone="info" title={T.deviceOnly} role="none">
          <p>{T.deviceOnlyText}</p>
        </InlineAlert>
        <AccountInvite next="/favoritos" />
      </aside>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-8 lg:row-start-1">
        {degraded && (
          <InlineAlert tone="warn" title={ANON_TEXT.degraded}>
            <p>{ANON_TEXT.degradedDetail}</p>
          </InlineAlert>
        )}
        <Tabs
          label={T.tabsLabel}
          items={TABS.map((t) => T.tabs[t])}
          value={T.tabs[tab]}
          onChange={(label) => {
            const next = TABS.find((t) => T.tabs[t] === label);
            if (next) {
              setTab(next);
              const slug = TAB_SLUG[next];
              router.replace(next === "saved" ? pathname : `${pathname}?aba=${slug}`, {
                scroll: false,
              });
            }
          }}
          idPrefix={id}
          layout="scroll"
        />
        {TABS.map((t, i) =>
          i === tabIndex ? (
            <div
              key={t}
              role="tabpanel"
              id={`${id}-painel-${i}`}
              aria-labelledby={`${id}-aba-${i}`}
              className="flex flex-col gap-4"
            >
              {!profile ? (
                <div aria-busy="true" className="flex flex-col gap-3">
                  <p className="sr-only">{T.loading}</p>
                  <Skeleton lines={2} />
                  <Skeleton lines={2} />
                </div>
              ) : t === "saved" ? (
                <Saved profile={profile} act={act} />
              ) : t === "sources" ? (
                <Sources profile={profile} act={act} names={sourceNames} />
              ) : t === "topics" ? (
                <Topics profile={profile} act={act} />
              ) : (
                <Collections profile={profile} act={act} />
              )}
            </div>
          ) : (
            <div
              key={t}
              role="tabpanel"
              id={`${id}-painel-${i}`}
              aria-labelledby={`${id}-aba-${i}`}
              hidden
            />
          ),
        )}
      </div>
    </div>
  );
}

type Act = ReturnType<typeof useAnonProfile>["act"];

type SavedItem = AnonProfile["saved"][number];

/**
 * Remoção com "Desfazer" no lugar do item (item 71, Review Focus 3). O "Desfazer" fica inline,
 * não no toast: o toast é uma região viva fixa que some sozinha e, ao fechar, devolveria o foco
 * ao conteúdo principal, longe da lista. Aqui o foco vai ao "Desfazer" na mesma posição do item
 * e, ao desfazer, ao botão "Remover" do item devolvido: nunca cai no `body`.
 */
type Pending = { item: SavedItem; index: number; state: "removed" | "restored" } | null;

function Saved({ profile, act }: { profile: AnonProfile; act: Act }) {
  const [section, setSection] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const baseId = useId();
  const focusId = `${baseId}-foco`;

  // Depois de remover ou desfazer, o foco vai ao botão que ocupa o lugar do item.
  useEffect(() => {
    if (pending) document.getElementById(focusId)?.focus();
  }, [pending, focusId]);

  const rest = profile.saved.filter((s) => s.ref !== pending?.item.ref);
  if (rest.length === 0 && !pending)
    return (
      <EmptyState
        title={T.savedEmpty}
        icon="bookmark"
        actions={
          <Button href="/" size="md" variant="outline">
            {T.savedEmptyAction}
          </Button>
        }
      >
        <p>{T.savedEmptyText}</p>
      </EmptyState>
    );
  const sections = [...new Set(profile.saved.flatMap((s) => (s.section ? [s.section] : [])))];
  const inSection = (s: SavedItem) => !section || s.section === section;
  const list: { item: SavedItem; placeholder: boolean }[] = rest
    .filter(inSection)
    .map((item) => ({ item, placeholder: false }));
  if (pending && inSection(pending.item))
    list.splice(Math.min(pending.index, list.length), 0, {
      item: pending.item,
      placeholder: pending.state === "removed",
    });

  // Se a gravação falhar, volta ao estado anterior (o foco acompanha pelo efeito acima).
  const revert = (ref: string, state: NonNullable<Pending>["state"]) =>
    setPending((cur) => (cur?.item.ref === ref ? { ...cur, state } : cur));
  const remove = (s: SavedItem, index: number) => {
    setPending({ item: s, index, state: "removed" });
    void act((st) => st.unsave(s.ref)).then((r) => {
      if (!r.ok) revert(s.ref, "restored");
    });
  };
  const undo = (p: NonNullable<Pending>) => {
    const s = p.item;
    setPending({ ...p, state: "restored" });
    void act((st) =>
      st.save(s.ref, s.progress, { title: s.title, href: s.href, section: s.section }),
    ).then((r) => {
      if (!r.ok) revert(s.ref, "removed");
    });
  };

  return (
    <>
      {sections.length > 1 && (
        <div role="group" aria-label={T.filterLabel} className="flex flex-wrap gap-2">
          <Chip active={!section} onClick={() => setSection(null)}>
            {T.all}
          </Chip>
          {sections.map((s) => (
            <Chip key={s} active={section === s} onClick={() => setSection(s)}>
              {sectionName(s)}
            </Chip>
          ))}
        </div>
      )}
      <ul className="flex flex-col">
        {list.map(({ item: s, placeholder }, index) => {
          const title = s.title ?? T.untitled;
          const isPending = pending?.item.ref === s.ref;
          if (placeholder && pending)
            return (
              <li
                key={s.ref}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle py-3 last:border-b"
              >
                <p className="min-w-0 flex-1 basis-60 type-body text-meta">{T.removed(title)}</p>
                <Button
                  id={focusId}
                  size="sm"
                  variant="outline"
                  aria-label={T.undoLabel(title)}
                  onClick={() => undo(pending)}
                >
                  {T.undo}
                </Button>
              </li>
            );
          return (
            <li
              key={s.ref}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle py-3 last:border-b"
            >
              <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                {s.href ? (
                  <Link
                    href={s.href}
                    className="type-headline-sm text-strong underline-offset-4 hover:underline"
                  >
                    {title}
                  </Link>
                ) : (
                  <p className="type-headline-sm text-strong">{title}</p>
                )}
                <p className="type-meta text-meta">
                  {[
                    sectionName(s.section),
                    s.progress > 0 ? T.readPct(Math.round(s.progress)) : T.unread,
                    T.savedAt(formatWhen(s.at)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                id={isPending ? focusId : undefined}
                size="sm"
                variant="outline"
                icon="trash-2"
                aria-label={T.removeLabel(title)}
                onClick={() => remove(s, index)}
              >
                {T.remove}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="type-meta text-meta">{T.offline}</p>
    </>
  );
}

function Sources({
  profile,
  act,
  names,
}: {
  profile: AnonProfile;
  act: Act;
  names: Record<string, string>;
}) {
  const list = profile.follows.filter((f) => f.kind === "source");
  if (list.length === 0)
    return (
      <EmptyState
        title={T.sourcesEmpty}
        icon="globe"
        actions={
          <Button href="/fontes" size="md" variant="outline">
            {T.sourcesEmptyAction}
          </Button>
        }
      >
        <p>{T.sourcesEmptyText}</p>
      </EmptyState>
    );
  const ids = list.map((f) => f.id);
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    void act((s) => s.reorderFollows("source", next));
  };
  return (
    <ol className="flex flex-col">
      {list.map((f, i) => {
        const name = names[f.id] ?? f.label ?? f.id;
        return (
          <li
            key={f.id}
            className="flex flex-wrap items-center gap-2 border-t border-line-subtle py-2 last:border-b"
          >
            <Link
              href={`/fontes/${f.id}`}
              className="min-w-0 flex-1 basis-40 type-body font-semibold text-strong underline-offset-4 hover:underline"
            >
              {name}
            </Link>
            <IconButton
              icon="arrow-up"
              size={44}
              label={T.moveUp(name)}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <IconButton
              icon="chevron-down"
              size={44}
              label={T.moveDown(name)}
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
            />
            <Button
              size="sm"
              variant="outline"
              aria-label={T.unfollowLabel(name)}
              onClick={() => void act((s) => s.unfollow("source", f.id))}
            >
              {T.unfollow}
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

function Topics({ profile, act }: { profile: AnonProfile; act: Act }) {
  const list = profile.follows.filter((f) => f.kind === "topic" || f.kind === "section");
  if (list.length === 0)
    return (
      <EmptyState
        title={T.topicsEmpty}
        icon="layers"
        actions={
          <Button href="/assuntos" size="md" variant="outline">
            {T.topicsEmptyAction}
          </Button>
        }
      >
        <p>{T.topicsEmptyText}</p>
      </EmptyState>
    );
  return (
    <ul className="flex flex-col">
      {list.map((f) => {
        const name = f.label ?? (f.kind === "section" ? sectionName(f.id) : f.id);
        return (
          <li
            key={`${f.kind}:${f.id}`}
            className="flex flex-wrap items-center gap-2 border-t border-line-subtle py-2 last:border-b"
          >
            <Link
              href={f.kind === "topic" ? `/assunto/${f.id}` : `/${f.id}`}
              className="min-w-0 flex-1 basis-40 type-body font-semibold text-strong underline-offset-4 hover:underline"
            >
              {name}
            </Link>
            <Button
              size="sm"
              variant="outline"
              aria-label={T.unfollowLabel(name)}
              onClick={() => void act((s) => s.unfollow(f.kind, f.id))}
            >
              {T.unfollow}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function Collections({ profile, act }: { profile: AnonProfile; act: Act }) {
  const id = useId();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return (
    <>
      <form
        noValidate
        className="flex flex-col items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setNameError(true);
            document.getElementById(`${id}-nova`)?.focus();
            return;
          }
          setNameError(false);
          // Só limpa o campo e convida depois de gravar; na falha o nome digitado fica.
          void act((s) => s.createCollection(name)).then((r) => {
            if (!r.ok) return;
            setName("");
            requestLoginInvite("collection");
          });
        }}
      >
        <TextField
          id={`${id}-nova`}
          label={T.newCollection}
          placeholder={T.newCollectionPlaceholder}
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          error={nameError ? T.collectionNameError : undefined}
          className="w-full max-w-read"
        />
        <Button type="submit" icon="plus">
          {T.create}
        </Button>
      </form>
      {profile.collections.length === 0 ? (
        <EmptyState title={T.collectionsEmpty} icon="list">
          <p>{T.collectionsEmptyText}</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col">
          {profile.collections.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 border-t border-line-subtle py-2 last:border-b"
            >
              {editing === c.id ? (
                <form
                  className="flex flex-1 flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act((s) => s.renameCollection(c.id, draft)).then((r) => {
                      if (r.ok) setEditing((cur) => (cur === c.id ? null : cur));
                    });
                  }}
                >
                  <TextField
                    id={`${id}-${c.id}`}
                    label={T.renameField(c.name)}
                    value={draft}
                    maxLength={80}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 basis-48"
                  />
                  <Button type="submit" size="sm">
                    {T.saveName}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    {T.cancel}
                  </Button>
                </form>
              ) : (
                <>
                  <p className="min-w-0 flex-1 basis-40 type-body text-strong">
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="type-meta text-meta">· {T.items(c.items.length)}</span>
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="pencil"
                    aria-label={T.renameLabel(c.name)}
                    onClick={() => {
                      setDraft(c.name);
                      setEditing(c.id);
                    }}
                  >
                    {T.rename}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="trash-2"
                    aria-label={T.deleteLabel(c.name)}
                    onClick={() => void act((s) => s.deleteCollection(c.id))}
                  >
                    {T.delete}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
