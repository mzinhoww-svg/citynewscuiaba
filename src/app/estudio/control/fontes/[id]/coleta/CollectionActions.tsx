"use client";

import { ActionMessage, Button, useFormAction } from "@/components";
import type { FormAction } from "@/components";
import { COLLECTION as T } from "@/content/pt-BR/sources-admin-detail";

export function CollectionActions({
  id,
  canCollect,
  testAction,
  collectAction,
  reanalyzeHref,
}: {
  id: string;
  canCollect: boolean;
  testAction: FormAction;
  collectAction: FormAction;
  reanalyzeHref: string;
}) {
  const test = useFormAction(testAction);
  const collect = useFormAction(collectAction);
  const send = (h: { submit: (f: FormData) => void }) => {
    const fd = new FormData();
    fd.set("id", id);
    h.submit(fd);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button size="md" variant="outline" disabled={test.pending} onClick={() => send(test)}>
          {test.pending ? T.testing : T.testConnection}
        </Button>
        {canCollect && (
          <Button
            size="md"
            icon="refresh-cw"
            disabled={collect.pending}
            onClick={() => send(collect)}
          >
            {T.collectNowLabel}
          </Button>
        )}
        <Button size="md" variant="text" href={reanalyzeHref}>
          {T.reanalyze}
        </Button>
      </div>
      <p className="type-meta text-meta">
        {T.testHint} {T.collectHint}
      </p>
      <ActionMessage state={test.state} />
      <ActionMessage state={collect.state} />
    </div>
  );
}
