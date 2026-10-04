"use client";

import { useEffect } from "react";

/**
 * Depois de "Carregar mais" (página aberta com `#mais-<n>`), leva o foco ao primeiro item novo
 * para quem navega por teclado ou leitor de tela: o foco nunca fica no `body`.
 */
export function FocusLoadMoreTarget() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!/^mais-\d+$/.test(id)) return;
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.focus();
  }, []);
  return null;
}
