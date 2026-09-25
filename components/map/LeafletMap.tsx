"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { id: string; precision: "exact" | "approx" | "area"; label: string; sublabel?: string; href?: string };

export type LeafletMapProps = {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** The customer's own (rounded) position. */
  you?: LatLng | null;
  youLabel?: string;
  /** Editable pin (provider location step). */
  pin?: LatLng | null;
  onPinChange?: (p: LatLng) => void;
  radiusKm?: number | null;
  fitToMarkers?: boolean;
  className?: string;
};

const BRAND = "#0a6e53";
const YOU = "#2563eb";
// Radii that visibly say "somewhere around here" for non-exact positions.
const APPROX_M = 550;
const AREA_M = 1200;

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors";

/** Popup content built as DOM nodes (textContent), never HTML strings — names can't inject markup. */
function popup(m: MapMarker): HTMLElement {
  const el = document.createElement(m.href ? "a" : "div");
  if (m.href) (el as HTMLAnchorElement).href = m.href;
  el.style.cssText = "display:block;color:inherit;text-decoration:none;min-width:140px";
  const title = document.createElement("strong");
  title.textContent = m.label;
  el.appendChild(title);
  if (m.sublabel) {
    const sub = document.createElement("div");
    sub.textContent = m.sublabel;
    sub.style.cssText = "color:#475569;font-size:12px;margin-top:2px";
    el.appendChild(sub);
  }
  return el;
}

export default function LeafletMap({ center, zoom = 13, markers = [], you, youLabel = "You", pin, onPinChange, radiusKm, fitToMarkers, className = "" }: LeafletMapProps) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layers = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const onPin = useRef(onPinChange);
  onPin.current = onPinChange;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !holder.current || map.current) return;
      L.current = leaflet;
      const m = leaflet.map(holder.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], zoom);
      leaflet.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
      layers.current = leaflet.layerGroup().addTo(m);
      m.on("click", (e) => onPin.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const leaflet = L.current;
    const m = map.current;
    const g = layers.current;
    if (!leaflet || !m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];

    for (const mk of markers) {
      const ll: [number, number] = [mk.lat, mk.lng];
      bounds.push(ll);
      if (mk.precision !== "exact") {
        leaflet
          .circle(ll, { radius: mk.precision === "area" ? AREA_M : APPROX_M, color: BRAND, weight: 1, fillColor: BRAND, fillOpacity: 0.12 })
          .bindPopup(popup(mk))
          .addTo(g);
      }
      leaflet
        .circleMarker(ll, { radius: mk.precision === "exact" ? 8 : 6, color: "#fff", weight: 2, fillColor: BRAND, fillOpacity: mk.precision === "exact" ? 1 : 0.7 })
        .bindPopup(popup(mk))
        .addTo(g);
    }

    if (you) {
      bounds.push([you.lat, you.lng]);
      leaflet.circleMarker([you.lat, you.lng], { radius: 8, color: "#fff", weight: 3, fillColor: YOU, fillOpacity: 1 }).bindTooltip(youLabel).addTo(g);
    }

    if (pin) {
      const icon = leaflet.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${BRAND};border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const marker = leaflet.marker([pin.lat, pin.lng], { draggable: !!onPin.current, icon }).addTo(g);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onPin.current?.({ lat: p.lat, lng: p.lng });
      });
      if (radiusKm) leaflet.circle([pin.lat, pin.lng], { radius: radiusKm * 1000, color: BRAND, weight: 1, fillOpacity: 0.05 }).addTo(g);
    }

    if (fitToMarkers && bounds.length > 1) m.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    else if (fitToMarkers && bounds.length === 1) m.setView(bounds[0]!, 14);
  }

  // Redraw when data changes.
  useEffect(draw, [markers, you, pin, radiusKm, fitToMarkers, youLabel]);

  // Recenter when the requested centre moves (e.g. provider picks another area).
  useEffect(() => {
    if (map.current && !fitToMarkers) map.current.setView([center.lat, center.lng], map.current.getZoom());
  }, [center.lat, center.lng, fitToMarkers]);

  return <div ref={holder} className={`z-0 overflow-hidden rounded-2xl border border-line ${className}`} role="region" aria-label="Map" />;
}
