/**
 * O jsdom não implementa `showModal()` nem `close()` de `<dialog>`; o navegador implementa (e2e
 * cobre o modal de verdade). Este stub marca `open` e registra se `close()` foi chamado com o
 * elemento ainda no documento (o diálogo precisa fechar antes de desmontar).
 */
export function stubDialog() {
  const calls = { showModal: 0, closeWhileConnected: 0, closeDetached: 0 };
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    calls.showModal += 1;
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (this.isConnected) calls.closeWhileConnected += 1;
    else calls.closeDetached += 1;
    this.removeAttribute("open");
  };
  return calls;
}
