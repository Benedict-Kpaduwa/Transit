import { MapPin } from "lucide-react";

import type { LocationFeature } from "@/lib/mapbox/utils";
import Marker from "@/components/map/map-marker";

interface LocationMarkerProps {
  location: LocationFeature;
  onClick: (data: LocationFeature | null) => void;
  isSelected?: boolean;
}

export function LocationMarker({
  location,
  onClick,
  isSelected,
}: LocationMarkerProps) {
  return (
    <Marker
      longitude={location.geometry.coordinates[0]}
      latitude={location.geometry.coordinates[1]}
      data={location}
      onClick={({ data }) => {
        onClick(data);
      }}
    >
      <div
        className={`rounded-full flex items-center justify-center transform transition-all duration-200 text-white shadow-lg size-9 cursor-pointer hover:scale-110 ${
          isSelected
            ? "bg-blue-500 ring-4 ring-blue-500/30 scale-110"
            : "bg-rose-500 hover:bg-rose-600"
        }`}
      >
        <MapPin className="stroke-[2.5px] size-5" />
      </div>
    </Marker>
  );
}
