import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeepFocusInView } from "./KeepFocusInView";

describe("KeepFocusInView", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("devolve à vista o item que tinha o foco", () => {
    const link = document.createElement("a");
    link.href = "/sobre";
    document.body.append(link);
    link.focus();
    const spy = vi.fn();
    link.scrollIntoView = spy;
    render(<KeepFocusInView />);
    expect(spy).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("não faz nada sem foco em elemento", () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<KeepFocusInView />);
    expect(spy).not.toHaveBeenCalled();
  });
});
