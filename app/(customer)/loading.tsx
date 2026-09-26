import { CardTilesSkeleton } from "@/components/states/Skeletons";
import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true">
      <Skeleton className="-mx-4 -mt-6 h-72 rounded-none sm:mx-0 sm:mt-0 sm:rounded-[2rem]" />
      <Skeleton className="mt-10 mb-4 h-6 w-48" />
      <CardTilesSkeleton />
    </div>
  );
}
