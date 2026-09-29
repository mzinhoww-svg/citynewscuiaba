import { conflictState, isConflict, type ActionState } from "./action-state";

describe("ActionState · código de conflito", () => {
  it("conflictState marca a falha com code=conflict e a mensagem", () => {
    const s = conflictState("Esta fonte foi alterada por Helena às 14:32. Recarregue para ver.");
    expect(s).toEqual({
      ok: false,
      code: "conflict",
      message: "Esta fonte foi alterada por Helena às 14:32. Recarregue para ver.",
    });
  });

  it("isConflict só é verdadeiro para a falha com code=conflict, nunca pelo texto", () => {
    expect(isConflict(conflictState("x"))).toBe(true);
    const byText: ActionState = { ok: false, message: "Recarregue para ver a versão atual." };
    expect(isConflict(byText)).toBe(false);
    expect(isConflict({ ok: true, message: "Alterações salvas" })).toBe(false);
    expect(isConflict(null)).toBe(false);
    expect(isConflict(undefined)).toBe(false);
  });
});
