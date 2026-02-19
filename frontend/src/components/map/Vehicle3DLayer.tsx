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
    isVisible: boolean;
}

export default function Vehicle3DLayer({ map, vehicles, isVisible }: Vehicle3DLayerProps) {
    const layerRef = useRef<ThreeVehicleLayer | null>(null);
    const vehiclesRef = useRef(vehicles);
    const timeoutRef = useRef<any>(null);
    const isMounted = useRef(true);
    const layerId = "vehicle-3d-layer";

    // Keep vehicles ref updated
    vehiclesRef.current = vehicles;

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

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
        if (!map || !isVisible) return;

        // Remove existing layer if present
        if (map.getLayer(layerId)) {
            try {
                map.removeLayer(layerId);
            } catch (e) { /* ignore */ }
        }

        // Create fresh layer instance
        const layer = new ThreeVehicleLayer(layerId);
        layerRef.current = layer;

        try {
            // Add to map
            map.addLayer(layer);

            // Populate with current vehicle data after a short delay to let models load
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                if (isMounted.current && layerRef.current && isVisible) {
                    layerRef.current.updateData(getPositions());
                }
            }, 500);
        } catch (e) {
            console.error("Error adding 3D vehicle layer:", e);
        }
    }, [map, getPositions, isVisible]);

    // Handle visibility changes independent of style loads
    useEffect(() => {
        if (!map) return;

        if (isVisible) {
            if (!map.getLayer(layerId)) {
                createAndAddLayer();
            }
        } else {
            if (map.getLayer(layerId)) {
                try {
                    map.removeLayer(layerId);
                } catch (e) { /* ignore */ }
            }
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            layerRef.current = null;
        }
    }, [map, isVisible, createAndAddLayer]);

    // Initialize and handle style changes
    useEffect(() => {
        if (!map) return;

        const handleStyleLoad = () => {
            // Style changed, need to re-create the layer IF it should be visible
            if (isVisible) {
                createAndAddLayer();
            }
        };

        // Listen for subsequent style changes
        map.on("style.load", handleStyleLoad);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            map.off("style.load", handleStyleLoad);
            if (map.getLayer(layerId)) {
                try {
                    map.removeLayer(layerId);
                } catch (e) { /* ignore */ }
            }
            layerRef.current = null;
        };
    }, [map, createAndAddLayer, isVisible]);

    // Update vehicle positions
    useEffect(() => {
        if (!layerRef.current || !map || !isMounted.current || !isVisible) return;
        layerRef.current.updateData(getPositions());
    }, [vehicles, map, getPositions, isVisible]);

    return null;
}
