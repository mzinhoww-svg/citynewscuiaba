import { StudioLoading } from "@/components";
import { MONITOR_TEXT } from "@/content/pt-BR/control-monitor";

export default function Loading() {
  return <StudioLoading label={MONITOR_TEXT.run.loading} />;
}
