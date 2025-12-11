import type { Station } from "../data/StationObject";

interface StationCardProps {
  station: Station;
  isSelected: boolean;
  onClick: () => void;
}

const StationCard = ({ station, isSelected, onClick }: StationCardProps) => {
  const getStationStatus = () => {
    return "available"; // Can be connected to real-time data later
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "text-green-400";
      case "unavailable":
        return "text-red-400";
      case "upcoming":
        return "text-amber-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <button
      id={`station-${station.name}`}
      onClick={onClick}
      className={`w-full text-left px-4 py-4 mb-1 rounded transition-all ${
        isSelected ? "bg-zinc-800/70" : "bg-transparent hover:bg-zinc-800/30"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-normal text-[15px] mb-0.5 truncate">
            {station.name}
          </h3>
          <p className="text-zinc-500 text-[13px] truncate">
            {station.line} Line {station.route}
            {station.shared && " • Free Fare"}
          </p>
        </div>

        <div className="flex-shrink-0">
          <span
            className={`text-xs font-medium ${getStatusColor(
              getStationStatus()
            )}`}
          >
            {getStationStatus()}
          </span>
        </div>
      </div>
    </button>
  );
};

export default StationCard;
