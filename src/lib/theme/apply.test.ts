import { describe, expect, it, vi } from "vitest";
import { applyTheme, THEME_SWITCHING_ATTR } from "./apply";

describe("applyTheme", () => {
  it("aplica o tema com as transições desligadas e religa no quadro seguinte", () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => frames.push(cb));
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.hasAttribute(THEME_SWITCHING_ATTR)).toBe(true);
    while (frames.length) frames.shift()!(0);
    expect(root.hasAttribute(THEME_SWITCHING_ATTR)).toBe(false);
    raf.mockRestore();
  });
});
