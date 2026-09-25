"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { LeafletMapProps } from "./LeafletMap";

// Leaflet touches `window`, so the map only ever renders in the browser.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

function MapPlaceholder() {
  const { t } = useI18n();
  return <div className="grid h-full min-h-64 place-items-center rounded-2xl border border-line bg-canvas text-sm text-ink-subtle">{t.location.mapLoading}</div>;
}

export function MapView(props: LeafletMapProps) {
  return <LeafletMap {...props} />;
}

export type { MapMarker, LatLng } from "./LeafletMap";
