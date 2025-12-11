import { useState } from "react";
import { stationsData, type Station } from "./data/StationObject";
import Sidebar from "./components/Sidebar";
import Map from "./components/Map";

const CalgaryMap = () => {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  const allStations = [...stationsData.red, ...stationsData.blue];
  const uniqueStations = allStations.filter(
    (station, index, self) =>
      index === self.findIndex((s) => s.name === station.name)
  );

  const handleStationClick = (station: Station) => {
    setSelectedStation(station);
  };

  const handleCloseStationInfo = () => {
    setSelectedStation(null);
  };

  return (
    <div className="flex flex-row items-center h-screen bg-[#0a0a0a]">
      <Sidebar
        redStations={stationsData.red}
        blueStations={stationsData.blue}
        selectedStation={selectedStation}
        onStationClick={handleStationClick}
      />

      <Map
        stations={[...stationsData.red, ...stationsData.blue]}
        selectedStation={selectedStation}
        onStationSelect={handleStationClick}
        onCloseStationInfo={handleCloseStationInfo}
      />
    </div>
  );
};

export default CalgaryMap;
