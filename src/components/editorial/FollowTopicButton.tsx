"use client";

import { FOLLOW_TOPIC_TEXT } from "@/content/pt-BR/favorites";
import { ANON_TEXT } from "@/content/pt-BR/privacy-anon";
import { requestLoginInvite } from "@/lib/anon/invite";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { requestNotificationInvite } from "@/lib/push/invite";
import { NotificationInviteSlot } from "./NotificationInviteSlot";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export interface FollowTopicButtonProps {
  slug: string;
  title: string;
}

/** Seguir assunto (P05, P17) sem login: fica em Favoritos › Temas e assuntos e vira alvo de alerta. */
export function FollowTopicButton({ slug, title }: FollowTopicButtonProps) {
  const { profile, ready, act } = useAnonProfile();
  const toast = useToast();
  const followed = profile?.follows.some((f) => f.kind === "topic" && f.id === slug) ?? false;
  return (
    <span data-ready={ready ? "true" : undefined} className="flex flex-col gap-2">
      <span className="inline-flex">
        <Button
          variant={followed ? "outline-strong" : "outline"}
          size="md"
          icon={followed ? "check" : "plus"}
          pressed={followed}
          aria-label={FOLLOW_TOPIC_TEXT.label(title)}
          onClick={() =>
            void act((s) =>
              followed ? s.unfollow("topic", slug) : s.follow("topic", slug, title),
            ).then((r) => {
              if (!r.ok) return toast.show({ message: ANON_TEXT.actFailed, tone: "error" });
              if (!followed) {
                requestNotificationInvite("follow");
                requestLoginInvite("topic");
              }
            })
          }
        >
          {followed ? FOLLOW_TOPIC_TEXT.following : FOLLOW_TOPIC_TEXT.follow}
        </Button>
      </span>
      <NotificationInviteSlot trigger="follow" />
    </span>
  );
}
