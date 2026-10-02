import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnonProfile } from "@/lib/anon/types";
import { MigrateLocal } from "./MigrateLocal";

const AT = "2026-09-27T12:00:00Z";
const ANON = "0b8c6a1e-2f3d-4a5b-8c7d-9e0f1a2b3c4d";
const PROFILE: AnonProfile = {
  anonId: ANON,
  createdAt: AT,
  follows: [{ kind: "source", id: "mt-agora", at: AT }],
  saved: [{ ref: "article:1", at: AT, progress: 20 }],
  history: [{ ref: "article:9", at: AT, seconds: 40, scrollPct: 60 }],
  searches: ["consulta médica particular"],
  interests: [{ key: "Cidade", evidence: "3 leituras", weak: false }],
  hidden: [],
  collections: [],
  alerts: [
    {
      id: "al1",
      kind: "urgentes",
      target: "urgentes",
      label: "Urgentes",
      frequency: "immediate",
      channel: "email",
      status: "active",
      email: "pessoa@exemplo.com",
      at: AT,
    },
  ],
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/events/use-track", () => ({ useTrack: () => vi.fn() }));
vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: PROFILE, ready: true, degraded: false }),
}));

describe("MigrateLocal (C06, gate P2 I3)", () => {
  beforeEach(() => localStorage.clear());

  it("com o padrão, não envia id anônimo, histórico, buscas nem e-mail de alerta", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, summary: "ok" });
    render(<MigrateLocal action={action} next="/perfil" method="email" userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Levar selecionados" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const body = JSON.stringify(action.mock.calls[0]?.[0]);
    expect(body).not.toContain(ANON);
    expect(body).not.toContain("article:9");
    expect(body).not.toContain("consulta médica");
    expect(body).not.toContain("pessoa@exemplo.com");
    expect(body).toContain("mt-agora");
  });

  it("a caixa de histórico avisa que liga as leituras anônimas à conta", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, summary: "ok" });
    render(<MigrateLocal action={action} next="/perfil" method="email" userId="u1" />);
    const box = screen.getByRole("checkbox", { name: /Histórico de leitura/ });
    expect(box).toHaveAccessibleDescription(/identificador anônimo/);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Levar selecionados" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const body = JSON.stringify(action.mock.calls[0]?.[0]);
    expect(body).toContain(ANON);
    expect(body).toContain("article:9");
    expect(body).not.toContain("consulta médica");
  });
});
