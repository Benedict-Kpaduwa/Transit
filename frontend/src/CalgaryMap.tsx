import { useMemo, useEffect, useCallback } from "react";
import Map from "@/components/Map";
import { RefreshCw, ArrowLeft, Navigation } from "lucide-react";
import SplashScreen from "@/components/shared/splash-screen";
import ErrorScreen from "@/components/shared/error-screen";
import { useAllRouteLines, useAllStationsByLineSorted } from "@/hooks/queries";
import { useMapStore } from "@/stores/useMapStore";
import { MobileDashboard } from "@/components/mobile-dashboard";
import MapSearch from "@/components/map/map-search";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";
import type { Station } from "@/types";
import { useIsMobile } from "@/hooks/use-mobile";

const CalgaryMap = () => {
  const isMobile = useIsMobile();
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

  const {
    selectedStation,
    setSelectedStation,
    mobileView,
    setMobileView,
    trackedVehicle,
    showLiveBuses,
    showLiveTrains,
    resetMapToggles,
    mapInstance,
    setShowTrainLines,
  } = useMapStore();

  const handleClearSearch = useCallback(() => {
    setShowTrainLines(false);
    mapInstance?.flyTo({
      center: MAP_CONSTANTS.CENTER,
      zoom: MAP_CONSTANTS.DEFAULT_ZOOM,
      pitch: MAP_CONSTANTS.DEFAULT_PITCH,
      bearing: 0,
      speed: 1.2,
      curve: 1.42,
      essential: true,
    });
  }, [mapInstance, setShowTrainLines]);

  // Auto-switch to map view if something is selected/tracked
  useEffect(() => {
    if (isMobile && (selectedStation || trackedVehicle || showLiveBuses || showLiveTrains)) {
      setMobileView("map");
    }
  }, [selectedStation, trackedVehicle, showLiveBuses, showLiveTrains, isMobile, setMobileView]);

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
        error={error instanceof Error ? error.message : "An unknown error occurred"}
        handleRefresh={refetch}
        refreshing={isLoading}
      />
    );
  }

  return (
    <div className="relative flex flex-col lg:flex-row h-dvh w-full bg-linear-to-br from-gray-900 via-black to-gray-900 overflow-hidden">
      {/* Background patterns */}
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

      {/* Mobile Dashboard - Rendered on top of map when in 'home' view */}
      {isMobile && mobileView === "home" && (
        <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black">
          <MobileDashboard />
        </div>
      )}

      {/* Mobile Header - Always visible when Map is active on mobile */}
      {isMobile && mobileView === "map" && (
        <div className="lg:hidden shrink-0 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900/50 p-4 pt-safe-4 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back to Home Button on Map View */}
              <button
                onClick={() => { resetMapToggles(); setMobileView("home"); }}
                className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors mr-1"
                aria-label="Back to home"
              >
                <ArrowLeft className="size-5 text-white" />
              </button>
              <div className="p-2 bg-linear-to-br from-zinc-800 to-zinc-900 rounded-lg">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white leading-none">Map View</h1>
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Live Network</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-red-400 text-[10px] font-black uppercase">Red</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-blue-400 text-[10px] font-black uppercase">Blue</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative min-h-0 h-full">
        {!isMobile && (
          <div className="absolute top-4 left-4 xl:left-6 xl:top-6 flex flex-col gap-2 z-10">
            <div className="bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-2.5 lg:p-3 xl:p-4 shadow-2xl flex items-center gap-3 lg:gap-4 xl:gap-6">
              <div className="flex items-center gap-2.5 lg:gap-3 xl:gap-4">
                <div className="flex items-center gap-2 lg:gap-2.5 xl:gap-3">
                  <div className="text-center">
                    <div className="text-base lg:text-lg xl:text-2xl font-black text-white leading-none">
                      {uniqueStations.length}
                    </div>
                    <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Stations</div>
                  </div>
                  <div className="h-6 xl:h-8 w-px bg-zinc-800"></div>
                  <div className="text-center hidden xl:block">
                    <div className="text-2xl font-black text-white leading-none">
                      {allRouteLines.length}
                    </div>
                    <div className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Segments</div>
                  </div>
                  <div className="h-8 w-px bg-zinc-800 hidden xl:block"></div>
                  <div className="flex items-center gap-2 lg:gap-3 xl:gap-4">
                    <div className="flex items-center gap-1.5 xl:gap-2">
                      <div className="w-2.5 h-2.5 xl:w-3 xl:h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                      <span className="text-zinc-300 text-xs xl:text-sm font-bold">
                        {stations?.red.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 xl:gap-2">
                      <div className="w-2.5 h-2.5 xl:w-3 xl:h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                      <span className="text-zinc-300 text-xs xl:text-sm font-bold">
                        {stations?.blue.length}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="pointer-events-auto bg-zinc-900/90 backdrop-blur-md border border-zinc-800 text-zinc-100 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 lg:px-3 xl:px-4 py-2 lg:py-2.5 rounded-xl shadow-xl flex items-center gap-2 transition-all active:scale-95"
                >
                  <RefreshCw
                    className={`size-3.5 xl:size-4 text-blue-400 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  <span className="text-xs xl:text-sm font-black uppercase tracking-wider">
                    {isRefreshing ? "..." : "Sync"}
                  </span>
                </button>
              </div>
            </div>
            <MapSearch
              onClear={handleClearSearch}
              className="w-full rounded-lg shadow-lg"
            />
          </div>
        )}

        <div className="absolute inset-0">
          <Map
            stations={uniqueStations}
            routeLines={allRouteLines}
            selectedStation={selectedStation}
            onStationSelect={handleStationClick}
            onCloseStationInfo={handleCloseStationInfo}
          />
        </div>
      </div>
    </div>
  );
};

export default CalgaryMap;
