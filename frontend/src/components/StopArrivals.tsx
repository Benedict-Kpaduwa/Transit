import {
  useStopArrivals,
  formatArrivalTime,
  getArrivalUrgencyColor,
} from "@/hooks/useArrivals";
import { Bus, Train, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface StopArrivalsProps {
  stopId: string;
  stopName?: string;
  compact?: boolean;
  maxArrivals?: number;
}

export default function StopArrivals({
  stopId,
  stopName,
  compact = false,
  maxArrivals = 5,
}: StopArrivalsProps) {
  const { data, isLoading, isError, refetch } = useStopArrivals(stopId, {
    limit: maxArrivals,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          compact ? "p-2" : "p-4"
        )}
      >
        <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-red-400",
          compact ? "p-2" : "p-3"
        )}
      >
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Failed to load arrivals</span>
      </div>
    );
  }

  if (!data) return null;

  const { arrivals, routes_serving } = data;

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-3")}>
      {/* Header with routes */}
      {!compact && routes_serving.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {routes_serving.slice(0, 5).map((route, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{
                backgroundColor: `${route.color}15`,
                color: route.color,
                border: `1px solid ${route.color}30`,
              }}
            >
              {route.vehicle_type === "CTrain" ? (
                <Train className="w-3 h-3" />
              ) : (
                <Bus className="w-3 h-3" />
              )}
              <span className="font-medium">{route.route_short_name}</span>
            </div>
          ))}
          {routes_serving.length > 5 && (
            <span className="text-xs text-zinc-500 px-2 py-1">
              +{routes_serving.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Arrivals list */}
      {arrivals.length === 0 ? (
        <div
          className={cn(
            "flex items-center gap-2 text-zinc-500",
            compact ? "text-xs p-2" : "text-sm p-3 bg-zinc-800/30 rounded-lg"
          )}
        >
          <Clock className="w-4 h-4" />
          <span>No scheduled arrivals</span>
        </div>
      ) : (
        <div className={cn("space-y-1.5", compact && "space-y-1")}>
          {arrivals.map((arrival, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center justify-between rounded-lg",
                compact
                  ? "bg-zinc-800/40 px-2 py-1.5"
                  : "bg-zinc-800/50 px-3 py-2"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {arrival.vehicle_type === "CTrain" ? (
                  <Train
                    className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4")}
                    style={{ color: arrival.color }}
                  />
                ) : (
                  <Bus
                    className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4")}
                    style={{ color: arrival.color }}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-bold px-1.5 py-0.5 rounded",
                        compact ? "text-[10px]" : "text-xs"
                      )}
                      style={{
                        backgroundColor: arrival.color,
                        color: "white",
                      }}
                    >
                      {arrival.route_short_name}
                    </span>
                    <span
                      className={cn(
                        "text-white truncate",
                        compact
                          ? "text-xs max-w-[80px]"
                          : "text-sm max-w-[120px]"
                      )}
                    >
                      {arrival.headsign}
                    </span>
                  </div>
                  {!compact && arrival.delay_minutes > 0 && (
                    <span className="text-[10px] text-orange-400">
                      {arrival.delay_minutes} min late
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span
                  className={cn(
                    "font-bold",
                    compact ? "text-xs" : "text-sm",
                    getArrivalUrgencyColor(arrival.minutes_away)
                  )}
                >
                  {formatArrivalTime(arrival.minutes_away)}
                </span>
                {compact && arrival.delay_minutes > 0 && (
                  <span className="text-[9px] text-orange-400">
                    +{arrival.delay_minutes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      {!compact && (
        <button
          onClick={() => refetch()}
          className="w-full flex items-center justify-center gap-2 text-xs text-zinc-400 hover:text-white py-2 hover:bg-zinc-800/30 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      )}
    </div>
  );
}
