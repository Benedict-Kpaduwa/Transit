import { create } from "zustand";
import type { Station } from "@/types";

interface MapStore {
  selectedStation: Station | null;
  setSelectedStation: (station: Station | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedStation: null,
  setSelectedStation: (station) => set({ selectedStation: station }),
}));
