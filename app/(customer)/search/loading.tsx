import { ResultRowsSkeleton } from "@/components/states/Skeletons";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true">
      <Skeleton className="h-13 rounded-2xl" />
      <Skeleton className="mt-3 h-10" />
      <div className="mt-3 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-6 mb-3 h-6 w-40" />
      <ResultRowsSkeleton />
    </div>
  );
}
