import { describe, expect, it, vi } from "vitest";
import { createEmailAlert, type EmailAlertDeps } from "./email";

function deps(over: Partial<EmailAlertDeps> = {}): EmailAlertDeps {
  return {
    allow: vi.fn(async () => ({ ok: true as const, value: true })),
    save: vi.fn(async () => ({
      ok: true as const,
      value: { id: "c0000000-0000-4000-8000-000000000001" },
    })),
    queue: vi.fn(async () => ({ ok: true as const, value: undefined })),
    link: vi.fn(() => "https://citynews.test/alertas/confirmar?token=t"),
    ...over,
  };
}
const valid = {
  email: " Ana@Exemplo.com ",
  kind: "bairro",
  target: "cpa",
  label: "CPA",
  frequency: "daily",
};

describe("alerta por e-mail sem conta (P18)", () => {
  it("grava inativo e põe na fila o e-mail de confirmação", async () => {
    const d = deps();
    const r = await createEmailAlert(valid, d);
    expect(r).toEqual({ status: "pending", email: "ana@exemplo.com" });
    expect(d.save).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
      targetKind: "bairro",
      targetId: "cpa",
      frequency: "daily",
    });
    expect(d.queue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "alert_confirm", to: "ana@exemplo.com" }),
    );
  });

  it("e-mail, tipo, alvo ou frequência inválidos não gravam", async () => {
    for (const bad of [
      { ...valid, email: "x" },
      { ...valid, kind: "saude" },
      { ...valid, target: "" },
      { ...valid, frequency: "hourly" },
      null,
    ]) {
      const d = deps();
      expect((await createEmailAlert(bad, d)).status).toBe("invalid");
      expect(d.save).not.toHaveBeenCalled();
    }
  });

  it("limite e banco fora", async () => {
    expect(
      (
        await createEmailAlert(
          valid,
          deps({ allow: vi.fn(async () => ({ ok: true as const, value: false })) }),
        )
      ).status,
    ).toBe("rate_limited");
    expect(
      (
        await createEmailAlert(
          valid,
          deps({
            save: vi.fn(async () => ({
              ok: false as const,
              error: { kind: "unavailable" as const },
            })),
          }),
        )
      ).status,
    ).toBe("error");
  });
});
