"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { formatWhen } from "@/lib/format/date";
import { hoursLeft, removalNeedsTyping, untilText } from "@/lib/featured";
import type { BoardItem, BoardSlot } from "@/lib/studio/featured";
import { Photo } from "../../editorial/Photo";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { IconButton } from "../../ui/IconButton";
import { InlineAlert } from "../../ui/InlineAlert";
import { TextField } from "../../ui/TextField";
import { AdminStatus, type AdminReply } from "../admin/AdminStatus";
import { PinForm } from "./PinForm";
import type { FeaturedApi } from "./types";

export interface FeaturedBoardProps {
  board: BoardSlot[];
  api: FeaturedApi;
  /** Agora (ISO), vindo do servidor: o mesmo relógio na tela e nas contas de prazo. */
  nowIso: string;
}

/**
 * Quadro de destaques (FD-T4): um cartão por posição com o ocupante (manual ou automático) e até
 * quando, botões Fixar, Trocar e Remover, reordenação por botões Subir e Descer (sem arrastar),
 * aviso quando uma matéria fixada saiu do ar ou ficou sem capa e pré-visualização no formulário.
 * Remover pede confirmação digitada só quando faltam mais de 24 h (ou não há prazo).
 */
export function FeaturedBoard({ board, api, nowIso }: FeaturedBoardProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [announce, setAnnounce] = useState("");
  const [pinning, setPinning] = useState<{ slot: BoardSlot; replaceId?: string } | null>(null);
  const [removing, setRemoving] = useState<{ slot: BoardSlot; item: BoardItem } | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();

  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) router.refresh();
  };

  const remove = (item: BoardItem) => {
    if (!item.pinId) return;
    const id = item.pinId;
    start(async () => {
      done(await api.unpin({ id }));
      setRemoving(null);
      setTyped("");
    });
  };

  const dismiss = (item: BoardItem) => {
    if (!item.hot) return;
    const id = item.hot.pinId;
    start(async () => done(await api.dismiss({ id })));
  };

  const askRemove = (slot: BoardSlot, item: BoardItem) => {
    if (removalNeedsTyping(item.endsAt, now)) {
      setTyped("");
      setRemoving({ slot, item });
    } else remove(item);
  };

  const move = (slot: BoardSlot, item: BoardItem, dir: "up" | "down") => {
    const pinned = slot.items.filter((i) => i.pinId);
    const from = pinned.findIndex((i) => i.pinId === item.pinId);
    const to = dir === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= pinned.length) return;
    const ids = pinned.map((i) => i.pinId!);
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    setAnnounce(`${item.title}: posição ${to + 1} de ${pinned.length}`);
    start(async () => done(await api.reorder({ slotKey: slot.slotKey, ids })));
  };

  if (board.length === 0) {
    return <EmptyState icon="star" title={T.emptySlot} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <AdminStatus status={status} />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <section aria-labelledby={`${uid}-board`} className="flex flex-col gap-4">
        <h2 id={`${uid}-board`} className="type-section text-strong">
          {T.board}
        </h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.map((slot) => {
            const pinned = slot.items.filter((i) => i.pinId);
            const headId = `${uid}-${slot.id.replace(/[^a-z0-9]/gi, "-")}`;
            return (
              <li key={slot.id} className="flex min-w-0">
                <section
                  aria-labelledby={headId}
                  data-slot={slot.id}
                  className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4"
                >
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={headId} className="type-headline-sm text-strong">
                      {slot.label}
                    </h3>
                    <p className="type-meta font-semibold text-strong" data-testid="slot-source">
                      {T.source[slot.source]}
                      {slot.items.length > 0 && slot.source !== "manual" && slot.until
                        ? ` · ${T.until(untilText(slot.until, now))}`
                        : ""}
                    </p>
                  </header>

                  {slot.items.length === 0 ? (
                    <p className="type-body text-meta">{T.empty(null)}</p>
                  ) : (
                    <ol className="flex flex-col gap-3" aria-label={T.occupant}>
                      {slot.items.map((item) => (
                        <li
                          key={item.articleId}
                          className="flex min-w-0 flex-col gap-2 border-t border-line-subtle pt-3 first:border-0 first:pt-0"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            {item.imageSrc && (
                              // Miniatura decorativa: o título já descreve a matéria.
                              <Photo
                                src={item.imageSrc}
                                alt=""
                                ratio={1}
                                radius="md"
                                sizes="4rem"
                                className="size-16"
                              />
                            )}
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <a
                                href={item.href}
                                className="hit-area type-body font-medium text-strong underline-offset-4 hover:underline"
                              >
                                {item.title}
                              </a>
                              <p className="type-meta text-meta">
                                {item.sectionName} · {formatWhen(item.publishedAt, now)}
                              </p>
                              {item.pinId && (
                                <p className="type-meta text-meta" data-testid="pin-info">
                                  {item.pinnedBy ? T.pinnedBy(item.pinnedBy) : T.source.manual}
                                  {" · "}
                                  {item.endsAt
                                    ? T.until(untilText(item.endsAt, now))
                                    : T.untilRemoved}
                                  {item.note ? ` · ${item.note}` : ""}
                                </p>
                              )}
                              {item.hot && (
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-meta">
                                  <span
                                    data-testid="hot-pill"
                                    className="inline-flex items-center rounded-pill border border-line-strong px-2.5 py-0.5 font-semibold text-strong"
                                  >
                                    {T.hot.pill(item.hot.portals)}
                                  </span>
                                  {item.hot.endsAt && (
                                    <span>{T.until(untilText(item.hot.endsAt, now))}</span>
                                  )}
                                </p>
                              )}
                              {item.hot && <p className="type-meta text-meta">{T.hot.info}</p>}
                            </div>
                          </div>
                          {item.hot && !item.pinId && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline-strong"
                                disabled={busy}
                                aria-label={`${T.actions.dismiss}: ${item.title}`}
                                onClick={() => dismiss(item)}
                              >
                                {T.actions.dismiss}
                              </Button>
                            </div>
                          )}
                          {item.pinId && (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                aria-label={`${T.actions.swap}: ${item.title}`}
                                onClick={() => setPinning({ slot, replaceId: item.pinId! })}
                              >
                                {T.actions.swap}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-strong"
                                disabled={busy}
                                aria-label={`${T.actions.remove}: ${item.title}`}
                                onClick={() => askRemove(slot, item)}
                              >
                                {T.actions.remove}
                              </Button>
                              {pinned.length > 1 && (
                                <span className="flex">
                                  <IconButton
                                    icon="arrow-up"
                                    variant="ghost"
                                    size={44}
                                    label={`${T.actions.up}: ${item.title}`}
                                    disabled={busy || pinned[0]?.pinId === item.pinId}
                                    onClick={() => move(slot, item, "up")}
                                  />
                                  <IconButton
                                    icon="arrow-down"
                                    variant="ghost"
                                    size={44}
                                    label={`${T.actions.down}: ${item.title}`}
                                    disabled={
                                      busy || pinned[pinned.length - 1]?.pinId === item.pinId
                                    }
                                    onClick={() => move(slot, item, "down")}
                                  />
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {slot.source === "automatic" && (
                    <p className="type-meta text-meta" data-testid="slot-empty">
                      {slot.items.length > 0 && slot.until
                        ? T.empty(untilText(slot.until, now))
                        : slot.items.length > 0
                          ? T.empty(null)
                          : ""}
                    </p>
                  )}

                  {slot.dropped.map((d) => (
                    <InlineAlert
                      key={d.pinId}
                      tone="warn"
                      role="status"
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setPinning({ slot, replaceId: d.pinId })}
                        >
                          {T.actions.swap}
                        </Button>
                      }
                    >
                      <span className="font-medium">{d.title}</span>
                      {" — "}
                      {T.dropped[d.reason]}
                    </InlineAlert>
                  ))}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy || slot.free === 0}
                      aria-label={`${T.actions.pin}: ${slot.label}`}
                      onClick={() => setPinning({ slot })}
                    >
                      {T.actions.pin}
                    </Button>
                  </div>
                </section>
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog open={pinning !== null} wide title={T.form.title} onClose={() => setPinning(null)}>
        {pinning && (
          <PinForm
            slot={pinning.slot}
            replaceId={pinning.replaceId}
            api={api}
            nowIso={nowIso}
            onCancel={() => setPinning(null)}
            onDone={(r) => {
              setPinning(null);
              done({ ...r, message: T.success.pinned });
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={removing !== null}
        title={T.confirmRemove.title}
        onClose={() => setRemoving(null)}
        actions={
          removing && (
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                size="md"
                variant="primary"
                disabled={busy || typed.trim().toUpperCase() !== T.confirmRemove.word}
                onClick={() => remove(removing.item)}
              >
                {T.actions.confirm}
              </Button>
              <Button size="md" variant="outline" onClick={() => setRemoving(null)}>
                {T.actions.cancel}
              </Button>
            </div>
          )
        }
      >
        {removing && (
          <div className="flex flex-col gap-4 text-left">
            <p>
              {removing.item.endsAt
                ? T.confirmRemove.text(
                    removing.item.title,
                    hoursLeft(removing.item.endsAt, now) ?? 0,
                  )
                : T.confirmRemove.textOpen(removing.item.title)}
            </p>
            <TextField
              id={`${uid}-typed`}
              label={T.confirmRemove.label}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
