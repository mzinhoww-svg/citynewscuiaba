"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { Button } from "../ui/Button";
import { DateField } from "../ui/DateField";
import type { ActionReply } from "./QueueTable";

export interface LicenseActionsProps {
  license: string;
  expiredImages: number;
  renew: (i: { license: string; until: string }) => Promise<ActionReply>;
  blockExpired: (i: { license: string }) => Promise<ActionReply>;
}

/** Ações de uma licença (E11): renovar com nova vigência ou bloquear as imagens vencidas. */
export function LicenseActions({
  license,
  expiredImages,
  renew,
  blockExpired,
}: LicenseActionsProps) {
  const router = useRouter();
  const uid = useId();
  const [until, setUntil] = useState("");
  const [reply, setReply] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();
  const done = (r: ActionReply) => {
    setReply(r);
    if (r.ok) router.refresh();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <DateField
          id={`${uid}-ate`}
          name="ate"
          label={T.renewUntil}
          value={until}
          onChange={setUntil}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!until || pending}
          aria-label={`${T.renew}: ${license}`}
          onClick={() => start(async () => done(await renew({ license, until })))}
        >
          {T.renew}
        </Button>
        {expiredImages > 0 && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            aria-label={`${T.blockExpired}: ${license}`}
            onClick={() => start(async () => done(await blockExpired({ license })))}
          >
            {T.blockExpired}
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" className="type-meta">
        {reply && (
          <span className={reply.ok ? "text-service" : "text-danger"}>{reply.message}</span>
        )}
      </p>
    </div>
  );
}
