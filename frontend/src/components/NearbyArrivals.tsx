import { useState } from "react";
import {
  useNearbyArrivals,
  formatArrivalTime,
  getArrivalUrgencyColor,
} from "@/hooks/useArrivals";
import {
  MapPin,
  Bus,
  Train,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Navigation,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NearbyArrivalsProps {
  userLocation: { lat: number; lng: number } | null;
  onStopClick?: (stopId: string, coords: [number, number]) => void;
}

export default function NearbyArrivals({
  userLocation,
  onStopClick,
}: NearbyArrivalsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [vehicleFilter, setVehicleFilter] = useState<"all" | "CTrain" | "Bus">(
    "all"
  );

  const {
    data: nearbyData,
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useNearbyArrivals(userLocation, {
    radius: 800,
    limitStops: 8,
    limitArrivals: 4,
    vehicleType: vehicleFilter === "all" ? undefined : vehicleFilter,
    enabled: !!userLocation,
    refetchInterval: 30000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  if (!userLocation) {
    return (
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-zinc-400">
          <Navigation className="w-5 h-5" />
          <span className="text-sm">
            Enable location to see nearby arrivals
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-lg">
            <Clock className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Nearby Departures</h3>
            {lastUpdated && (
              <p className="text-xs text-zinc-500">Updated {lastUpdated}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              refetch();
            }}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-zinc-800">
          {/* Filter tabs */}
          <div className="flex gap-1 p-2 border-b border-zinc-800">
            {(["all", "CTrain", "Bus"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setVehicleFilter(filter)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  vehicleFilter === filter
                    ? "bg-blue-500 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                )}
              >
                {filter === "all" ? "All" : filter}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="p-8 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="p-4 flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm">Failed to load arrivals</span>
            </div>
          )}

          {/* Stops list */}
          {nearbyData && !isLoading && (
            <div className="max-h-[400px] overflow-y-auto">
              {nearbyData.stops.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">
                  <Bus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No stops found nearby</p>
                </div>
              ) : (
                nearbyData.stops.map((stopData) => (
                  <div
                    key={stopData.stop.stop_id}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    {/* Stop header */}
                    <div
                      className="flex items-start gap-3 p-3 hover:bg-zinc-800/30 cursor-pointer transition-colors"
                      onClick={() =>
                        onStopClick?.(stopData.stop.stop_id, [
                          stopData.stop.coordinates.longitude,
                          stopData.stop.coordinates.latitude,
                        ])
                      }
                    >
                      <div className="bg-zinc-800 p-2 rounded-lg shrink-0">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white text-sm truncate">
                          {stopData.stop.stop_name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">
                            {stopData.stop.distance_meters}m away
                          </span>
                          <div className="flex gap-1">
                            {stopData.routes.slice(0, 3).map((route, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  backgroundColor: `${route.color}20`,
                                  color: route.color,
                                }}
                              >
                                {route.route_short_name}
                              </span>
                            ))}
                            {stopData.routes.length > 3 && (
                              <span className="text-[10px] text-zinc-500">
                                +{stopData.routes.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Arrivals */}
                    {stopData.arrivals.length > 0 ? (
                      <div className="px-3 pb-3 space-y-1.5">
                        {stopData.arrivals.map((arrival, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              {arrival.vehicle_type === "CTrain" ? (
                                <Train
                                  className="w-4 h-4"
                                  style={{ color: arrival.color }}
                                />
                              ) : (
                                <Bus
                                  className="w-4 h-4"
                                  style={{ color: arrival.color }}
                                />
                              )}
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: arrival.color,
                                      color: "white",
                                    }}
                                  >
                                    {arrival.route_short_name}
                                  </span>
                                  <span className="text-sm text-white truncate max-w-[120px]">
                                    {arrival.headsign}
                                  </span>
                                </div>
                                {arrival.delay_minutes > 0 && (
                                  <span className="text-[10px] text-orange-400">
                                    {arrival.delay_minutes} min late
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "text-sm font-bold",
                                getArrivalUrgencyColor(arrival.minutes_away)
                              )}
                            >
                              {formatArrivalTime(arrival.minutes_away)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 pb-3">
                        <div className="text-xs text-zinc-500 bg-zinc-800/30 rounded-lg px-3 py-2 text-center">
                          No scheduled arrivals
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
