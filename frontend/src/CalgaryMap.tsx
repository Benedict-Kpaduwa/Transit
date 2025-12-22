import { useState, useEffect } from "react";
import { stationApi, type Station, type RouteLine } from "@/services/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import Sidebar from "@/components/Sidebar";
import Map from "@/components/Map";
import { Train, AlertCircle, RefreshCw, MapPin } from "lucide-react";

const CalgaryMap = () => {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [stationsData, setStationsData] = useState<{
    red: Station[];
    blue: Station[];
  }>({ red: [], blue: [] });
  const [routeLines, setRouteLines] = useState<{
    red: RouteLine[];
    blue: RouteLine[];
  }>({ red: [], blue: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [stationsResult, routesResult] = await Promise.all([
        stationApi.getAllStationsByLineSorted(),
        stationApi.getAllRouteLines(),
      ]);

      setStationsData(stationsResult);
      setRouteLines(routesResult);
      setError(null);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load station data. Please try again later.");

      try {
        const fallbackStations = await stationApi.getAllStationsByLineSorted();
        setStationsData(fallbackStations);
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    const intervalId = setInterval(fetchData, 10 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const handleStationClick = (station: Station) => {
    setSelectedStation(station);
  };

  const handleCloseStationInfo = () => {
    setSelectedStation(null);
  };

  const handleRefresh = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-red-500 rounded-full blur-xl opacity-30"></div>
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700/50 shadow-2xl">
              <Train className="w-16 h-16 text-white mx-auto mb-4" />
            </div>
          </div>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent mb-4">
            Calgary Transit Network
          </h1>

          <LoadingSpinner className="w-12 h-12 mb-6 text-blue-400" />

          <div className="space-y-3">
            <p className="text-white/90 text-lg font-medium">
              Loading transit data...
            </p>
            <p className="text-gray-400 text-sm">
              Fetching real-time station information and route lines
            </p>
            <div className="flex items-center justify-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-gray-400 text-xs">Red Line</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-gray-400 text-xs">Blue Line</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-6">
        {/* Background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-red-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-lg w-full">
          <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-900/30 rounded-xl">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    Connection Error
                  </h2>
                  <p className="text-gray-400 text-sm">
                    Unable to load C-Train data
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="bg-gray-800/50 rounded-xl p-4">
                  <p className="text-red-300/90">{error}</p>
                </div>

                <div className="bg-gray-800/30 rounded-xl p-4">
                  <p className="text-gray-400 text-sm">
                    Backend endpoint:{" "}
                    <code className="bg-gray-900/50 px-2 py-1 rounded text-gray-300">
                      {import.meta.env.VITE_API_BASE_URL ||
                        "http://localhost:8000"}
                    </code>
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    Please ensure the backend server is running and accessible
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleRefresh}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group"
                >
                  <RefreshCw
                    className={`w-5 h-5 ${
                      refreshing
                        ? "animate-spin"
                        : "group-hover:rotate-180 transition-transform"
                    }`}
                  />
                  {refreshing ? "Retrying..." : "Retry Connection"}
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors duration-300"
                >
                  Reload Page
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-r from-red-900/20 via-transparent to-blue-900/20 h-1"></div>
          </div>
        </div>
      </div>
    );
  }

  const allStations = [...stationsData.red, ...stationsData.blue];
  const uniqueStations = allStations.filter(
    (station, index, self) =>
      index === self.findIndex((s) => s.name === station.name)
  );

  const allRouteLines = [...routeLines.red, ...routeLines.blue];

  return (
    <div className="relative flex flex-col lg:flex-row min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent animate-pulse"></div>
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/5 rounded-full blur-3xl"></div>

        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(to right, #4a5568 1px, transparent 1px),
                           linear-gradient(to bottom, #4a5568 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        ></div>
      </div>

      <div className="lg:hidden bg-gradient-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm border-b border-gray-700/50 p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg">
              <Train className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Calgary Transit</h1>
              <p className="text-gray-400 text-xs">Live Transit Network</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-300 text-xs">Red Line</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-gray-300 text-xs">Blue Line</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row relative z-0">
        <div className="lg:w-96 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-gray-700/50">
          <Sidebar
            redStations={stationsData.red}
            blueStations={stationsData.blue}
            selectedStation={selectedStation}
            onStationClick={handleStationClick}
            className="lg:h-full"
          />
        </div>

        <div className="flex-1 relative min-h-[70vh] lg:min-h-screen">
          <div className="absolute top-4 left-4 right-4 lg:right-auto lg:left-6 lg:top-6 flex flex-col sm:flex-row gap-3 z-10">
            <div className="bg-gradient-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {uniqueStations.length}
                    </div>
                    <div className="text-gray-400 text-xs">Stations</div>
                  </div>
                  <div className="h-8 w-px bg-gray-600/50"></div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {allRouteLines.length}
                    </div>
                    <div className="text-gray-400 text-xs">Route Segments</div>
                  </div>
                  <div className="h-8 w-px bg-gray-600/50"></div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-gray-300 text-sm">
                        {stationsData.red.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-gray-300 text-sm">
                        {stationsData.blue.length}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="lg:ml-4 px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 rounded-lg transition-all duration-300 flex items-center gap-2 text-white text-sm font-medium"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          </div>

          <div className="absolute inset-0">
            <Map
              stations={uniqueStations}
              routeLines={allRouteLines}
              selectedStation={selectedStation}
              onStationSelect={handleStationClick}
              onCloseStationInfo={handleCloseStationInfo}
            />
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="bg-gradient-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl border border-gray-700/50 p-3 shadow-lg">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-300" />
                  <span className="text-gray-300">Station</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-1 bg-gradient-to-r from-red-500 to-pink-500 rounded"></div>
                  <span className="text-gray-300">Red Line</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded"></div>
                  <span className="text-gray-300">Blue Line</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalgaryMap;
