import { describe, expect, it } from "vitest";
import { afterKey, decodeCursor, encodeCursor, throughKey, type KeySpec } from "./cursor";

const TS = "2026-10-04T10:00:00.123456+00:00";
const ID = "c1000000-0000-4000-8000-000000000001";

const QUEUE_KEYS: KeySpec[] = [
  { col: "due_at", type: "ts", asc: true, nullable: true },
  { col: "updated_at", type: "ts", asc: false },
  { col: "id", type: "uuid", asc: true },
];

describe("cursor opaco", () => {
  it("ida e volta preserva os valores, inclusive null", () => {
    const c = encodeCursor([null, TS, ID]);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c, QUEUE_KEYS)).toEqual([null, TS, ID]);
  });

  it("recusa cursor adulterado, com tipo errado ou valor que não é data/uuid", () => {
    expect(decodeCursor("lixo", QUEUE_KEYS)).toBeNull();
    expect(decodeCursor(encodeCursor([TS, ID]), QUEUE_KEYS)).toBeNull();
    expect(decodeCursor(encodeCursor([null, "x),id.eq.1", ID]), QUEUE_KEYS)).toBeNull();
    expect(decodeCursor(encodeCursor([TS, TS, "não-uuid"]), QUEUE_KEYS)).toBeNull();
    expect(decodeCursor(encodeCursor([TS, null, ID]), QUEUE_KEYS)).toBeNull();
  });
});

describe("filtro keyset (PostgREST)", () => {
  it("depois de um prazo definido: prazo maior, empate desempatado por data e id, ou sem prazo", () => {
    expect(afterKey(QUEUE_KEYS, [TS, TS, ID])).toBe(
      `due_at.gt."${TS}",due_at.is.null,` +
        `and(due_at.eq."${TS}",updated_at.lt."${TS}"),` +
        `and(due_at.eq."${TS}",updated_at.eq."${TS}",id.gt."${ID}")`,
    );
  });

  it("depois de um item sem prazo: só itens sem prazo, mais antigos ou de id maior", () => {
    expect(afterKey(QUEUE_KEYS, [null, TS, ID])).toBe(
      `and(due_at.is.null,updated_at.lt."${TS}"),` +
        `and(due_at.is.null,updated_at.eq."${TS}",id.gt."${ID}")`,
    );
  });

  it("até o cursor (inclusive) é o complemento de depois", () => {
    expect(throughKey(QUEUE_KEYS, [null, TS, ID])).toBe(
      `due_at.not.is.null,and(due_at.is.null,updated_at.gt."${TS}"),` +
        `and(due_at.is.null,updated_at.eq."${TS}",id.lt."${ID}"),` +
        `and(due_at.is.null,updated_at.eq."${TS}",id.eq."${ID}")`,
    );
  });
});
