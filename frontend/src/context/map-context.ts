import { createContext, useContext } from "react";
import type mapboxgl from "mapbox-gl";

interface MapContextType {
    map: mapboxgl.Map | null;
}

export const MapContext = createContext<MapContextType>({ map: null });

export function useMap() {
    const context = useContext(MapContext);
    return context;
}