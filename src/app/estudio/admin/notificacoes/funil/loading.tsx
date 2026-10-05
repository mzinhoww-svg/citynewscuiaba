import { Skeleton } from "@/components";

/** Esqueleto (docs/screens.md, estado carregando): `aria-busy` no contêiner. */
export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton shape="block" className="h-7 w-48" />
      <Skeleton shape="card" rows={6} lines={2} />
    </div>
  );
}
