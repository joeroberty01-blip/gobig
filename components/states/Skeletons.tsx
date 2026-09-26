import { Skeleton } from "@/components/ui";

// Loading placeholders (Phase 14) shaped like the page that is coming, so nothing jumps when it
// arrives. Server components: no JavaScript needed to show them.

export function CardTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <Skeleton className="aspect-[16/10] rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
          <Skeleton className="size-24 shrink-0 sm:h-28 sm:w-32" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="mt-auto h-5 w-24 rounded-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
