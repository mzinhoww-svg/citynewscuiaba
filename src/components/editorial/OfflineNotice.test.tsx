import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OfflineNotice } from "./OfflineNotice";

describe("OfflineNotice", () => {
  it("página servida do cache mostra o rótulo; online troca por Conexão de volta + Atualizar", async () => {
    const query = vi.fn().mockResolvedValue("2026-09-28T18:32:00Z");
    render(<OfflineNotice now={() => new Date("2026-09-28T20:00:00Z")} query={query} />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Salva às 14h32, pode estar desatualizada.",
    );
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/^\//));
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Conexão de volta."));
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeVisible();
  });

  it("online antes de a consulta ao cache responder termina em Conexão de volta", async () => {
    let resolve: (at: string | null) => void = () => {};
    const query = vi.fn().mockReturnValue(
      new Promise<string | null>((r) => {
        resolve = r;
      }),
    );
    render(<OfflineNotice now={() => new Date("2026-09-28T20:00:00Z")} query={query} />);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      resolve("2026-09-28T18:32:00Z");
      await Promise.resolve();
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Conexão de volta.");
  });

  it("é uma linha fina, sem a altura de um banner", async () => {
    const query = vi.fn().mockResolvedValue("2026-09-28T18:32:00Z");
    render(<OfflineNotice now={() => new Date("2026-09-28T20:00:00Z")} query={query} />);
    const bar = await screen.findByRole("status");
    expect(bar).toHaveClass("py-1.5");
    expect(bar).not.toHaveClass("py-3");
  });

  it("página da rede não mostra nada", async () => {
    const query = vi.fn().mockResolvedValue(null);
    render(<OfflineNotice query={query} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
