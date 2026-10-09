// @vitest-environment node
import { describe, expect, it } from "vitest";
import { UNSUBSCRIBE_PLACEHOLDER } from "./email-html";
import {
  buildRecipients,
  noProviderSender,
  personalize,
  senderFromEnv,
  unsubscribeUrl,
} from "./sender";
import { verifyNewsletterToken } from "./token";

const SECRET = "segredo-de-teste-da-newsletter-32-caracteres";
const rendered = {
  subject: "Agenda do fim de semana · 9 a 11 de outubro",
  html: `<a href="${UNSUBSCRIBE_PLACEHOLDER}">Sair</a>`,
  text: `Sair: ${UNSUBSCRIBE_PLACEHOLDER}`,
};

describe("noProviderSender", () => {
  it("sem provedor: aguardando_provedor, sem lançar", async () => {
    const r = await noProviderSender.send(rendered, [
      { email: "ana@exemplo.example", unsubscribeUrl: "https://citynews.example/x" },
    ]);
    expect(r).toEqual({ ok: true, value: { status: "aguardando_provedor" } });
  });

  it("senderFromEnv devolve o sem provedor (B-005)", () => {
    expect(senderFromEnv().name).toBe("none");
  });
});

describe("destinatários e descadastro", () => {
  it("link de descadastro abre as preferências da lista agenda-fds com token assinado", () => {
    const url = unsubscribeUrl("Ana@Exemplo.example", "https://citynews.example/", SECRET);
    expect(url).toMatch(/^https:\/\/citynews\.example\/newsletter\/preferencias\?token=/);
    const token = decodeURIComponent(new URL(url!).searchParams.get("token")!);
    expect(verifyNewsletterToken(token, "newsletter", SECRET)).toEqual({
      ok: true,
      value: { email: "ana@exemplo.example", lists: ["agenda-fds"] },
    });
  });

  it("sem segredo não monta link (e sem link não há envio)", () => {
    expect(unsubscribeUrl("a@b.example", "https://x.example", null)).toBeNull();
    expect(buildRecipients(["a@b.example"], "https://x.example", null)).toEqual({
      ok: false,
      error: "no_secret",
    });
  });

  it("um destinatário por e-mail, cada um com o próprio link", () => {
    const r = buildRecipients(
      ["a@b.example", "A@B.example", "c@d.example"],
      "https://x.example",
      SECRET,
    );
    expect(r.ok && r.value.map((x) => x.email)).toEqual(["a@b.example", "c@d.example"]);
  });

  it("personalize troca o marcador no HTML (escapado) e no texto", () => {
    const p = personalize(rendered, "https://x.example/p?token=a&b");
    expect(p.html).toBe('<a href="https://x.example/p?token=a&amp;b">Sair</a>');
    expect(p.text).toBe("Sair: https://x.example/p?token=a&b");
  });
});
