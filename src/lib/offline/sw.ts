/**
 * Service worker (public/sw.js): leitura offline das 20 últimas salvas (P17) e toque em alerta
 * (P18). Registrado só quando o leitor salva, abre Favoritos ou cria alerta. Nunca lança.
 */
export const MAX_OFFLINE_SAVED = 20;

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Pede ao service worker para guardar as páginas das salvas mais recentes. */
export async function cacheSaved(paths: string[]): Promise<void> {
  const reg = await registerSw();
  reg?.active?.postMessage({ type: "cache-saved", paths: paths.slice(0, MAX_OFFLINE_SAVED) });
}

/** Mostra um aviso pelo service worker (abre a página ao tocar) ou, sem ele, pela API direta. */
export async function showNotification(
  title: string,
  opts: { body: string; href: string; tag: string },
): Promise<boolean> {
  try {
    // Sem permissão, o navegador recusa e o erro é engolido abaixo.
    if (typeof Notification === "undefined") return false;
    const reg = await registerSw();
    const options = {
      body: opts.body,
      tag: opts.tag,
      data: { href: opts.href },
      icon: "/icon.svg",
    };
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
