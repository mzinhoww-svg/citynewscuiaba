"use client";

import { useEffect } from "react";
import { requestLoginInvite } from "@/lib/anon/invite";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { useTrack } from "@/lib/events/use-track";
import { requestNotificationInvite } from "@/lib/push/invite";
import { NotificationInviteSlot } from "./NotificationInviteSlot";
import { FollowButton } from "./SourceCard";

export interface SourceFollowProps {
  slug: string;
  name: string;
}

/**
 * Seguir na página da fonte (P15): guardado no perfil local, sem login. Registra
 * `source_viewed` (com consentimento) e avisa o ponto de extensão do convite (P2-T10).
 * `data-ready` marca que o perfil local já foi lido.
 */
export function SourceFollow({ slug, name }: SourceFollowProps) {
  const { profile, ready, act } = useAnonProfile();
  const send = useTrack();
  const followed = profile?.follows.some((f) => f.kind === "source" && f.id === slug) ?? false;

  useEffect(() => {
    void send("source_viewed", { surface: "fonte" }, { sourceId: slug });
  }, [send, slug]);

  return (
    <span data-ready={ready ? "true" : undefined} className="flex flex-col gap-2">
      <span className="inline-flex">
        <FollowButton
          size="md"
          source={{ slug, name, followed }}
          onFollow={(s, next) =>
            void act((store) =>
              next ? store.follow("source", s) : store.unfollow("source", s),
            ).then(() => {
              if (next) {
                void send(
                  "source_followed",
                  { surface: "fonte", fromRecommendation: false },
                  { sourceId: s },
                );
                requestNotificationInvite("follow");
                requestLoginInvite("follow");
              } else void send("source_unfollowed", { surface: "fonte" }, { sourceId: s });
            })
          }
        />
      </span>
      <NotificationInviteSlot trigger="follow" />
    </span>
  );
}
