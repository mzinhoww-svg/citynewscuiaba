import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_MODULES,
  enabledKeys,
  HOME_MODULE_KEYS,
  moveModule,
  normalizeModules,
} from "./modules";

describe("normalizeModules", () => {
  it("sem configuração devolve o layout de sempre", () => {
    expect(normalizeModules(null)).toEqual(DEFAULT_HOME_MODULES);
    expect(normalizeModules("x")).toEqual(DEFAULT_HOME_MODULES);
  });
  it("respeita a ordem e o desligado, descarta lixo e repetidos", () => {
    const out = normalizeModules([
      { key: "newsletter", enabled: false },
      { key: "topics" },
      { key: "topics", enabled: false },
      { key: "inventado", enabled: true },
      7,
    ]);
    expect(out.slice(0, 2)).toEqual([
      { key: "newsletter", enabled: false },
      { key: "topics", enabled: true },
    ]);
    expect(out).toHaveLength(HOME_MODULE_KEYS.length);
    expect(out.every((m) => HOME_MODULE_KEYS.includes(m.key))).toBe(true);
  });
  it("acrescenta ao fim, ligado, o módulo que a configuração não menciona", () => {
    const out = normalizeModules([{ key: "sources", enabled: true }]);
    expect(out[0]?.key).toBe("sources");
    expect(out.at(-1)?.enabled).toBe(true);
  });
});

describe("moveModule", () => {
  it("troca vizinhos e não sai dos limites", () => {
    expect(moveModule(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveModule(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveModule(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveModule(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("enabledKeys", () => {
  it("lista só os ligados", () => {
    expect(
      enabledKeys([
        { key: "topics", enabled: false },
        { key: "sources", enabled: true },
      ]),
    ).toEqual(["sources"]);
  });
});
