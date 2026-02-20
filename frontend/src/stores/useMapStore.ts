import { create } from "zustand";
import type { Station } from "@/types";
import type { LocationFeature } from "@/lib/mapbox/utils";

interface FocusedVehicle {
  vehicleId: string;
  line: "Red" | "Blue";
  tripId?: string;
}

interface TrackedVehicle {
  tripId: string;
  vehicleId: string | null;
  vehicleType: "CTrain" | "Bus";
  line?: "Red" | "Blue"; // For CTrains
  routeId?: string; // For fetching route shape
  routeShortName: string;
  headsign: string;
  color?: string;
}

interface MapStore {
  selectedStation: Station | null;
  setSelectedStation: (station: Station | null) => void;
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (location: { lat: number; lng: number } | null) => void;
  focusedVehicle: FocusedVehicle | null;
  setFocusedVehicle: (vehicle: FocusedVehicle | null) => void;
  trackedVehicle: TrackedVehicle | null;
  setTrackedVehicle: (vehicle: TrackedVehicle | null) => void;
  // Live vehicle visibility toggles
  showLiveBuses: boolean;
  setShowLiveBuses: (show: boolean) => void;
  showLiveTrains: boolean;
  setShowLiveTrains: (show: boolean) => void;
  showBusStops: boolean;
  setShowBusStops: (show: boolean) => void;
  showTrainLines: boolean;
  setShowTrainLines: (show: boolean) => void;
  // Mobile UI state
  mobileView: "home" | "map";
  setMobileView: (view: "home" | "map") => void;
  resetMapToggles: () => void;
  // Global Map Instance access
  mapInstance: mapboxgl.Map | null;
  setMapInstance: (map: mapboxgl.Map | null) => void;
  // Search results state
  selectedLocations: LocationFeature[];
  setSelectedLocations: (locations: LocationFeature[]) => void;
  searchResult: LocationFeature | null;
  setSearchResult: (location: LocationFeature | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedStation: null,
  setSelectedStation: (station) => set({ selectedStation: station }),
  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),
  focusedVehicle: null,
  setFocusedVehicle: (vehicle) => set({ focusedVehicle: vehicle }),
  trackedVehicle: null,
  setTrackedVehicle: (vehicle) => set({ trackedVehicle: vehicle }),
  // Live vehicle visibility toggles - off by default
  showLiveBuses: false,
  setShowLiveBuses: (show) => set({ showLiveBuses: show }),
  showLiveTrains: false,
  setShowLiveTrains: (show) => set({ showLiveTrains: show }),
  showBusStops: false,
  setShowBusStops: (show) => set({ showBusStops: show }),
  showTrainLines: false,
  setShowTrainLines: (show) => set({ showTrainLines: show }),
  mobileView: "home",
  setMobileView: (view) => set({ mobileView: view }),
  resetMapToggles: () => set({
    showLiveBuses: false,
    showLiveTrains: false,
    showBusStops: false,
    showTrainLines: false,
    selectedStation: null,
    trackedVehicle: null,
    focusedVehicle: null
  }),
  mapInstance: null,
  setMapInstance: (map) => set({ mapInstance: map }),
  selectedLocations: [],
  setSelectedLocations: (locations) => set({ selectedLocations: locations }),
  searchResult: null,
  setSearchResult: (location) => set({ searchResult: location }),
}));
