import type { LocationFeature } from "@/lib/mapbox/utils";
import { iconMap } from "@/lib/mapbox/utils";
import { cn } from "@/lib/utils";
import {
  LocateIcon,
  MapPin,
  Navigation,
  X,
  Copy,
  ExternalLink,
  Check,
} from "lucide-react";
import { useState } from "react";

import Popup from "@/components/map/map-popup";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type LocationPopupProps = {
  location: LocationFeature;
  onGetDirections?: (destination: {
    name: string;
    address: string;
    coordinates: [number, number];
  }) => void;
  onClose?: () => void;
};

export function LocationPopup({
  location,
  onGetDirections,
  onClose,
}: LocationPopupProps) {
  if (!location) return null;

  const { properties, geometry } = location;

  const name = properties?.name || "Unknown Location";
  const address = properties?.full_address || properties?.address || "";
  const categories = properties?.poi_category || [];
  const brand = properties?.brand?.[0] || "";
  const status = properties?.operational_status || "";
  const maki = properties?.maki || "";

  const lat = geometry?.coordinates?.[1] || properties?.coordinates?.latitude;
  const lng = geometry?.coordinates?.[0] || properties?.coordinates?.longitude;

  const [copied, setCopied] = useState(false);

  const getIcon = () => {
    const allKeys = [maki, ...(categories || [])];

    for (const key of allKeys) {
      const lower = key?.toLowerCase();
      if (iconMap[lower]) return iconMap[lower];
    }

    return <LocateIcon className="h-5 w-5" />;
  };

  const copyCoordinates = () => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInGoogleMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      "_blank"
    );
  };

  return (
    <Popup
      latitude={lat}
      longitude={lng}
      offset={20}
      closeButton={false}
      closeOnClick={false}
      focusAfterOpen={false}
    >
      <div className="w-[320px] bg-white dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-600/20 dark:to-purple-600/20 p-4 border-b border-zinc-200 dark:border-zinc-700/50">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3 pr-8">
            <div className="bg-blue-500/15 dark:bg-blue-500/20 p-2.5 rounded-xl shrink-0 border border-blue-500/20 dark:border-blue-500/30">
              <span className="text-blue-600 dark:text-blue-400">
                {getIcon()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-900 dark:text-white text-base leading-tight truncate">
                {name}
              </h3>
              {brand && brand !== name && (
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                  {brand}
                </p>
              )}
              {status && (
                <Badge
                  className={cn(
                    "mt-1.5 text-[10px] font-medium px-2 py-0.5",
                    status === "active"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/30"
                      : "bg-zinc-200/80 dark:bg-zinc-700/50 text-zinc-600 dark:text-zinc-400 border-zinc-300/50 dark:border-zinc-600/50"
                  )}
                >
                  {status === "active" ? "● Open Now" : status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Address */}
          {address && (
            <div className="flex items-start gap-2.5 text-zinc-700 dark:text-zinc-300">
              <MapPin className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed">{address}</p>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.slice(0, 4).map((category, index) => (
                <Badge
                  key={index}
                  className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700/50 text-[11px] capitalize px-2 py-0.5 font-normal"
                >
                  {category}
                </Badge>
              ))}
              {categories.length > 4 && (
                <Badge className="bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 border-zinc-200 dark:border-zinc-700/50 text-[11px] px-2 py-0.5">
                  +{categories.length - 4}
                </Badge>
              )}
            </div>
          )}

          {/* Coordinates with actions */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-200/80 dark:border-zinc-700/50">
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </span>
            <div className="flex gap-1">
              <button
                onClick={copyCoordinates}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  copied
                    ? "text-emerald-500 dark:text-emerald-400 bg-emerald-500/10"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
                title="Copy coordinates"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={openInGoogleMaps}
                className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                title="Open in Google Maps"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Get Directions Button */}
        {onGetDirections && (
          <div className="p-4 pt-0">
            <Button
              onClick={() =>
                onGetDirections({
                  name,
                  address,
                  coordinates: [lng, lat],
                })
              }
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200"
              size="lg"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Get Directions
            </Button>
          </div>
        )}
      </div>
    </Popup>
  );
}
