import Link from "next/link";
import { Logo, Wordmark } from "@/components/layout/Logo";
import { NotFoundView } from "@/components/states/States";

// Unknown URLs render outside the area layouts, so this adds the brand back.
export default function NotFound() {
  return (
    <div className="min-h-dvh px-4 py-6">
      <Link href="/" className="mx-auto flex max-w-6xl items-center gap-2">
        <Logo className="size-8" />
        <Wordmark className="text-lg" />
      </Link>
      <NotFoundView />
    </div>
  );
}
