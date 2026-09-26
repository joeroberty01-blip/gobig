import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl" aria-busy="true">
      <Skeleton className="-mx-4 -mt-6 aspect-[16/9] rounded-none sm:mx-0 sm:mt-0 sm:aspect-[3/1] sm:rounded-[2rem]" />
      <div className="relative -mt-12 grid gap-4 sm:-mt-16 sm:px-6 md:grid-cols-[1fr_320px]">
        <div className="flex gap-4 rounded-3xl border border-line bg-surface p-5">
          <Skeleton className="size-18 shrink-0 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-3xl border border-line bg-surface p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
      <Skeleton className="mt-6 h-12 rounded-2xl" />
      <Skeleton className="mt-6 h-48 rounded-2xl" />
    </div>
  );
}
