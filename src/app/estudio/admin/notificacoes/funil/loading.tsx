import { Skeleton } from "@/components";

/** Esqueleto (docs/screens.md, estado carregando): `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="h-7 w-48 bg-section" />
      <div className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
