import { decodeBody } from "./charset";

const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("decodeBody", () => {
  it("usa o charset do Content-Type", () =>
    expect(decodeBody(latin1("Cuiabá"), "application/xml; charset=iso8859-1")).toBe("Cuiabá"));
  it("usa o encoding do prólogo XML quando o cabeçalho não diz", () =>
    expect(decodeBody(latin1('<?xml version="1.0" encoding="ISO-8859-1"?><t>ação</t>'), null)).toBe(
      '<?xml version="1.0" encoding="ISO-8859-1"?><t>ação</t>',
    ));
  it("usa o meta charset do HTML", () =>
    expect(
      decodeBody(
        latin1(
          '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">é',
        ),
        "text/html",
      ),
    ).toContain("é"));
  it("sem declaração, UTF-8", () => expect(decodeBody(utf8("Várzea"), "text/html")).toBe("Várzea"));
  it("charset desconhecido cai em UTF-8", () =>
    expect(decodeBody(utf8("Várzea"), "text/html; charset=nao-existe")).toBe("Várzea"));
  it("Content-Type vence o prólogo", () =>
    expect(
      decodeBody(utf8('<?xml version="1.0" encoding="ISO-8859-1"?>ç'), "text/xml; charset=utf-8"),
    ).toContain("ç"));
});
