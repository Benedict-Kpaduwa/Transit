import type { Station } from "@/data/StationObject";
import StationCard from "./Station";

interface LineAccordionProps {
  lineName: string;
  lineColor: string;
  route: string;
  stations: Station[];
  selectedStation: Station | null;
  isOpen: boolean;
  onToggle: () => void;
  onStationClick: (station: Station) => void;
}

const LineAccordion = ({
  lineName,
  route,
  stations,
  selectedStation,
  isOpen,
  onToggle,
  onStationClick,
}: LineAccordionProps) => {
  const getLineColorClasses = () => {
    if (lineName === "Red") {
      return {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-400",
        dot: "bg-red-400",
      };
    }
    return {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
      dot: "bg-blue-400",
    };
  };

  const colors = getLineColorClasses();

  return (
    <div className="mb-2">
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className={`w-full text-left px-4 py-3.5 rounded-lg transition-all border ${
          isOpen
            ? `${colors.bg} ${colors.border}`
            : "bg-zinc-900/50 border-transparent hover:bg-zinc-900/70"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${colors.dot}`}></div>
            <div>
              <h3 className={`font-semibold text-base ${colors.text}`}>
                {lineName} Line
              </h3>
              <p className="text-zinc-500 text-xs mt-0.5">
                Route {route} • {stations.length} stations
              </p>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-zinc-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="mt-1 ml-7 border-l-2 border-zinc-800/50 pl-3">
          {stations.map((station, idx) => (
            <StationCard
              key={idx}
              station={station}
              isSelected={selectedStation?.name === station.name}
              onClick={() => onStationClick(station)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LineAccordion;
