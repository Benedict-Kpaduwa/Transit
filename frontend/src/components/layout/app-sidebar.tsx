import { Train, Bus, MapPin } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarItem,
  SidebarSubItem,
} from "@/components/ui/sidebar";
import { useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import StationCard from "@/components/Station";

const AppSidebar = () => {
  const { data: stations } = useAllStationsByLineSorted();
  const { selectedStation, setSelectedStation } = useMapStore();

  return (
    <Sidebar className="border-none">
      <SidebarHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gray-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none">
            <Train className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-none">Transit</span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">
              Calgary Mapper
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-4 mb-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <MapPin className="size-3.5" />
            </div>
            <input
              placeholder="Find a station..."
              className="w-full bg-slate-100 dark:bg-slate-800/50 border-none rounded-lg py-2 pl-9 pr-4 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        <SidebarGroup label="Transit Options">
          <SidebarItem icon={Train} label="C-Trains">
            <div className="mt-2 mb-1 px-2">
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-bold text-red-500 uppercase tracking-wider">
                <div className="size-1.5 rounded-full bg-red-500" />
                Red Line
              </div>
              <div className="mt-1 space-y-1">
                {stations?.red.map((station, idx) => (
                  <StationCard
                    key={`red-${idx}`}
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => setSelectedStation(station)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 mb-1 px-2">
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-bold text-blue-500 uppercase tracking-wider">
                <div className="size-1.5 rounded-full bg-blue-500" />
                Blue Line
              </div>
              <div className="mt-1 space-y-1">
                {stations?.blue.map((station, idx) => (
                  <StationCard
                    key={`blue-${idx}`}
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => setSelectedStation(station)}
                  />
                ))}
              </div>
            </div>
          </SidebarItem>

          <SidebarItem icon={Bus} label="Buses">
            <SidebarSubItem label="BRT Routes" />
            <SidebarSubItem label="Regular Service" />
            <SidebarSubItem label="Express Routes" />
          </SidebarItem>
        </SidebarGroup>
      </SidebarContent>

      <div className="p-4 mt-auto">
        <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 p-3">
          <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
            System Status:{" "}
            <span className="text-green-600 font-bold">Live</span>
          </p>
          <p className="text-[10px] text-indigo-900/60 dark:text-indigo-400/60 mt-0.5">
            All lines are running on schedule.
          </p>
        </div>
      </div>
    </Sidebar>
  );
};

export default AppSidebar;
