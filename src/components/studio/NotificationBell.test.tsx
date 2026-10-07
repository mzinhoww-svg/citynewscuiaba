import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationsSnapshot, StudioNotification } from "@/lib/studio-notifications";
import { NotificationBell } from "./NotificationBell";

const n = (id: string, over: Partial<StudioNotification> = {}): StudioNotification => ({
  id,
  kind: "approval_pending",
  severity: "warn",
  title: `Título ${id}`,
  body: "",
  href: "/estudio/control/aprovacoes",
  objectRef: null,
  createdAt: "2026-10-03T12:00:00Z",
  readAt: null,
  ...over,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** `onRead` espelha no servidor falso o que o POST marcou (o sino busca de novo depois). */
function mockFetch(
  snap: () => NotificationsSnapshot | "error",
  onRead: (body: { ids?: string[]; all?: true }) => void = () => {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/ler")) {
        onRead(JSON.parse(String(init?.body)));
        return json({ marked: 1 });
      }
      const s = snap();
      return s === "error" ? json({ error: "x" }, 503) : json(s);
    }),
  );
  return calls;
}

beforeEach(() => vi.stubGlobal("matchMedia", undefined));
afterEach(() => vi.unstubAllGlobals());

describe("NotificationBell", () => {
  it("mostra o contador de não lidas no nome acessível e o selo", async () => {
    mockFetch(() => ({ items: [n("a"), n("b")], unread: 2 }));
    render(<NotificationBell />);
    expect(
      await screen.findByRole("button", { name: "Notificações, 2 não lidas" }, { timeout: 4000 }),
    ).toBeVisible();
    expect(screen.getByTestId("bell-count")).toHaveTextContent("2");
  });

  it("abre e fecha pelo botão, por Esc (devolvendo o foco) e pelo atalho Alt+N", async () => {
    mockFetch(() => ({ items: [n("a")], unread: 1 }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    const btn = await screen.findByRole("button", { name: /Notificações/ });
    await user.click(btn);
    expect(screen.getByRole("dialog", { name: "Central de notificações" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(btn).toHaveFocus();
    await user.keyboard("{Alt>}n{/Alt}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.keyboard("{Alt>}n{/Alt}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mostra quando cada notificação chegou: relativo até 24 h, data e hora depois", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    mockFetch(() => ({
      items: [
        n("nova", { title: "Nova", createdAt: twoHoursAgo }),
        n("velha", { title: "Velha", createdAt: "2026-09-28T13:12:00Z" }),
      ],
      unread: 2,
    }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    const panel = screen.getByRole("dialog", { name: "Central de notificações" });
    const nova = within(panel).getByText("há 2 h");
    expect(nova.tagName).toBe("TIME");
    expect(nova).toHaveAttribute("datetime", twoHoursAgo);
    expect(nova).toHaveAttribute("title");
    const velha = within(panel).getByText("28/09/2026, 9h12");
    expect(velha).toHaveAttribute("datetime", "2026-09-28T13:12:00Z");
  });

  it("agrupa por severidade e leva ao link de ação", async () => {
    mockFetch(() => ({
      items: [
        n("i", { severity: "info", title: "Info" }),
        n("u", { severity: "urgent", title: "Urgente", href: "/estudio/denuncias" }),
      ],
      unread: 2,
    }));
    const user = userEvent.setup();
    render(<NotificationBell pushHref="/estudio/admin/notificacoes" />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Urgentes", "Informativas"]);
    expect(screen.getByRole("link", { name: /Urgente/ })).toHaveAttribute(
      "href",
      "/estudio/denuncias",
    );
    expect(screen.getByRole("link", { name: "Ver push" })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes",
    );
    expect(screen.getByRole("link", { name: "Ver todas as notificações" })).toHaveAttribute(
      "href",
      "/estudio/notificacoes",
    );
  });

  it("sem ação de push não mostra o atalho Ver push", async () => {
    mockFetch(() => ({ items: [n("a")], unread: 1 }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    expect(screen.queryByRole("link", { name: "Ver push" })).toBeNull();
  });

  it("marca uma como lida (otimista, com POST) e atualiza o contador", async () => {
    let items = [n("a", { title: "Alfa" }), n("b")];
    const calls = mockFetch(
      () => ({ items, unread: items.filter((x) => !x.readAt).length }),
      (b) => {
        items = items.map((x) =>
          b.ids?.includes(x.id) ? { ...x, readAt: "2026-10-03T14:00:00Z" } : x,
        );
      },
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    await user.click(screen.getByRole("button", { name: "Marcar como lida: Alfa" }));
    expect(screen.getByTestId("bell-count")).toHaveTextContent("1");
    const post = calls.find((c) => c.url.endsWith("/ler"));
    expect(post?.init?.method).toBe("POST");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ ids: ["a"] });
  });

  it("marcar todas zera o contador", async () => {
    let items = [n("a"), n("b")];
    const calls = mockFetch(
      () => ({ items, unread: items.filter((x) => !x.readAt).length }),
      (b) => {
        if (b.all) items = items.map((x) => ({ ...x, readAt: "2026-10-03T14:00:00Z" }));
      },
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    await user.click(screen.getByRole("button", { name: "Marcar todas como lidas" }));
    expect(screen.queryByTestId("bell-count")).toBeNull();
    expect(JSON.parse(String(calls.find((c) => c.url.endsWith("/ler"))?.init?.body))).toEqual({
      all: true,
    });
  });

  it("filtro Só não lidas esconde as lidas e mostra estado vazio próprio", async () => {
    mockFetch(() => ({ items: [n("a", { readAt: "2026-10-03T13:00:00Z" })], unread: 0 }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    expect(screen.getByText("Título a")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Só não lidas" }));
    expect(screen.queryByText("Título a")).toBeNull();
    expect(screen.getByText("Nenhuma notificação não lida")).toBeVisible();
  });

  it("estado vazio quando não há nada", async () => {
    mockFetch(() => ({ items: [], unread: 0 }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    expect(await screen.findByText("Nada novo por aqui")).toBeVisible();
  });

  it("mostra carregando e depois erro com Tentar de novo, que recupera", async () => {
    let fail = true;
    mockFetch(() => (fail ? "error" : { items: [n("a")], unread: 1 }));
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(screen.getByRole("button", { name: /Notificações/ }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Não foi possível carregar as notificações")).toBeVisible();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Título a")).toBeVisible();
  });

  it("servidor que não responde vira erro no prazo, sem ficar carregando para sempre", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_r, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          ),
      ),
    );
    render(<NotificationBell pollMs={600_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });
    await act(async () => screen.getByRole("button", { name: /Notificações/ }).click());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as notificações",
    );
    vi.useRealTimers();
  });

  it("falha ao marcar volta ao estado anterior", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("/ler") ? json({ error: "x" }, 503) : json({ items: [n("a")], unread: 1 }),
      ),
    );
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Notificações/ }));
    await user.click(screen.getByRole("button", { name: /Marcar como lida/ }));
    await waitFor(() => expect(screen.getByTestId("bell-count")).toHaveTextContent("1"));
  });

  it("anuncia novas em região educada e pausa a busca em aba oculta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let items = [n("a")];
    const calls = mockFetch(() => ({ items, unread: items.length }));
    render(<NotificationBell pollMs={1000} />);
    await screen.findByRole("button", { name: "Notificações, 1 não lida" });
    items = [n("b"), n("a")];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    const live = screen.getByTestId("bell-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(live).toHaveTextContent("1 nova notificação"));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const before = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(calls.length).toBe(before);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    vi.useRealTimers();
  });
});
