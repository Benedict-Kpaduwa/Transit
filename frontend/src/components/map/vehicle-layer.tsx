import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { vehicleAnimator } from "@/lib/vehicle-animator";

export interface VehiclePositionData {
  id: string;
  lng: number;
  lat: number;
  bearing: number;
  vehicleType: "CTrain" | "Bus";
  routeShortName?: string;
  routeLongName?: string;
  headsign?: string;
  color?: string;
  timestamp?: number | string;
  tripId?: string;
  vehicleId?: string;
}

interface VehicleLayerProps {
  map: mapboxgl.Map | null;
  vehicles: VehiclePositionData[];
  onVehicleClick?: (vehicle: VehiclePositionData) => void;
  onViewRoute?: (vehicle: VehiclePositionData) => void;
  trackedVehicleId?: string | null; // ID of the tracked vehicle to show 3D model
}

interface MarkerEntry {
  marker: mapboxgl.Marker;
  bearingEl: HTMLElement | null;
  isTracked: boolean;
  lastLng: number;
  lastLat: number;
  lastBearing: number;
}

// Format timestamp to human-readable time
function formatLastUpdate(timestamp: number | string | undefined): string {
  if (!timestamp) return "Unknown";
  const ts = typeof timestamp === "string" ? parseInt(timestamp) : timestamp;
  if (isNaN(ts)) return "Unknown";

  const date = new Date(ts * 1000);
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  return date.toLocaleTimeString();
}

// Create simple icon-based marker with a rotating direction pointer
function createVehicleMarkerElement(
  vehicleType: "CTrain" | "Bus",
  color: string,
  routeShortName?: string,
  bearing?: number
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker";

  const icon = vehicleType === "CTrain" ? "🚊" : "🚌";

  el.innerHTML = `
    <div class="vehicle-marker-container" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <div style="position: relative; width: 40px; height: 40px;">
        <!-- Direction pointer: rotated each frame around the icon center -->
        <div class="vehicle-bearing" style="
          position: absolute;
          inset: -9px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          will-change: transform;
          transform: rotate(${bearing ?? 0}deg);
          pointer-events: none;
        ">
          <div style="
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 9px solid ${color};
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 1px rgba(255,255,255,0.9));
          "></div>
        </div>

        <!-- Vehicle icon with colored background -->
        <div class="vehicle-icon" style="
          position: absolute;
          inset: 0;
          background: ${color};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.9);
          border: 2px solid white;
          transition: transform 0.15s ease;
        ">
          ${icon}
        </div>
      </div>

      <!-- Route label -->
      ${routeShortName ? `
        <div style="
          margin-top: 4px;
          padding: 2px 6px;
          background: ${color};
          color: white;
          font-size: 10px;
          font-weight: 700;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        ">
          ${routeShortName}
        </div>
      ` : ""}
    </div>
  `;

  return el;
}


// Create floating label for tracked vehicles (3D model provided by Vehicle3DLayer)
function create3DModelMarkerElement(
  vehicleType: "CTrain" | "Bus",
  color: string,
  routeShortName?: string
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker vehicle-marker-3d";

  // Floating label centered directly above the 3D model with pulse ring
  el.innerHTML = `
    <div style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    ">
      <!-- Labels positioned above -->
      <div style="
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      ">
        <div style="
          padding: 4px 12px;
          background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
          color: white;
          font-size: 13px;
          font-weight: 700;
          border-radius: 8px;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          letter-spacing: 0.3px;
        ">
          ${routeShortName || (vehicleType === "CTrain" ? "CTrain" : "Bus")}
        </div>
        <div style="
          padding: 3px 10px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%);
          color: white;
          font-size: 10px;
          font-weight: 600;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 3px 8px rgba(34, 197, 94, 0.4);
          animation: tracking-blink 1s ease-in-out infinite;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span style="font-size: 11px;">📍</span> Tracking
        </div>
        <!-- Arrow pointing down -->
        <div style="
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 10px solid rgba(34, 197, 94, 0.95);
        "></div>
      </div>

      <!-- Pulse ring around the vehicle position -->
      <div style="
        width: 80px;
        height: 80px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: radial-gradient(circle, ${color}40 0%, ${color}20 40%, transparent 70%);
          animation: tracked-pulse 1.5s ease-in-out infinite;
        "></div>
        <div style="
          position: absolute;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: 3px solid ${color}80;
          animation: tracked-pulse 1.5s ease-in-out infinite 0.3s;
        "></div>
      </div>
    </div>
  `;

  return el;
}

