import { ResultRowsSkeleton } from "@/components/states/Skeletons";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true">
      <div className="bg-hero flex flex-col gap-3 rounded-[2rem] p-7">
        <div className="h-3 w-20 rounded bg-white/15" />
        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-white/15" />
        <div className="mt-3 flex gap-2">
          <div className="h-10 w-32 animate-pulse rounded-xl bg-white/10" />
          <div className="h-10 w-28 animate-pulse rounded-xl bg-white/10" />
          <div className="h-10 w-20 animate-pulse rounded-xl bg-white/10" />
        </div>
      </div>
      <Skeleton className="mt-6 mb-3 h-6 w-56" />
      <ResultRowsSkeleton count={3} />
    </div>
  );
}
