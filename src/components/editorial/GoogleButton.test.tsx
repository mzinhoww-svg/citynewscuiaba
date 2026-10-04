import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as ACCOUNT from "@/content/pt-BR/account";
import type { EmailLinkState, SignInState, SignUpState } from "@/lib/auth/form-state";
import { AccountShell } from "./AccountShell";
import { GoogleButton } from "./GoogleButton";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";

const google = vi.fn(async () => {});
const signIn = vi.fn(async (): Promise<SignInState> => ({ status: "idle" }));
const magicLink = vi.fn(async (): Promise<EmailLinkState> => ({ status: "idle" }));
const signUp = vi.fn(async (): Promise<SignUpState> => ({ status: "idle" }));

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function firstFocusable(container: HTMLElement) {
  return container.querySelector<HTMLElement>(FOCUSABLE);
}

/** Todo texto exportado por account.ts (inclui funções de texto chamadas com valor de exemplo). */
function allAccountText(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (typeof v === "function") {
      const r = (v as (...a: unknown[]) => unknown)("x", 1);
      if (typeof r === "string") out.push(r);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(ACCOUNT);
  return out;
}

describe("GoogleButton (UI-T12)", () => {
  it("é um botão branco de 56 px com o G oficial e o nome acessível certo", () => {
    const { container } = render(<GoogleButton action={google} next="/agenda" />);
    const button = screen.getByRole("button", { name: "Continuar com o Google" });
    expect(button.className).toMatch(/\bbg-branco\b/);
    expect(button.className).toMatch(/\bmin-h-14\b/);
    expect(button.className).toMatch(/\bw-full\b/);
    expect(button.className).toMatch(/\bborder-line-control\b/);
    expect(button.className).toMatch(/\bshadow-sm\b/);
    const logo = button.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("src", "/brand/google-g.svg");
    expect(logo).toHaveAttribute("alt", "");
    expect(container.querySelector('input[type="hidden"][name="next"]')).toHaveValue("/agenda");
    expect(screen.getByText("Usamos seu nome e e-mail para criar a conta.")).toBeInTheDocument();
  });

  it("aceita outro texto", () => {
    render(<GoogleButton action={google} next="/" label="Outro texto" />);
    expect(screen.getByRole("button", { name: "Outro texto" })).toBeInTheDocument();
  });
});

describe("SignInForm com o Google em destaque (UI-T12)", () => {
  it("o Google é o primeiro controle focável, antes do e-mail e da senha", () => {
    const { container } = render(
      <SignInForm signIn={signIn} magicLink={magicLink} google={google} next="/" />,
    );
    const g = screen.getByRole("button", { name: "Continuar com o Google" });
    expect(firstFocusable(container)).toBe(g);
    const email = screen.getByLabelText("E-mail", { exact: true });
    expect(g.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("ou use seu e-mail")).toBeInTheDocument();
  });

  it("ordem: Google, divisor, e-mail, senha, Entrar e Entrar sem senha", () => {
    const { container } = render(
      <SignInForm signIn={signIn} magicLink={magicLink} google={google} next="/" />,
    );
    const order = [
      screen.getByRole("button", { name: "Continuar com o Google" }),
      screen.getByText("ou use seu e-mail"),
      screen.getByLabelText("E-mail", { exact: true }),
      screen.getByLabelText("Senha", { exact: true }),
      screen.getByRole("button", { name: "Entrar" }),
      screen.getByRole("button", { name: "Entrar sem senha" }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(container.textContent).toContain("Esqueci a senha");
  });

  it("sem Google: sem botão, sem divisor e sem frase de indisponível", () => {
    const { container } = render(
      <SignInForm signIn={signIn} magicLink={magicLink} google={null} next="/" />,
    );
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    expect(screen.queryByText("ou use seu e-mail")).toBeNull();
    expect(container.textContent).not.toMatch(/não está disponível|indisponível/i);
    expect(firstFocusable(container)).toBe(screen.getByLabelText("E-mail", { exact: true }));
  });
});

describe("SignUpForm com o Google em destaque (UI-T12)", () => {
  it("o Google é o primeiro controle focável, com o mesmo texto do login", () => {
    const { container } = render(<SignUpForm action={signUp} google={google} next="/" />);
    const g = screen.getByRole("button", { name: "Continuar com o Google" });
    expect(firstFocusable(container)).toBe(g);
    expect(screen.getByText("ou use seu e-mail")).toBeInTheDocument();
    expect(screen.getByText("Usamos seu nome e e-mail para criar a conta.")).toBeInTheDocument();
  });

  it("sem Google: sem botão nem divisor", () => {
    const { container } = render(<SignUpForm action={signUp} google={null} next="/" />);
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    expect(screen.queryByText("ou use seu e-mail")).toBeNull();
    expect(container.textContent).not.toMatch(/não está disponível|indisponível/i);
  });
});

describe("AccountShell com benefícios (UI-T12)", () => {
  it("mostra os 3 benefícios e Continuar sem entrar como botão de contorno", () => {
    render(
      <AccountShell title="Entrar na conta" benefits skipHref="/agenda">
        <p>form</p>
      </AccountShell>,
    );
    const list = screen.getByRole("list", { name: /conta/i });
    const items = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual([
      "Salvos em todos os aparelhos",
      "Alertas do seu bairro",
      "Fontes que você segue",
    ]);
    const skip = screen.getByRole("link", { name: "Continuar sem entrar" });
    expect(skip).toHaveAttribute("href", "/agenda");
    expect(skip.className).toMatch(/\bborder\b/);
  });

  it("sem a prop, as outras telas de conta não mudam", () => {
    render(
      <AccountShell title="Recuperar senha">
        <p>form</p>
      </AccountShell>,
    );
    expect(screen.queryByText("Salvos em todos os aparelhos")).toBeNull();
    expect(screen.getByRole("link", { name: "Continuar sem login" })).toBeInTheDocument();
  });
});

describe("Textos de conta (UI-T12)", () => {
  it("nenhum texto de conta diz que algo não está disponível", () => {
    const texts = allAccountText();
    expect(texts.length).toBeGreaterThan(20);
    for (const t of texts) expect(t).not.toMatch(/não está disponível/i);
  });
});
