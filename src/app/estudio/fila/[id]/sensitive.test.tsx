import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioArticle } from "@/lib/db/queries/studio-article";
import { checklist } from "@/lib/studio/checklist";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn().mockResolvedValue({ userId: "u1", roles: ["editor"] }),
}));
vi.mock("../../actions", () => ({
  approveAction: vi.fn(),
  rejectItemAction: vi.fn(),
  reprocessAction: vi.fn(),
  requestChangesAction: vi.fn(),
}));
vi.mock("@/lib/db/queries/queue-next", () => ({ nextQueueItem: vi.fn().mockResolvedValue(null) }));
const getStudioArticle = vi.fn<(id: string) => Promise<StudioArticle | null>>();
vi.mock("@/lib/db/queries/studio-article", () => ({
  getStudioArticle: (id: string) => getStudioArticle(id),
}));

import ReviewPage from "./page";

const ID = "00000000-0000-4000-8000-000000000001";

function article(over: Partial<StudioArticle>): StudioArticle {
  return {
    id: ID,
    slug: "obra-na-avenida",
    kind: "normalized",
    status: "in_review",
    publishMode: null,
    title: "Obra na avenida",
    dek: "Trecho interditado",
    body: null,
    section: { slug: "cidade", name: "Cidade" },
    topic: null,
    tags: [],
    neighborhoods: [],
    seoTitle: null,
    seoDescription: null,
    fieldOrigins: {},
    confidence: "média",
    confidenceScore: 0.5,
    agentId: null,
    authorId: null,
    authorName: null,
    reviewReason: null,
    aiFallback: false,
    sensitive: false,
    urgent: false,
    aiSummary: null,
    updatedAt: "2026-10-04T12:00:00Z",
    publishedAt: null,
    scheduledFor: null,
    version: 1,
    versions: [],
    sources: [],
    images: [],
    suggestions: [],
    decisions: [],
    centralConflict: false,
    aiVersion: null,
    checklist: checklist({
      title: "Obra na avenida",
      dek: "Trecho interditado",
      sectionSlug: "cidade",
      tags: [],
      neighborhoods: [],
      requirePrimary: true,
      sources: [],
      images: [],
      seoTitle: null,
      seoDescription: null,
      openSuggestions: 0,
    }),
    ...over,
  };
}

const ALERT = "Tema sensível: confira a fonte citada e o tom antes de decidir.";

describe("/estudio/fila/[id] · tema sensível único (UX-W1-T10, item 19)", () => {
  it("item sensível em Cidade (fonte marcada) mostra o alerta, como na fila", async () => {
    getStudioArticle.mockResolvedValue(article({ sensitive: true }));
    render(await ReviewPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByText(ALERT)).toBeInTheDocument();
  });

  it("Segurança sem a marca da fila não mostra o alerta (só `sensitive` decide)", async () => {
    getStudioArticle.mockResolvedValue(
      article({ sensitive: false, section: { slug: "seguranca", name: "Segurança" } }),
    );
    render(await ReviewPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.queryByText(ALERT)).toBeNull();
  });
});
