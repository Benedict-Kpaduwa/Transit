import { useCallback, useState } from "react";
import {
  Train,
  Bus,
  Search,
  Circle,
  Sparkles,
  Clock,
  MapPin,
  Info,
  Settings,
  RefreshCw,
  Navigation,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import { cn } from "@/lib/utils";
import { useTheme } from "@/stores/use-theme-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useNearbyArrivals,
  formatArrivalTime,
  getArrivalUrgencyColor,
} from "@/hooks/useArrivals";

// Nearby Departures component for a specific vehicle type
function NearbyDepartures({
  userLocation,
  vehicleType,
}: {
  userLocation: { lat: number; lng: number } | null;
  vehicleType: "CTrain" | "Bus";
}) {
  // CTrain stations are farther apart, so use larger radius
  const searchRadius = vehicleType === "CTrain" ? 2000 : 800;
  
  const {
    data: nearbyData,
    isLoading,
    isError,
    refetch,
  } = useNearbyArrivals(userLocation, {
    radius: searchRadius,
    limitStops: 4,
    limitArrivals: 3,
    vehicleType,
    enabled: !!userLocation,
    refetchInterval: 30000,
  });

  if (!userLocation) {
    return (
      <div className="px-3 py-3 text-muted-foreground text-xs flex items-center gap-2">
        <Navigation className="size-3" />
        <span>Enable location for nearby departures</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-3 py-4 flex items-center justify-center">
        <RefreshCw className="size-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-3 py-3 text-red-400 text-xs">
        Failed to load departures
      </div>
    );
  }

  if (!nearbyData || nearbyData.stops.length === 0) {
    return (
      <div className="px-3 py-3 text-muted-foreground text-xs text-center">
        No nearby {vehicleType === "CTrain" ? "CTrain" : "bus"} stops
      </div>
    );
  }

  return (
    <div className="divide-y divide-sidebar-border">
      {nearbyData.stops.map((stopData) => (
        <div
          key={stopData.stop.stop_id}
          className="px-3 py-2 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-start gap-2 mb-1.5">
            <MapPin className="size-3 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {stopData.stop.stop_name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {stopData.stop.distance_meters}m away
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                refetch();
              }}
              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="size-2.5" />
            </button>
          </div>

          {stopData.arrivals.length > 0 ? (
            <div className="space-y-1 ml-5">
              {stopData.arrivals.map((arrival, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-sidebar rounded-md px-2 py-1 border border-sidebar-border"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {vehicleType === "CTrain" ? (
                      <Train
                        className="size-3 shrink-0"
                        style={{ color: arrival.color }}
                      />
                    ) : (
                      <Bus
                        className="size-3 shrink-0"
                        style={{ color: arrival.color }}
                      />
                    )}
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor: arrival.color,
                        color: "white",
                      }}
                    >
                      {arrival.route_short_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {arrival.headsign}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold shrink-0 ml-1",
                      getArrivalUrgencyColor(arrival.minutes_away)
                    )}
                  >
                    {formatArrivalTime(arrival.minutes_away)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground ml-5">No scheduled arrivals</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Collapsed nav item with tooltip
function CollapsedNavItem({
  icon: Icon,
  label,
  color,
  onClick,
  isActive,
}: {
  icon: typeof Train;
  label: string;
  color?: "red" | "blue" | "default";
  onClick?: () => void;
  isActive?: boolean;
}) {
  const colorClasses = {
    red: "text-red-400 hover:bg-red-500/10",
    blue: "text-blue-400 hover:bg-blue-500/10",
    default: "text-zinc-400 hover:bg-white/5",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            "w-full flex items-center justify-center p-3 rounded-xl transition-all duration-200",
            colorClasses[color || "default"],
            isActive && "bg-white/10"
          )}
        >
          <Icon className="size-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const AppSidebar = () => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { data: stations } = useAllStationsByLineSorted();
  const { setSelectedStation, userLocation } = useMapStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<"red" | "blue" | null>(
    "red"
  );

  // Filter stations based on search
  const filteredRed =
    stations?.red.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];
  const filteredBlue =
    stations?.blue.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];

  const { theme, setTheme } = useTheme();

  const handleThemeToggle = useCallback(
    (e?: React.MouseEvent) => {
      const newMode = theme === "dark" ? "light" : "dark";
      const root = document.documentElement;

      if (!document.startViewTransition) {
        setTheme(newMode);
        return;
      }

      // Set coordinates from the click event
      if (e) {
        root.style.setProperty("--x", `${e.clientX}px`);
        root.style.setProperty("--y", `${e.clientY}px`);
      }

      document.startViewTransition(() => {
        setTheme(newMode);
      });
    },
    [theme, setTheme]
  );

  // Collapsed sidebar view - icons only
  if (isCollapsed) {
    return (
      <Sidebar className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border flex items-center justify-center py-4">
          <div className="relative">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25">
              <Train className="size-5" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-green-500 rounded-full border-2 border-sidebar" />
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-col items-center py-4 px-2 space-y-2">
          {/* Search icon */}
          <CollapsedNavItem icon={Search} label="Search Stations" />

          {/* Status indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full flex items-center justify-center p-3 rounded-xl">
                <div className="relative">
                  <Circle className="size-3 fill-green-500 text-green-500" />
                  <div className="absolute inset-0 rounded-full animate-ping opacity-50 bg-green-500" />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Status: All Clear
            </TooltipContent>
          </Tooltip>

          <div className="w-8 h-px bg-sidebar-border my-2" />

          {/* Red Line */}
          <CollapsedNavItem
            icon={Train}
            label={`Red Line (${stations?.red.length ?? 0} stations)`}
            color="red"
            onClick={() => setActiveSection("red")}
            isActive={activeSection === "red"}
          />

          {/* Blue Line */}
          <CollapsedNavItem
            icon={Train}
            label={`Blue Line (${stations?.blue.length ?? 0} stations)`}
            color="blue"
            onClick={() => setActiveSection("blue")}
            isActive={activeSection === "blue"}
          />

          <div className="w-8 h-px bg-sidebar-border my-2" />

          {/* Bus */}
          <CollapsedNavItem icon={Bus} label="Bus Routes (Coming Soon)" />

          {/* Info */}
          <CollapsedNavItem icon={Info} label="Information" />

          {/* Settings */}
          <CollapsedNavItem icon={Settings} label="Settings" />
        </SidebarContent>

        {/* Footer with toggle */}
        <div className="mt-auto p-3 border-t border-sidebar-border flex justify-center">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        </div>
      </Sidebar>
    );
  }

  // Expanded sidebar view - full content
  return (
    <Sidebar className="border-r border-sidebar-border">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border px-5">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25">
                <Train className="size-5" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight">
                Calgary Transit
              </h1>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Live Tracker
              </p>
            </div>
          </div>
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 py-4">
        {/* Search with Results */}
        <div className="relative mb-5">
          <Input
            type="text"
            placeholder="Search CTrain stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          {/* Search Results Dropdown */}
          {searchQuery && (filteredRed.length > 0 || filteredBlue.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar border border-sidebar-border rounded-xl shadow-xl z-50 max-h-[300px] overflow-y-auto">
              {filteredRed.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center gap-2 px-2 py-1 mb-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Red Line</span>
                  </div>
                  {filteredRed.slice(0, 5).map((station, idx) => (
                    <button
                      key={`red-${idx}`}
                      onClick={() => {
                        setSelectedStation(station);
                        setSearchQuery("");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/10 transition-colors"
                    >
                      <Train className="size-3.5 text-red-500" />
                      <span className="text-sm text-foreground">{station.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {filteredBlue.length > 0 && (
                <div className="p-2 border-t border-sidebar-border">
                  <div className="flex items-center gap-2 px-2 py-1 mb-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">Blue Line</span>
                  </div>
                  {filteredBlue.slice(0, 5).map((station, idx) => (
                    <button
                      key={`blue-${idx}`}
                      onClick={() => {
                        setSelectedStation(station);
                        setSearchQuery("");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/10 transition-colors"
                    >
                      <Train className="size-3.5 text-blue-500" />
                      <span className="text-sm text-foreground">{station.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-sidebar rounded-xl p-3 border border-sidebar-border">
            <div className="flex items-center gap-2 mb-1">
              <Circle className="size-2 fill-green-500 text-green-500" />
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                Status
              </span>
            </div>
            <p className="text-xs font-semibold text-green-400">All Clear</p>
          </div>
          <div className="bg-sidebar rounded-xl p-3 border border-sidebar-border">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="size-3 text-amber-500" />
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
                Active
              </span>
            </div>
            <p className="text-sm font-semibold">
              {(stations?.red.length ?? 0) + (stations?.blue.length ?? 0)}{" "}
              <span className="text-muted-foreground text-xs">stations</span>
            </p>
          </div>
        </div>

        {/* Section Label */}
        <div className="flex items-center gap-2 mb-3 px-1">
          <Train className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            C-Train Lines
          </h2>
        </div>

        {/* Nearby CTrain Departures */}
        <div className="mb-4 bg-sidebar rounded-xl border border-sidebar-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-sidebar-border bg-sidebar-accent/30">
            <Clock className="size-3.5 text-blue-400" />
            <span className="text-xs font-medium text-muted-foreground">
              Nearby CTrain Departures
            </span>
          </div>
          <NearbyDepartures userLocation={userLocation} vehicleType="CTrain" />
        </div>

        {/* Buses Section */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Bus className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Bus Routes
            </h2>
          </div>
          <div className="bg-sidebar rounded-xl border border-sidebar-border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-sidebar-border bg-sidebar-accent/30">
              <Clock className="size-3.5 text-green-400" />
              <span className="text-xs font-medium text-muted-foreground">
                Nearby Bus Departures
              </span>
            </div>
            <NearbyDepartures userLocation={userLocation} vehicleType="Bus" />
          </div>
        </div>
      </SidebarContent>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2">
          <MapPin className="size-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              Calgary, Alberta
            </p>
            <p className="text-sm text-muted-foreground">
              Last updated: <span className="text-green-500">just now</span>
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="group/toggle size-8"
            onClick={handleThemeToggle}
          >
            <img
              src="/brightness.svg"
              alt="brightness"
              className="size-5 dark:invert"
            />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </Sidebar>
  );
};

export default AppSidebar;
