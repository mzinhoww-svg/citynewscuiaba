import type { RoleGrant } from "@/lib/auth/permissions";
import { canPreviewMedia, type PreviewTarget } from "./preview-access";

const me = "u-1";
const role = (r: RoleGrant["role"], sections: string[] = []): RoleGrant[] => [
  { role: r, sections },
];

const inSports = (status: PreviewTarget["status"], authorId: string | null = null) => ({
  status,
  articles: [{ section: "esportes", authorId }],
});

describe("canPreviewMedia (C3-02)", () => {
  it.each(["leitura", "analista", "moderador", "operador_ia", "admin"] as const)(
    "%s não vê prévia de imagem",
    (r) => {
      expect(canPreviewMedia(role(r), me, inSports("approved"))).toBe(false);
      expect(canPreviewMedia(role(r), me, inSports("pending"))).toBe(false);
    },
  );

  it("editor-chefe e revisor veem qualquer imagem, inclusive bloqueada e sem matéria", () => {
    for (const r of ["editor_chefe", "revisor"] as const) {
      expect(canPreviewMedia(role(r), me, inSports("blocked"))).toBe(true);
      expect(canPreviewMedia(role(r), me, { status: "pending", articles: [] })).toBe(true);
    }
  });

  it("editor só vê imagem da própria editoria", () => {
    expect(canPreviewMedia(role("editor", ["esportes"]), me, inSports("pending"))).toBe(true);
    expect(canPreviewMedia(role("editor", ["esportes"]), me, inSports("blocked"))).toBe(true);
    expect(canPreviewMedia(role("editor", ["cultura"]), me, inSports("pending"))).toBe(false);
    expect(
      canPreviewMedia(role("editor", ["cultura"]), me, { status: "pending", articles: [] }),
    ).toBe(false);
  });

  it("jornalista vê imagem das próprias matérias, nunca bloqueada", () => {
    expect(canPreviewMedia(role("jornalista"), me, inSports("pending", me))).toBe(true);
    expect(canPreviewMedia(role("jornalista"), me, inSports("approved", "u-2"))).toBe(false);
    expect(canPreviewMedia(role("jornalista"), me, inSports("blocked", me))).toBe(false);
  });

  it("sem papel, nada", () => {
    expect(canPreviewMedia([], me, inSports("approved"))).toBe(false);
  });
});
