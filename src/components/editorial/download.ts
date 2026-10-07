/** Baixa um arquivo gerado no navegador (nada vai ao servidor). */
export function downloadJson(name: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revogar logo depois do clique cancela o download no Safari e no Firefox (gate P2, M8).
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
