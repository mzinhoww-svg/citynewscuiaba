/**
 * Decodificação do corpo pelo charset declarado. Vários veículos de MT servem ISO-8859-1 (RSS e
 * HTML); ler sempre como UTF-8 corrompe acentos nos títulos. Ordem: `charset` do Content-Type,
 * `encoding` do prólogo XML, `<meta charset>`/`http-equiv` do HTML (primeiros 2 KiB); sem nada
 * (ou nome desconhecido) vale UTF-8. UTF-8 com BOM continua UTF-8.
 */
const HEAD_BYTES = 2048;

function labelFromContentType(contentType: string | null): string | null {
  const m = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType ?? "");
  return m ? m[1]! : null;
}

function labelFromHead(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, HEAD_BYTES));
  const xml = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w:.-]+)["']/i.exec(head);
  if (xml) return xml[1]!;
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(head);
  return meta ? meta[1]! : null;
}

function decoderFor(label: string | null): TextDecoder | null {
  if (!label) return null;
  try {
    return new TextDecoder(label.trim().toLowerCase());
  } catch {
    return null;
  }
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const decoder = decoderFor(labelFromContentType(contentType)) ?? decoderFor(labelFromHead(bytes));
  return (decoder ?? new TextDecoder()).decode(bytes);
}
