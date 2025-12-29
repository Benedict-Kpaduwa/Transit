import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import { Train } from "lucide-react";
import StationCard from "@/components/Station";

const AppSidebar = () => {
  const { data: stations } = useAllStationsByLineSorted();
  const { selectedStation, setSelectedStation } = useMapStore();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" className="h-14">
              <Train className="size-12" />
              <span className="font-bold text-xl">Transit</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Red Line */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-red-500" />
            <span>Red Line</span>
            <span className="text-muted-foreground ml-auto">
              {stations?.red.length ?? 0}
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {stations?.red.map((station, idx) => (
                <SidebarMenuItem key={idx}>
                  <StationCard
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => setSelectedStation(station)}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Blue Line */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-blue-500" />
            <span>Blue Line</span>
            <span className="text-muted-foreground ml-auto">
              {stations?.blue.length ?? 0}
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {stations?.blue.map((station, idx) => (
                <SidebarMenuItem key={idx}>
                  <StationCard
                    station={station}
                    isSelected={selectedStation?.name === station.name}
                    onClick={() => setSelectedStation(station)}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default AppSidebar;
