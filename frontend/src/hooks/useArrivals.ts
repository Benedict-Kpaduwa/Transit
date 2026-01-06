import { useQuery } from "@tanstack/react-query";
import {
    arrivalsApi,
    vehiclesApi,
    type StopArrivalsResponse,
    type NearbyArrivalsResponse,
    type StationArrivalsResponse,
    type VehiclesResponse,
} from "@/services/api";

/**
 * Hook to fetch real-time arrivals for a specific stop
 */
export function useStopArrivals(
    stopId: string | null,
    options?: {
        limit?: number;
        route?: string;
        vehicleType?: "CTrain" | "Bus";
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<StopArrivalsResponse>({
        queryKey: ["stopArrivals", stopId, options?.route, options?.vehicleType],
        queryFn: () =>
            arrivalsApi.getStopArrivals(stopId!, {
                limit: options?.limit,
                route: options?.route,
                vehicleType: options?.vehicleType,
            }),
        enabled: !!stopId && (options?.enabled !== false),
        refetchInterval: options?.refetchInterval ?? 30000, // Refresh every 30 seconds
        staleTime: 15000, // Consider data stale after 15 seconds
    });
}

/**
 * Hook to fetch nearby stops with their arrivals
 * Like the Transit app home screen
 */
export function useNearbyArrivals(
    location: { lat: number; lng: number } | null,
    options?: {
        radius?: number;
        limitStops?: number;
        limitArrivals?: number;
        vehicleType?: "CTrain" | "Bus";
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<NearbyArrivalsResponse>({
        queryKey: [
            "nearbyArrivals",
            location?.lat,
            location?.lng,
            options?.radius,
            options?.vehicleType,
        ],
        queryFn: () =>
            arrivalsApi.getNearbyArrivals(location!.lat, location!.lng, {
                radius: options?.radius,
                limitStops: options?.limitStops,
                limitArrivals: options?.limitArrivals,
                vehicleType: options?.vehicleType,
            }),
        enabled: !!location && (options?.enabled !== false),
        refetchInterval: options?.refetchInterval ?? 30000,
        staleTime: 15000,
    });
}

/**
 * Hook to fetch arrivals for a CTrain station by name
 */
export function useStationArrivals(
    stationName: string | null,
    options?: {
        line?: "Red" | "Blue";
        limit?: number;
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<StationArrivalsResponse>({
        queryKey: ["stationArrivals", stationName, options?.line],
        queryFn: () =>
            arrivalsApi.getStationArrivals(stationName!, options?.line, options?.limit),
        enabled: !!stationName && (options?.enabled !== false),
        refetchInterval: options?.refetchInterval ?? 30000,
        staleTime: 15000,
    });
}

/**
 * Hook to fetch real-time CTrain positions
 */
export function useCTrainVehicles(
    line?: "Red" | "Blue",
    options?: {
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<VehiclesResponse>({
        queryKey: ["ctrainVehicles", line],
        queryFn: () => vehiclesApi.getCTrains(line),
        enabled: options?.enabled !== false,
        refetchInterval: options?.refetchInterval ?? 15000, // More frequent for vehicles
        staleTime: 10000,
    });
}

/**
 * Hook to fetch real-time bus positions
 */
export function useBusVehicles(
    route?: string,
    options?: {
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<VehiclesResponse>({
        queryKey: ["busVehicles", route],
        queryFn: () => vehiclesApi.getBuses(route),
        enabled: options?.enabled !== false,
        refetchInterval: options?.refetchInterval ?? 15000,
        staleTime: 10000,
    });
}

/**
 * Hook to fetch all vehicles
 */
export function useAllVehicles(
    vehicleType?: "CTrain" | "Bus",
    options?: {
        enabled?: boolean;
        refetchInterval?: number;
    }
) {
    return useQuery<VehiclesResponse>({
        queryKey: ["allVehicles", vehicleType],
        queryFn: () => vehiclesApi.getAllVehicles(vehicleType),
        enabled: options?.enabled !== false,
        refetchInterval: options?.refetchInterval ?? 15000,
        staleTime: 10000,
    });
}

/**
 * Format minutes away for display
 */
export function formatArrivalTime(minutesAway: number): string {
    if (minutesAway <= 0) return "Arriving";
    if (minutesAway === 1) return "1 min";
    if (minutesAway < 60) return `${minutesAway} min`;

    const hours = Math.floor(minutesAway / 60);
    const mins = minutesAway % 60;
    if (mins === 0) return `${hours} hr`;
    return `${hours}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Get color class based on minutes away
 */
export function getArrivalUrgencyColor(minutesAway: number): string {
    if (minutesAway <= 2) return "text-red-500";
    if (minutesAway <= 5) return "text-orange-500";
    if (minutesAway <= 10) return "text-yellow-500";
    return "text-green-500";
}

