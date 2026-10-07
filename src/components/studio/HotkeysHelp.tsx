"use client";

import { Fragment, useState } from "react";
import { HOTKEYS_TEXT as T } from "@/content/pt-BR/hotkeys";
import { useHotkeyHelp, useHotkeys, type HotkeyHelpEntry } from "@/lib/studio/use-hotkeys";
import { Dialog } from "../ui/Dialog";

const SELF: HotkeyHelpEntry = { keys: ["?"], label: T.help };

/**
 * Ajuda dos atalhos de teclado (item 53): `?` abre um `Dialog` com os atalhos que as telas
 * montadas registraram (`useHotkeys(…, { help })`). Montada uma vez na casca do Estúdio.
 * Esc ou "Fechar" fecham e o foco volta ao elemento que estava ativo.
 */
export function HotkeysHelp() {
  const [open, setOpen] = useState(false);
  const entries = useHotkeyHelp();
  useHotkeys({ "?": () => setOpen(true) });

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title={T.title}>
      <div className="flex flex-col gap-4 text-left">
        <p>{T.intro}</p>
        <dl className="flex flex-col gap-2">
          {[...entries, SELF].map((h) => (
            <div key={`${h.keys.join("|")}-${h.label}`} className="flex items-baseline gap-3">
              <dt className="flex shrink-0 flex-wrap items-baseline gap-1 text-strong">
                {h.keys.map((k, i) => (
                  <Fragment key={k}>
                    {i > 0 && <span className="type-meta text-meta">{T.or}</span>}
                    <kbd className="rounded-xs border border-line-control bg-section px-1.5 py-0.5 text-14 font-semibold">
                      {k}
                    </kbd>
                  </Fragment>
                ))}
              </dt>
              <dd>{h.label}</dd>
            </div>
          ))}
        </dl>
        {entries.length === 0 && <p>{T.empty}</p>}
      </div>
    </Dialog>
  );
}
