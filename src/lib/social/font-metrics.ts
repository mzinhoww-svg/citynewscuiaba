/**
 * Largura de texto pelas métricas da própria fonte TrueType (tabelas `head`, `hhea`, `hmtx` e
 * `cmap` formato 4). Serve para quebrar linhas e escolher o corpo do slide antes do satori, sem
 * chute de largura média. Ignora kerning (diferença de poucos pixels; o slide deixa folga).
 */
export interface FontMetrics {
  /** Largura em px de `text` no corpo `size`. */
  measure(text: string, size: number): number;
}

function table(view: DataView, tag: string): number {
  const n = view.getUint16(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    const name = String.fromCharCode(
      view.getUint8(rec),
      view.getUint8(rec + 1),
      view.getUint8(rec + 2),
      view.getUint8(rec + 3),
    );
    if (name === tag) return view.getUint32(rec + 8);
  }
  throw new Error(`fonte sem a tabela ${tag}`);
}

/** Lê as métricas de um arquivo .ttf. Lança se o arquivo não for TrueType com cmap Unicode BMP. */
export function parseFontMetrics(bytes: Uint8Array): FontMetrics {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const unitsPerEm = view.getUint16(table(view, "head") + 18);
  const hMetrics = view.getUint16(table(view, "hhea") + 34);
  const hmtx = table(view, "hmtx");
  const advance = (glyph: number) => view.getUint16(hmtx + 4 * Math.min(glyph, hMetrics - 1));

  const cmap = table(view, "cmap");
  let sub = -1;
  const count = view.getUint16(cmap + 2);
  for (let i = 0; i < count; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = cmap + view.getUint32(rec + 4);
    if (platform === 3 && encoding === 1 && view.getUint16(offset) === 4) sub = offset;
  }
  if (sub < 0) throw new Error("fonte sem cmap Unicode (3,1) formato 4");
  const segX2 = view.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;

  const glyphOf = (code: number): number => {
    if (code > 0xffff) return 0;
    for (let s = 0; s < segX2; s += 2) {
      if (code > view.getUint16(ends + s)) continue;
      const start = view.getUint16(starts + s);
      if (code < start) return 0;
      const delta = view.getInt16(deltas + s);
      const ro = view.getUint16(ranges + s);
      if (ro === 0) return (code + delta) & 0xffff;
      const g = view.getUint16(ranges + s + ro + 2 * (code - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };

  const cache = new Map<number, number>();
  const units = (code: number) => {
    let w = cache.get(code);
    if (w === undefined) {
      w = advance(glyphOf(code));
      cache.set(code, w);
    }
    return w;
  };
  return {
    measure(text, size) {
      let total = 0;
      for (const ch of text) total += units(ch.codePointAt(0) ?? 0);
      return (total / unitsPerEm) * size;
    },
  };
}
