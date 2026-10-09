// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";
import type { EditionEvent } from "./agenda-edition";
import {
  runAgendaEdition,
  type EditionRunDeps,
  type EditionWrite,
  type StoredEdition,
} from "./run-edition";
import { noProviderSender, type EmailSender } from "./sender";

const NOW = new Date("2026-10-08T15:45:00Z"); // quinta, 11h45 em Cuiabá
const SECRET = "segredo-de-teste-da-newsletter-32-caracteres";

const ev = (i: number, over: Partial<EditionEvent> = {}): EditionEvent => ({
  slug: `evento-${i}`,
  title: `Evento ${i}`,
  startsAt: `2026-10-10T${String(12 + i).padStart(2, "0")}:00:00Z`,
  endsAt: null,
  venue: "Teatro Fictício",
  neighborhood: null,
  priceCents: 0,
  isFree: true,
  priceUnknown: false,
  origin: "organizer",
  sourceName: "Casa Fictícia",
  confirmedByName: null,
  confirmed: true,
  confirmedAt: "2026-10-01T00:00:00Z",
  ...over,
});

function deps(over: Partial<EditionRunDeps> = {}, start: StoredEdition | null = null) {
  let stored: (StoredEdition & { row?: EditionWrite; sentAt?: string }) | null = start;
  const d = {
    now: NOW,
    siteUrl: "https://citynews.example",
    secret: SECRET,
    sender: noProviderSender,
    loadEvents: vi.fn(async () => [ev(1), ev(2), ev(3)]),
    find: vi.fn(async () => (stored ? { ...stored } : null)),
    save: vi.fn(async (row: EditionWrite) => {
      if (stored?.status === "sent") return null;
      stored = { id: stored?.id ?? "ed-1", status: row.status, publishedAt: row.publishedAt, row };
      return { id: stored.id, status: stored.status, publishedAt: stored.publishedAt };
    }),
    setStatus: vi.fn(async (_id: string, status: "aguardando_provedor" | "sent", at: string) => {
      if (stored) stored = { ...stored, status, ...(status === "sent" ? { sentAt: at } : {}) };
    }),
    recipients: vi.fn(async () => ["ana@exemplo.example", "bia@exemplo.example"]),
    audit: vi.fn(async () => {}),
    revalidate: vi.fn(async () => {}),
    ...over,
  };
  return { d, stored: () => stored };
}

describe("runAgendaEdition", () => {
  it("menos de 3 eventos: rascunho, nada publicado nem enviado", async () => {
    const send = vi.fn(noProviderSender.send);
    const { d, stored } = deps({
      loadEvents: vi.fn(async () => [ev(1), ev(2, { withdrawnAt: "2026-10-05T00:00:00Z" })]),
      sender: { name: "x", send },
    });
    const r = await runAgendaEdition(d);
    expect(r).toMatchObject({ status: "draft", reason: "few_events", items: 1 });
    expect(stored()?.status).toBe("draft");
    expect(stored()?.row?.publishedAt).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledWith(
      "newsletter:agenda-fds:2026-10-09",
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("sem provedor: publica na web e fica aguardando_provedor", async () => {
    const { d, stored } = deps();
    const r = await runAgendaEdition(d);
    expect(r).toMatchObject({
      status: "aguardando_provedor",
      editionDate: "2026-10-09",
      items: 3,
      recipients: 2,
    });
    expect(stored()?.status).toBe("aguardando_provedor");
    expect(stored()?.row?.publishedAt).toBe(NOW.toISOString());
    expect(stored()?.row?.html).toContain("{{unsubscribe_url}}");
    expect(d.loadEvents).toHaveBeenCalledWith(
      expect.objectContaining({ editionDate: "2026-10-09" }),
    );
    expect(d.revalidate).toHaveBeenCalled();
  });

  it("com provedor: sent; segunda rodada não reescreve nem reenvia", async () => {
    const send = vi.fn<EmailSender["send"]>(async (_e, list) =>
      ok({ status: "sent" as const, count: list.length }),
    );
    const { d, stored } = deps({ sender: { name: "fake", send } });
    expect((await runAgendaEdition(d)).status).toBe("sent");
    expect(stored()?.status).toBe("sent");
    const again = await runAgendaEdition(d);
    expect(again).toMatchObject({ status: "sent", skipped: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(d.save).toHaveBeenCalledTimes(1);
  });

  it("re-rodar a mesma semana atualiza a edição e mantém a data de publicação", async () => {
    const { d, stored } = deps(
      {},
      {
        id: "ed-1",
        status: "aguardando_provedor",
        publishedAt: "2026-10-08T15:45:00.000Z",
      },
    );
    const later = { ...d, now: new Date("2026-10-09T12:00:00Z") };
    const r = await runAgendaEdition(later);
    expect(r.status).toBe("aguardando_provedor");
    expect(stored()?.id).toBe("ed-1");
    expect(stored()?.row?.publishedAt).toBe("2026-10-08T15:45:00.000Z");
  });

  it("erro do provedor: a página continua publicada e o motivo vai para a auditoria", async () => {
    const { d, stored } = deps({
      sender: {
        name: "fake",
        send: async () => err({ kind: "provider_error" as const, message: "cota excedida" }),
      },
    });
    const r = await runAgendaEdition(d);
    expect(r).toMatchObject({ status: "published", sendError: "cota excedida" });
    expect(stored()?.status).toBe("published");
    expect(d.setStatus).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "published", sendError: "cota excedida" }),
    );
  });

  it("sem segredo para o descadastro: não envia, fica publicada", async () => {
    const send = vi.fn(noProviderSender.send);
    const { d } = deps({ secret: null, sender: { name: "fake", send } });
    const r = await runAgendaEdition(d);
    expect(r).toMatchObject({ status: "published", sendError: "no_secret" });
    expect(send).not.toHaveBeenCalled();
  });
});
