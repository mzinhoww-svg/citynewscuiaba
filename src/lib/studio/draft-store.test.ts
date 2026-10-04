import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  draftKey,
  hasDraft,
  loadDraft,
  saveDraft,
  subscribeDrafts,
  type DraftData,
} from "./draft-store";

const data: DraftData = {
  title: "Título local",
  dek: "Linha fina local",
  body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
  sectionSlug: "cidade",
  topicId: null,
  tags: ["ônibus"],
  neighborhoods: ["cpa"],
  seoTitle: "",
  seoDescription: "",
  baseVersion: 3,
  savedAt: "2026-10-04T12:00:00.000Z",
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("draft-store (rascunho local do editor, item 5)", () => {
  it("usa a chave cn:draft:<id>", () => {
    expect(draftKey("a1")).toBe("cn:draft:a1");
    saveDraft("a1", data);
    expect(localStorage.getItem("cn:draft:a1")).not.toBeNull();
  });

  it("guarda, lê e apaga", () => {
    saveDraft("a1", data);
    expect(loadDraft("a1")).toEqual(data);
    expect(loadDraft("a2")).toBeNull();
    clearDraft("a1");
    expect(loadDraft("a1")).toBeNull();
  });

  it("conteúdo corrompido ou de outro formato vira null", () => {
    localStorage.setItem("cn:draft:a1", "{nao é json");
    expect(loadDraft("a1")).toBeNull();
    localStorage.setItem("cn:draft:a1", JSON.stringify({ title: 1 }));
    expect(loadDraft("a1")).toBeNull();
  });

  it("avisa inscritos ao guardar e apagar", () => {
    const listener = vi.fn();
    const off = subscribeDrafts(listener);
    saveDraft("a1", data);
    expect(hasDraft("a1")).toBe(true);
    clearDraft("a1");
    expect(hasDraft("a1")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    saveDraft("a1", data);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("armazenamento indisponível não lança", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => saveDraft("a1", data)).not.toThrow();
    expect(loadDraft("a1")).toBeNull();
    expect(() => clearDraft("a1")).not.toThrow();
  });
});
