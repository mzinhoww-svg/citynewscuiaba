import { render, screen } from "@testing-library/react";
import { ApprovalBanner, type ApprovalBannerProps } from "./ApprovalBanner";

const base: ApprovalBannerProps = {
  id: "a1",
  kind: "rules.activate",
  targetLabel: "Regras, versão 7",
  justification: "Serviços passam a publicar com 2 fontes",
  requesterName: "Diego Prado",
  requestedAt: "28/09/2026, 14h30",
  effect: "activate",
  stance: "decider",
  deciders: "Administração, Editor-chefe",
  actions: <button type="button">Aprovar</button>,
};

it("mostra o que muda, o alvo, quem pediu, a justificativa e as ações para quem decide", () => {
  render(<ApprovalBanner {...base} />);
  expect(screen.getByRole("article", { name: "Ativar regras de autonomia" })).toBeInTheDocument();
  expect(screen.getByText("Regras, versão 7")).toBeInTheDocument();
  expect(screen.getByText(/Diego Prado/)).toBeInTheDocument();
  expect(screen.getByText("Serviços passam a publicar com 2 fontes")).toBeInTheDocument();
  expect(screen.getByText(/entra em vigor na hora/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
});

it("quem pediu não vê as ações e lê que a aprovação precisa ser de outra pessoa", () => {
  render(<ApprovalBanner {...base} stance="requester" />);
  expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  expect(screen.getByText(/A aprovação precisa ser de outra pessoa/)).toBeInTheDocument();
});

it("quem só acompanha vê quem decide, sem ações", () => {
  render(<ApprovalBanner {...base} stance="observer" />);
  expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  expect(screen.getByText("Quem decide: Administração, Editor-chefe.")).toBeInTheDocument();
});
