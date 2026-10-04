/**
 * O jsdom não implementa `showModal()` nem `close()` de `<dialog>`; o navegador implementa (e2e
 * cobre o modal de verdade). Este stub marca `open` e registra se `close()` foi chamado com o
 * elemento ainda no documento (o diálogo precisa fechar antes de desmontar). Com `fireClose`,
 * dispara o evento `close` depois, numa tarefa à parte, como o navegador.
 */
export function stubDialog({ fireClose = false }: { fireClose?: boolean } = {}) {
  const calls = { showModal: 0, closeWhileConnected: 0, closeDetached: 0 };
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    calls.showModal += 1;
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (this.isConnected) calls.closeWhileConnected += 1;
    else calls.closeDetached += 1;
    this.removeAttribute("open");
    // Como o navegador: o evento `close` chega numa tarefa seguinte, não durante `close()`.
    if (fireClose) setTimeout(() => this.dispatchEvent(new Event("close")), 0);
  };
  return calls;
}
