import { useCallback, useState } from "react";
import {
  Train,
  Bus,
  Search,
  ChevronDown,
  Circle,
  Sparkles,
  Clock,
  MapPin,
  Info,
  Settings,
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
import type { Station } from "@/types";
import { useTheme } from "@/stores/use-theme-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <div className="relative shrink-0">
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
            isSelected
              ? "text-foreground"
              : "text-muted-foreground group-hover:text-foreground"
          )}
        >
          {station.name}
        </p>
        {station.shared && (
          <span className="text-xs text-amber-400/80 font-medium">
            Free Fare Zone
          </span>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Clock className="size-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">3m</span>
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
            <p className="text-xs text-muted-foreground">
              {stations.length} stations
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="ml-1.5 pl-4 border-l border-sidebar-border space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
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
  const { selectedStation, setSelectedStation } = useMapStore();
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
        {/* Search */}
        <div className="relative mb-5">
          {/* <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" /> */}
          <Input
            type="text"
            placeholder="Search stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
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
            <Bus className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Bus Routes
            </h2>
          </div>
          <div className="bg-sidebar rounded-xl p-4 border border-dashed border-sidebar-border text-center">
            <Bus className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Bus tracking coming soon
            </p>
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
