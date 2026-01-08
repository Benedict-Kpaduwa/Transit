import { create } from "zustand";
import type { Station } from "@/types";

interface MapStore {
  selectedStation: Station | null;
  setSelectedStation: (station: Station | null) => void;
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (location: { lat: number; lng: number } | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedStation: null,
  setSelectedStation: (station) => set({ selectedStation: station }),
  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),
}));
