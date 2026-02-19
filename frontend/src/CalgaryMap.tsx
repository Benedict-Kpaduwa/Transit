import { useMemo } from "react";
import Map from "@/components/Map";
import { Train, RefreshCw, MapPin, Menu } from "lucide-react";
import SplashScreen from "@/components/shared/splash-screen";
import ErrorScreen from "@/components/shared/error-screen";
import { useAllRouteLines, useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import { useSidebar } from "@/components/ui/sidebar";
import type { Station } from "@/types";

const CalgaryMap = () => {
  const {
    data: stations,
    isLoading: stationsLoading,
    isFetching: stationsFetching,
    refetch,
    error,
  } = useAllStationsByLineSorted();
  const {
    data: routeLines,
    refetch: routeLinesRefetch,
    isLoading: routeLinesLoading,
    isFetching: routeLinesFetching,
  } = useAllRouteLines();

  const isLoading = stationsLoading || routeLinesLoading;
  const isRefreshing = stationsFetching || routeLinesFetching;

  const { selectedStation, setSelectedStation } = useMapStore();
  const { toggleSidebar } = useSidebar();

  const handleRefresh = () => {
    refetch();
    routeLinesRefetch();
  };

  const handleStationClick = (station: Station) => {
    setSelectedStation(station);
  };

  const handleCloseStationInfo = () => {
    setSelectedStation(null);
  };

  const uniqueStations = useMemo(() => {
    const allStations = [...(stations?.red || []), ...(stations?.blue || [])];
    return allStations.filter(
      (station, index, self) =>
        index === self.findIndex((s) => s.name === station.name)
    );
  }, [stations]);

  const allRouteLines = useMemo(
    () => [...(routeLines?.red || []), ...(routeLines?.blue || [])],
    [routeLines]
  );

  if (isLoading) {
    return <SplashScreen />;
  }

  if (error) {
    return (
      <ErrorScreen
        error={error.message}
        handleRefresh={refetch}
        refreshing={isLoading}
      />
    );
  }

  return (
    <div className="relative flex flex-col lg:flex-row min-h-screen bg-linear-to-br from-gray-900 via-black to-gray-900 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-blue-500/20 to-transparent animate-pulse"></div>
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

      <div className="lg:hidden bg-linear-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-sm border-b border-gray-700/50 p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* New: Menu Toggle in Mobile Header */}
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-700/30 rounded-lg transition-colors mr-1"
              aria-label="Open sidebar menu"
            >
              <Menu className="size-6 text-white" />
            </button>
            <div className="p-2 bg-linear-to-br from-blue-600 to-blue-700 rounded-lg">
              <Train className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">Calgary Transit</h1>
              <p className="text-gray-400 text-[10px]">Live Network</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              <span className="text-gray-300 text-[10px] font-medium">Red</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-gray-300 text-[10px] font-medium">Blue</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 relative min-h-[70vh] lg:min-h-screen">
        <div className="absolute top-4 left-4 right-4 lg:right-auto lg:left-6 lg:top-6 flex flex-col sm:flex-row gap-3 z-10">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-3 sm:p-4 shadow-xl flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="text-center">
                  <div className="text-lg sm:text-2xl font-bold text-white leading-none">
                    {uniqueStations.length}
                  </div>
                  <div className="text-gray-400 text-[10px] sm:text-xs">Stations</div>
                </div>
                <div className="h-6 sm:h-8 w-px bg-gray-600/50"></div>
                <div className="text-center hidden sm:block">
                  <div className="text-2xl font-bold text-white leading-none">
                    {allRouteLines.length}
                  </div>
                  <div className="text-gray-400 text-xs">Route Segments</div>
                </div>
                <div className="h-8 w-px bg-gray-600/50 hidden sm:block"></div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500"></div>
                    <span className="text-gray-300 text-xs sm:text-sm">
                      {stations?.red.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-500"></div>
                    <span className="text-gray-300 text-xs sm:text-sm">
                      {stations?.blue.length}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="pointer-events-auto bg-zinc-900/90 backdrop-blur-md border border-zinc-800 text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed px-3 sm:px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 transition-all"
              >
                <RefreshCw
                  className={`size-3.5 sm:size-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
                <span className="text-xs sm:text-sm font-medium">
                  {isRefreshing ? "..." : "Refresh"}
                </span>
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

        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 w-auto px-4">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl p-2 sm:p-3 shadow-xl">
            <div className="flex items-center gap-3 sm:gap-6 text-[10px] sm:text-sm">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3 sm:size-4 text-gray-400" />
                <span className="text-gray-300 whitespace-nowrap hidden sm:inline">Station</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 sm:w-6 h-1 bg-red-500 rounded-full"></div>
                <span className="text-gray-300">Red</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 sm:w-6 h-1 bg-blue-500 rounded-full"></div>
                <span className="text-gray-300">Blue</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalgaryMap;
