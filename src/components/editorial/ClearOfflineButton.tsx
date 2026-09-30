"use client";

import { useState } from "react";
import { PRIVACY_OFFLINE_TEXT } from "@/content/pt-BR/privacy";
import { clearOffline } from "@/lib/offline/sw";
import { Button } from "../ui/Button";

/** "Limpar leitura offline" (spec 2026-09-28 §8.3): apaga cn-lidas e cn-paginas; salvas ficam. */
export function ClearOfflineButton() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void clearOffline()
              .then((ok) =>
                setStatus(ok ? PRIVACY_OFFLINE_TEXT.cleared : PRIVACY_OFFLINE_TEXT.nothing),
              )
              .finally(() => setBusy(false));
          }}
        >
          {PRIVACY_OFFLINE_TEXT.clear}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="type-meta text-meta">
        {status}
      </p>
    </div>
  );
}
