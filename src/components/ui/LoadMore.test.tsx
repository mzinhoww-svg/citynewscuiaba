import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadMore, loadMoreAnchor } from "./LoadMore";
import { FocusLoadMoreTarget } from "./LoadMoreFocus";

describe("LoadMore", () => {
  it("mostra a contagem real e um link comum (funciona sem JS)", () => {
    render(
      <LoadMore
        href="/estudio/fila?cursor=abc#mais-100"
        shown={100}
        total={130}
        label="Carregar mais"
      />,
    );
    expect(screen.getByText("Mostrando 100 de 130")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Carregar mais" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/estudio/fila?cursor=abc#mais-100");
  });

  it("sem próxima página não renderiza link, mas mantém a contagem", () => {
    render(<LoadMore href={null} shown={130} total={130} label="Carregar mais" />);
    expect(screen.getByText("Mostrando 130 de 130")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("âncora do primeiro item novo é estável", () => {
    expect(loadMoreAnchor(100)).toBe("mais-100");
  });
});

describe("FocusLoadMoreTarget", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    document.body.innerHTML = "";
  });

  it("leva o foco ao primeiro item novo indicado no hash (nunca fica no body)", () => {
    window.history.replaceState(null, "", "/estudio/fila?cursor=x#mais-100");
    const li = document.createElement("li");
    li.id = "mais-100";
    li.tabIndex = -1;
    document.body.appendChild(li);
    render(<FocusLoadMoreTarget />);
    expect(document.activeElement).toBe(li);
  });

  it("ignora hash que não é de carregar mais", () => {
    window.history.replaceState(null, "", "/agenda#topo");
    const el = document.createElement("div");
    el.id = "topo";
    el.tabIndex = -1;
    document.body.appendChild(el);
    render(<FocusLoadMoreTarget />);
    expect(document.activeElement).not.toBe(el);
  });
});
