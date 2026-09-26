"use client";

import { ErrorView } from "@/components/states/States";

export default function AreaError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
