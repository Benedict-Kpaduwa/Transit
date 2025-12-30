import { useState } from "react";
import {
  Train,
  Bus,
  Search,
  ChevronDown,
  Circle,
  Sparkles,
  Clock,
  MapPin,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import { cn } from "@/lib/utils";
import type { Station } from "@/types";

// Compact station item component
function StationItem({
  station,
  isSelected,
  onClick,
}: {
  station: Station;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isRedLine = station.line === "Red" || station.route === "201";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group",
        isSelected ? "bg-white/10 shadow-lg" : "hover:bg-white/5"
      )}
    >
      {/* Station dot with pulse animation when selected */}
      <div className="relative flex-shrink-0">
        <div
          className={cn(
            "size-2.5 rounded-full transition-all",
            isRedLine ? "bg-red-500" : "bg-blue-500",
            isSelected && "scale-125"
          )}
        />
        {isSelected && (
          <div
            className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-75",
              isRedLine ? "bg-red-500" : "bg-blue-500"
            )}
          />
        )}
      </div>

      {/* Station info */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate transition-colors",
            isSelected ? "text-white" : "text-zinc-300 group-hover:text-white"
          )}
        >
          {station.name}
        </p>
        {station.shared && (
          <span className="text-[10px] text-amber-400/80 font-medium">
            Free Fare Zone
          </span>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Clock className="size-3 text-zinc-500" />
        <span className="text-[10px] text-zinc-500">3m</span>
      </div>
    </button>
  );
}

// Line section component
function LineSection({
  title,
  color,
  stations,
  selectedStation,
  onStationClick,
  defaultOpen = false,
}: {
  title: string;
  color: "red" | "blue";
  stations: Station[];
  selectedStation: Station | null;
  onStationClick: (station: Station) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const colorClasses = {
    red: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      dot: "bg-red-500",
      glow: "shadow-red-500/20",
    },
    blue: {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
      dot: "bg-blue-500",
      glow: "shadow-blue-500/20",
    },
  };
  const colors = colorClasses[color];

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200",
          isOpen ? `${colors.bg} ${colors.border} border` : "hover:bg-white/5"
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "size-3 rounded-full shadow-lg",
              colors.dot,
              colors.glow
            )}
          />
          <div className="text-left">
            <h3 className={cn("font-semibold text-sm", colors.text)}>
              {title}
            </h3>
            <p className="text-[11px] text-zinc-500">
              {stations.length} stations
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-zinc-500 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="ml-1.5 pl-4 border-l border-zinc-800/50 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
          {stations.map((station, idx) => (
            <StationItem
              key={`${color}-${idx}`}
              station={station}
              isSelected={selectedStation?.name === station.name}
              onClick={() => onStationClick(station)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const AppSidebar = () => {
  const { data: stations } = useAllStationsByLineSorted();
  const { selectedStation, setSelectedStation } = useMapStore();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter stations based on search
  const filteredRed =
    stations?.red.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];
  const filteredBlue =
    stations?.blue.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) ?? [];

  return (
    <Sidebar className="border-r border-zinc-800/50">
      {/* Header */}
      <SidebarHeader className="border-b border-zinc-800/50 px-5">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25">
                <Train className="size-5" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight">
                Calgary Transit
              </h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                Live Tracker
              </p>
            </div>
          </div>
          <SidebarTrigger className="text-zinc-400 hover:text-white" />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 py-4">
        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
          />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/30">
            <div className="flex items-center gap-2 mb-1">
              <Circle className="size-2 fill-green-500 text-green-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                Status
              </span>
            </div>
            <p className="text-sm font-semibold text-green-400">All Clear</p>
          </div>
          <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800/30">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="size-3 text-amber-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                Active
              </span>
            </div>
            <p className="text-sm font-semibold text-white">
              {(stations?.red.length ?? 0) + (stations?.blue.length ?? 0)}{" "}
              <span className="text-zinc-500 font-normal">stations</span>
            </p>
          </div>
        </div>

        {/* Section Label */}
        <div className="flex items-center gap-2 mb-3 px-1">
          <Train className="size-4 text-zinc-500" />
          <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
            C-Train Lines
          </h2>
        </div>

        {/* Lines */}
        <div className="space-y-2">
          <LineSection
            title="Red Line"
            color="red"
            stations={filteredRed}
            selectedStation={selectedStation}
            onStationClick={setSelectedStation}
            defaultOpen={true}
          />
          <LineSection
            title="Blue Line"
            color="blue"
            stations={filteredBlue}
            selectedStation={selectedStation}
            onStationClick={setSelectedStation}
            defaultOpen={false}
          />
        </div>

        {/* Buses Section (Placeholder) */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Bus className="size-4 text-zinc-500" />
            <h2 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
              Bus Routes
            </h2>
          </div>
          <div className="bg-zinc-900/30 rounded-xl p-4 border border-dashed border-zinc-800/50 text-center">
            <Bus className="size-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">Bus tracking coming soon</p>
          </div>
        </div>
      </SidebarContent>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-3 px-2">
          <MapPin className="size-4 text-zinc-500" />
          <div className="flex-1">
            <p className="text-xs font-medium text-zinc-400">
              Calgary, Alberta
            </p>
            <p className="text-[10px] text-zinc-600">
              Last updated: <span className="text-green-500">just now</span>
            </p>
          </div>
        </div>
      </div>
    </Sidebar>
  );
};

export default AppSidebar;
