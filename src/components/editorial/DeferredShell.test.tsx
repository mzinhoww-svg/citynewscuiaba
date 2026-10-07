import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("./AlertWatcher", () => ({ AlertWatcher: () => <p>vigia de alertas</p> }));
vi.mock("./PushSync", () => ({ PushSync: () => <p>sincronia do push</p> }));

import { NotificationWatchers } from "./DeferredShell";

function setPermission(p: NotificationPermission | null) {
  if (p === null) {
    // Navegador sem a API de notificações (o jsdom não tem).
    Reflect.deleteProperty(window, "Notification");
    return;
  }
  Object.defineProperty(window, "Notification", {
    value: { permission: p },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  pathname = "/";
  setPermission(null);
});

describe("NotificationWatchers (item 85: só o que vai rodar)", () => {
  it("sem permissão decidida não baixa nada", async () => {
    setPermission("default");
    const { container } = render(<NotificationWatchers />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("permissão negada: sincroniza o push, sem o vigia de alertas (não há como avisar)", async () => {
    setPermission("denied");
    render(<NotificationWatchers />);
    expect(await screen.findByText("sincronia do push")).toBeInTheDocument();
    expect(screen.queryByText("vigia de alertas")).toBeNull();
  });

  it("permissão concedida: vigia de alertas e sincronia do push", async () => {
    setPermission("granted");
    render(<NotificationWatchers />);
    expect(await screen.findByText("vigia de alertas")).toBeInTheDocument();
    expect(screen.getByText("sincronia do push")).toBeInTheDocument();
  });

  it("em /alertas sincroniza sempre, mesmo sem permissão decidida", async () => {
    setPermission("default");
    pathname = "/alertas";
    render(<NotificationWatchers />);
    expect(await screen.findByText("sincronia do push")).toBeInTheDocument();
    expect(screen.queryByText("vigia de alertas")).toBeNull();
  });
});
