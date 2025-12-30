import type { Station } from "@/types";
import StationCard from "./Station";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface SidebarProps {
  redStations: Station[];
  blueStations: Station[];
  selectedStation: Station | null;
  onStationClick: (station: Station) => void;
}

const Sidebar = ({
  redStations,
  blueStations,
  selectedStation,
  onStationClick,
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
        <Accordion type="multiple" defaultValue={["red", "blue"]}>
          <AccordionItem value="red">
            <AccordionTrigger className="text-white text-lg">
              Red Line
            </AccordionTrigger>
            <AccordionContent>
              {redStations.map((station, idx) => (
                <StationCard
                  key={idx}
                  station={station}
                  isSelected={selectedStation?.name === station.name}
                  onClick={() => onStationClick(station)}
                />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="blue">
            <AccordionTrigger className="text-white text-lg">
              Blue Line
            </AccordionTrigger>
            <AccordionContent>
              {blueStations.map((station, idx) => (
                <StationCard
                  key={idx}
                  station={station}
                  isSelected={selectedStation?.name === station.name}
                  onClick={() => onStationClick(station)}
                />
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export default Sidebar;
