import { err, ok, type Result } from "./result";

function parsePositive(n: number): Result<number, "negativo"> {
  return n >= 0 ? ok(n) : err("negativo");
}

it("ok e err formam um Result discriminado", () => {
  expect(parsePositive(2)).toEqual({ ok: true, value: 2 });
  const r = parsePositive(-1);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toBe("negativo");
});
