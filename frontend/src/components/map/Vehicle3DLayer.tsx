import { useEffect, useRef, useCallback } from "react";
import { ThreeVehicleLayer, type VehiclePosition } from "./three-layer/ThreeVehicleLayer";

interface Vehicle3DLayerProps {
    map: mapboxgl.Map | null;
    vehicles: Array<{
        id: string;
        lng: number;
        lat: number;
        bearing: number;
        vehicleType: "CTrain" | "Bus";
        color?: string;
    }>;
}

export default function Vehicle3DLayer({ map, vehicles }: Vehicle3DLayerProps) {
    const layerRef = useRef<ThreeVehicleLayer | null>(null);
    const vehiclesRef = useRef(vehicles);
    const layerId = "vehicle-3d-layer";

    // Keep vehicles ref updated
    vehiclesRef.current = vehicles;

    // Convert vehicles to positions
    const getPositions = useCallback((): VehiclePosition[] => {
        return vehiclesRef.current.map(v => ({
            id: v.id,
            lng: v.lng,
            lat: v.lat,
            bearing: v.bearing,
            vehicleType: v.vehicleType,
            line: v.vehicleType === "CTrain" 
                ? (v.color?.includes("dc2626") || v.color?.includes("DC2626") ? "red" : "blue") 
                : undefined,
        }));
    }, []);

    // Create and add layer function
    const createAndAddLayer = useCallback(() => {
        if (!map) return;

        // Remove existing layer if present
        if (map.getLayer(layerId)) {
            try {
                map.removeLayer(layerId);
            } catch (e) { /* ignore */ }
        }

        // Create fresh layer instance
        const layer = new ThreeVehicleLayer(layerId);
        layerRef.current = layer;

        // Add to map
        map.addLayer(layer);

        // Populate with current vehicle data after a short delay to let models load
        setTimeout(() => {
            if (layerRef.current) {
                layerRef.current.updateData(getPositions());
            }
        }, 500);
    }, [map, getPositions]);

    // Initialize and handle style changes
    useEffect(() => {
        if (!map) return;

        const handleStyleLoad = () => {
            // Style changed, need to re-create the layer
            createAndAddLayer();
        };

        // Initial setup
        if (map.isStyleLoaded()) {
            createAndAddLayer();
        } else {
            map.once("style.load", createAndAddLayer);
        }

        // Listen for subsequent style changes
        map.on("style.load", handleStyleLoad);

        return () => {
            map.off("style.load", handleStyleLoad);
            if (map.getLayer(layerId)) {
                try {
                    map.removeLayer(layerId);
                } catch (e) { /* ignore */ }
            }
            layerRef.current = null;
        };
    }, [map, createAndAddLayer]);

    // Update vehicle positions
    useEffect(() => {
        if (!layerRef.current || !map) return;
        layerRef.current.updateData(getPositions());
    }, [vehicles, map, getPositions]);

    return null;
}
