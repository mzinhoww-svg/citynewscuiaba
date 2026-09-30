import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PushBanners } from "./PushBanners";

const off = { on: false, by: null, at: null, reason: null };

describe("PushBanners", () => {
  it("nada a dizer: não renderiza", () => {
    const { container } = render(<PushBanners paused={off} pending={0} vapidMissing={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pausa com quem, quando e motivo; pendentes com link; VAPID só os nomes e só para quem configura", () => {
    render(
      <PushBanners
        paused={{
          on: true,
          by: { name: "Helena Costa" },
          at: "2026-09-29T17:32:00Z",
          reason: "incidente",
        }}
        pending={2}
        vapidMissing={["VAPID_PRIVATE_KEY"]}
        showVapid
      />,
    );
    expect(
      screen.getByText(/Envios pausados por Helena Costa às \d{2}:\d{2}: incidente/),
    ).toBeVisible();
    expect(screen.getByText("2 pedidos aguardam sua aprovação")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver a fila" })).toHaveAttribute(
      "href",
      "/estudio/admin/notificacoes/fila",
    );
    expect(
      screen.getByText("Push indisponível: configure VAPID_PRIVATE_KEY na Vercel."),
    ).toBeVisible();
  });

  it("sem push.settings a faixa técnica não aparece", () => {
    render(<PushBanners paused={off} pending={1} vapidMissing={["VAPID_SUBJECT"]} />);
    expect(screen.getByText("1 pedido aguarda sua aprovação")).toBeVisible();
    expect(screen.queryByText(/Push indisponível/)).toBeNull();
  });
});
