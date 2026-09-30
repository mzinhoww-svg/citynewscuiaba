import { render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { describe, expect, it } from "vitest";
import { safeDefault } from "./index";

describe("safeDefault (B-018)", () => {
  it("carrega o componente quando o chunk chega", async () => {
    const Comp = lazy(() => safeDefault(() => Promise.resolve(() => <p>carregou</p>)));
    render(
      <Suspense fallback={null}>
        <Comp />
      </Suspense>,
    );
    expect(await screen.findByText("carregou")).toBeInTheDocument();
  });

  it("chunk que falha não lança: o pedaço some e o resto da página fica", async () => {
    const Comp = lazy(() =>
      safeDefault<{ x?: number }>(() => Promise.reject(new Error("ChunkLoadError"))),
    );
    render(
      <div>
        <p>resto da página</p>
        <Suspense fallback={null}>
          <Comp />
        </Suspense>
      </div>,
    );
    expect(await screen.findByText("resto da página")).toBeInTheDocument();
    // Dá tempo de a promessa rejeitada virar o componente vazio sem erro.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("resto da página")).toBeInTheDocument();
  });
});
