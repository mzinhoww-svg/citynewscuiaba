import { round2 } from "./round";
it("arredonda meio para cima com epsilon", () => {
  expect(round2(0.645)).toBe(0.65);
  expect(round2(0.675)).toBe(0.68);
  expect(round2(1.005)).toBe(1.01);
});
