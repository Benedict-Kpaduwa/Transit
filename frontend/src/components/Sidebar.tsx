import type { Station } from "@/types";
import StationCard from "./Station";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  useNearbyArrivals,
  formatArrivalTime,
  getArrivalUrgencyColor,
} from "@/hooks/useArrivals";
import { Bus, Train, Clock, RefreshCw, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  redStations: Station[];
  blueStations: Station[];
  selectedStation: Station | null;
  onStationClick: (station: Station) => void;
  userLocation?: { lat: number; lng: number } | null;
  onStopClick?: (stopId: string, coords: [number, number]) => void;
}

// Nearby Departures sub-component for a specific vehicle type
function NearbyDepartures({
  userLocation,
  vehicleType,
  onStopClick,
}: {
  userLocation: { lat: number; lng: number } | null;
  vehicleType: "CTrain" | "Bus";
  onStopClick?: (stopId: string, coords: [number, number]) => void;
}) {
  const {
    data: nearbyData,
    isLoading,
    isError,
    refetch,
  } = useNearbyArrivals(userLocation, {
    radius: 800,
    limitStops: 5,
    limitArrivals: 3,
    vehicleType,
    enabled: !!userLocation,
    refetchInterval: 30000,
  });

  if (!userLocation) {
    return (
      <div className="px-4 py-3 text-zinc-500 text-sm flex items-center gap-2">
        <Navigation className="w-4 h-4" />
        <span>Enable location for nearby departures</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-4 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-3 text-red-400 text-sm">
        Failed to load departures
      </div>
    );
  }

  if (!nearbyData || nearbyData.stops.length === 0) {
    return (
      <div className="px-4 py-3 text-zinc-500 text-sm text-center">
        No nearby {vehicleType === "CTrain" ? "CTrain" : "bus"} stops
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800/50">
      {nearbyData.stops.map((stopData) => (
        <div
          key={stopData.stop.stop_id}
          className="px-3 py-2.5 hover:bg-zinc-800/30 cursor-pointer transition-colors"
          onClick={() =>
            onStopClick?.(stopData.stop.stop_id, [
              stopData.stop.coordinates.longitude,
              stopData.stop.coordinates.latitude,
            ])
          }
        >
          <div className="flex items-start gap-2 mb-2">
            <MapPin className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {stopData.stop.stop_name}
              </p>
              <p className="text-xs text-zinc-500">
                {stopData.stop.distance_meters}m away
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                refetch();
              }}
              className="p-1 text-zinc-500 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {stopData.arrivals.length > 0 ? (
            <div className="space-y-1.5 ml-5">
              {stopData.arrivals.map((arrival, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-zinc-800/50 rounded-md px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {vehicleType === "CTrain" ? (
                      <Train
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: arrival.color }}
                      />
                    ) : (
                      <Bus
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: arrival.color }}
                      />
                    )}
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor: arrival.color,
                        color: "white",
                      }}
                    >
                      {arrival.route_short_name}
                    </span>
                    <span className="text-xs text-zinc-400 truncate">
                      {arrival.headsign}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-bold shrink-0 ml-2",
                      getArrivalUrgencyColor(arrival.minutes_away)
                    )}
                  >
                    {formatArrivalTime(arrival.minutes_away)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 ml-5">No scheduled arrivals</p>
          )}
        </div>
      ))}
    </div>
  );
}

const Sidebar = ({
  redStations,
  blueStations,
  selectedStation,
  onStationClick,
  userLocation,
  onStopClick,
}: SidebarProps) => {
  return (
    <div className="w-[540px] h-full bg-[#171717] overflow-y-auto border-r border-zinc-800/50 shrink-0">
      <div className="px-6 py-6 border-b border-zinc-800/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-7 h-7 bg-white rounded flex items-center justify-center">
            <span className="text-black font-bold text-lg">T</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Transit
          </h1>
        </div>
      </div>

      <div className="px-3 py-2">
        <Accordion type="multiple" defaultValue={["ctrain", "bus"]}>
          {/* CTrain Section */}
          <AccordionItem value="ctrain">
            <AccordionTrigger className="text-white text-lg">
              <div className="flex items-center gap-2">
                <Train className="w-5 h-5" />
                <span>CTrain Lines</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {/* Nearby CTrain Departures */}
              <div className="mb-3 bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/50">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-zinc-800/30">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-zinc-300">
                    Nearby CTrain Departures
                  </span>
                </div>
                <NearbyDepartures
                  userLocation={userLocation || null}
                  vehicleType="CTrain"
                  onStopClick={onStopClick}
                />
              </div>

              {/* Red Line Stations */}
              <div className="mb-2">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-zinc-400">
                    Red Line
                  </span>
                </div>
                {redStations.map((station, idx) => (
                  <StationCard
                    key={idx}
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => onStationClick(station)}
                  />
                ))}
              </div>

              {/* Blue Line Stations */}
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-zinc-400">
                    Blue Line
                  </span>
                </div>
                {blueStations.map((station, idx) => (
                  <StationCard
                    key={idx}
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => onStationClick(station)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Bus Routes Section */}
          <AccordionItem value="bus">
            <AccordionTrigger className="text-white text-lg">
              <div className="flex items-center gap-2">
                <Bus className="w-5 h-5" />
                <span>Bus Routes</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {/* Nearby Bus Departures */}
              <div className="bg-zinc-900/50 rounded-lg overflow-hidden border border-zinc-800/50">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-zinc-800/30">
                  <Clock className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-zinc-300">
                    Nearby Bus Departures
                  </span>
                </div>
                <NearbyDepartures
                  userLocation={userLocation || null}
                  vehicleType="Bus"
                  onStopClick={onStopClick}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Sidebar;