// Create popup HTML content
function createPopupHTML(vehicle: VehiclePositionData): string {
  const lastUpdate = formatLastUpdate(vehicle.timestamp);
  const typeLabel = vehicle.vehicleType === "CTrain" ? "CTrain" : "Bus";
  const typeColor = vehicle.color || "#22c55e";

  return `
    <div style="
      font-family: system-ui, -apple-system, sans-serif;
      min-width: 220px;
      max-width: min(300px, calc(100vw - 48px));
      background: linear-gradient(180deg, #18181b 0%, #09090b 100%);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    ">
      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%);
        padding: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <div style="
          background: rgba(255,255,255,0.2);
          padding: 8px;
          border-radius: 10px;
          font-size: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${vehicle.vehicleType === "CTrain" ? "🚊" : "🚌"}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span style="
              font-size: 18px;
              font-weight: 800;
              color: white;
            ">${vehicle.routeShortName || "N/A"}</span>
            <span style="
              background: rgba(255,255,255,0.25);
              padding: 2px 8px;
              border-radius: 4px;
              font-size: 10px;
              color: white;
              font-weight: 600;
            ">${typeLabel}</span>
          </div>
          <div style="
            font-size: 12px;
            color: rgba(255,255,255,0.9);
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">${vehicle.headsign || "Unknown destination"}</div>
        </div>
      </div>

      <!-- Content -->
      <div style="padding: 12px 14px;">
        <!-- Vehicle ID -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #27272a;
        ">
          <span style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Vehicle ID</span>
          <span style="color: #fafafa; font-weight: 600; font-size: 12px;">${vehicle.vehicleId || vehicle.id || "Unknown"}</span>
        </div>

        <!-- Last Update -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #27272a;
        ">
          <span style="color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Last Update</span>
          <span style="
            color: #22c55e;
            font-weight: 600;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="
              width: 6px;
              height: 6px;
              background: #22c55e;
              border-radius: 50%;
              animation: blink 1s ease-in-out infinite;
            "></span>
            ${lastUpdate}
          </span>
        </div>

        <!-- View Route Button -->
        <button
          id="view-route-btn-${vehicle.id}"
          style="
            width: 100%;
            margin-top: 12px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border: none;
            border-radius: 10px;
            padding: 10px;
            color: white;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s;
          "
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 12l6-6M3 12l6 6"/>
          </svg>
          View Route Path
        </button>
      </div>
    </div>
    <style>
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;
}

export default function VehicleLayer({
  map,
  vehicles,
  onVehicleClick,
  onViewRoute,
  trackedVehicleId,
}: VehicleLayerProps) {
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  // Latest data per vehicle so click handlers never capture stale props
  const vehicleDataRef = useRef<Map<string, VehiclePositionData>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const styleAddedRef = useRef(false);

  // Add CSS styles
  const addStyles = useCallback(() => {
    if (styleAddedRef.current) return;

    const existingStyle = document.getElementById("vehicle-marker-styles");
    if (existingStyle) {
      styleAddedRef.current = true;
      return;
    }

    const style = document.createElement("style");
    style.id = "vehicle-marker-styles";
    style.textContent = `
      .vehicle-marker {
        will-change: transform;
        z-index: 10;
      }

      .vehicle-marker-3d {
        z-index: 100;
      }

      .vehicle-marker:hover {
        z-index: 100;
      }

      .vehicle-marker:hover .vehicle-icon {
        transform: scale(1.15);
      }

      @keyframes tracked-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.6;
        }
        50% {
          transform: scale(1.15);
          opacity: 0.9;
        }
      }

      @keyframes tracking-blink {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }

      .mapboxgl-popup-content {
        padding: 0 !important;
        border-radius: 16px !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .mapboxgl-popup-tip {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    styleAddedRef.current = true;
  }, []);

  // Show popup for a vehicle (always reads the freshest data by id)
  const showPopup = useCallback((vehicleId: string) => {
    if (!map) return;

    const vehicle = vehicleDataRef.current.get(vehicleId);
    if (!vehicle) return;

    if (popupRef.current) {
      popupRef.current.remove();
    }

    const live = vehicleAnimator.getPosition(vehicleId);
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "none",
      className: "vehicle-popup",
      anchor: "left",
      offset: [40, 0],
    })
      .setLngLat([live?.lng ?? vehicle.lng, live?.lat ?? vehicle.lat])
      .setHTML(createPopupHTML(vehicle))
      .addTo(map);

    popupRef.current = popup;

    // Bind the View Route button once the popup DOM exists
    const btn = document.getElementById(`view-route-btn-${vehicle.id}`);
    if (btn && onViewRoute) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const latest = vehicleDataRef.current.get(vehicleId) ?? vehicle;
        onViewRoute(latest);
        popup.remove();
      });
    }
  }, [map, onViewRoute]);

  // Single animation-frame subscription drives every marker
  useEffect(() => {
    if (!map) return;

    const unsubscribe = vehicleAnimator.subscribe(() => {
      markersRef.current.forEach((entry, id) => {
        const pos = vehicleAnimator.getPosition(id);
        if (!pos) return;

        if (pos.lng !== entry.lastLng || pos.lat !== entry.lastLat) {
          entry.marker.setLngLat([pos.lng, pos.lat]);
          entry.lastLng = pos.lng;
          entry.lastLat = pos.lat;
        }

        if (entry.bearingEl && pos.bearing !== entry.lastBearing) {
          entry.bearingEl.style.transform = `rotate(${pos.bearing}deg)`;
          entry.lastBearing = pos.bearing;
        }
      });
    });

    return unsubscribe;
  }, [map]);

  // Manage vehicle marker lifecycle (creation/removal/tracked-state swaps)
  useEffect(() => {
    if (!map) return;

    addStyles();

    // Filter valid vehicles
    const validVehicles = vehicles.filter(
      (v) =>
        v.id &&
        typeof v.lng === "number" &&
        typeof v.lat === "number" &&
        !isNaN(v.lng) &&
        !isNaN(v.lat)
    );

    const currentIds = new Set(validVehicles.map((v) => v.id));

    // Remove markers no longer in data
    markersRef.current.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
        vehicleDataRef.current.delete(id);
      }
    });

    validVehicles.forEach((vehicle) => {
      vehicleDataRef.current.set(vehicle.id, vehicle);

      const color = vehicle.color || (vehicle.vehicleType === "CTrain"
        ? (vehicle.routeShortName === "201" ? "#DC2626" : "#2563EB")
        : "#22c55e");

      const isTracked = !!trackedVehicleId && (
        vehicle.id === trackedVehicleId ||
        vehicle.tripId === trackedVehicleId ||
        vehicle.vehicleId === trackedVehicleId
      );

      const existing = markersRef.current.get(vehicle.id);
      if (existing && existing.isTracked === isTracked) {
        // Position updates are handled by the animator subscription.
        return;
      }

      // Create (or recreate, when tracked state flipped) the marker element
      existing?.marker.remove();

      const el = isTracked
        ? create3DModelMarkerElement(vehicle.vehicleType, color, vehicle.routeShortName)
        : createVehicleMarkerElement(
            vehicle.vehicleType,
            color,
            vehicle.routeShortName,
            vehicle.bearing
          );

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        showPopup(vehicle.id);
        if (onVehicleClick) {
          const latest = vehicleDataRef.current.get(vehicle.id);
          if (latest) onVehicleClick(latest);
        }
      });

      const startPos = vehicleAnimator.getPosition(vehicle.id);
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([startPos?.lng ?? vehicle.lng, startPos?.lat ?? vehicle.lat])
        .addTo(map);

      markersRef.current.set(vehicle.id, {
        marker,
        bearingEl: el.querySelector<HTMLElement>(".vehicle-bearing"),
        isTracked,
        lastLng: startPos?.lng ?? vehicle.lng,
        lastLat: startPos?.lat ?? vehicle.lat,
        lastBearing: startPos?.bearing ?? vehicle.bearing ?? 0,
      });
    });
  }, [map, vehicles, onVehicleClick, addStyles, showPopup, trackedVehicleId]);

  // Cleanup on unmount only
  useEffect(() => {
    const markers = markersRef.current;
    const vehicleData = vehicleDataRef.current;
    return () => {
      popupRef.current?.remove();
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
      vehicleData.clear();
    };
  }, []);

  return null;
}
