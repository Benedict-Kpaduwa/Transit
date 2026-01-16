import { useQuery, useMutation } from "@tanstack/react-query";
import { stationApi, ctrainApi, busStopApi, vehiclesApi, tripPlannerApi, type Vehicle, type GeocodingResult, type TripPlan, type NearbyStop } from "@/services/api";

export const useAllStations = () => {
  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ["stations"],
    queryFn: stationApi.getAllStations,
  });

  return { data, isLoading, error, refetch, isError };
};

export const useSortedStations = (line?: "Red" | "Blue") => {
  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ["sorted-stations", line],
    queryFn: () => stationApi.getSortedStations(line),
  });

  return { data, isLoading, error, refetch, isError };
};

export const useRouteLines = (line?: "Red" | "Blue") => {
  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ["route-lines", line],
    queryFn: () => stationApi.getRouteLines(line),
  });

  return { data, isLoading, error, refetch, isError };
};

export const useAllStationsByLineSorted = () => {
  const { data, isLoading, error, refetch, isError, isFetching } = useQuery({
    queryKey: ["all-stations-by-line-sorted"],
    queryFn: stationApi.getAllStationsByLineSorted,
  });

  return { data, isLoading, error, refetch, isError, isFetching };
};

export const useAllRouteLines = () => {
  const { data, isLoading, error, refetch, isError, isFetching } = useQuery({
    queryKey: ["all-route-lines"],
    queryFn: stationApi.getAllRouteLines,
  });

  return { data, isLoading, error, refetch, isError, isFetching };
};

export const useTestConnection = () => {
  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ["test-connection"],
    queryFn: stationApi.testConnection,
  });

  return { data, isLoading, error, refetch, isError };
};

// ==================== C-Train Real-Time Position Hooks ====================

/**
 * Fetch all real-time C-Train positions
 * Auto-refreshes every 10 seconds by default
 */
export const useCTrainPositions = (
  line?: "RED" | "BLUE",
  options?: { refetchInterval?: number; enabled?: boolean }
) => {
  const { refetchInterval = 10000, enabled = true } = options || {};

  const { data, isLoading, error, refetch, isError, isFetching } = useQuery({
    queryKey: ["ctrain-positions", line],
    queryFn: () => ctrainApi.getPositions(line),
    refetchInterval,
    enabled,
    staleTime: 5000, // Data is considered fresh for 5 seconds
  });

  return { data, isLoading, error, refetch, isError, isFetching };
};

/**
 * Fetch C-Train positions grouped by line
 * Auto-refreshes every 10 seconds by default
 */
export const useCTrainPositionsByLine = (options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) => {
  const { refetchInterval = 10000, enabled = true } = options || {};

  const { data, isLoading, error, refetch, isError, isFetching } = useQuery({
    queryKey: ["ctrain-positions-by-line"],
    queryFn: ctrainApi.getAllPositionsByLine,
    refetchInterval,
    enabled,
    staleTime: 5000,
  });

  return { data, isLoading, error, refetch, isError, isFetching };
};

/**
 * Fetch Red Line C-Train positions
 */
export const useRedLineCTrains = (options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) => {
  return useCTrainPositions("RED", options);
};

/**
 * Fetch Blue Line C-Train positions
 */
export const useBlueLineCTrains = (options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) => {
  return useCTrainPositions("BLUE", options);
};

// ==================== Bus Stops Hooks ====================

/**
 * Fetch all bus stops
 * This data is static so we cache it longer
 */
export const useBusStops = (options?: { enabled?: boolean }) => {
  const { enabled = true } = options || {};

  const { data, isLoading, error, refetch, isError } = useQuery({
    queryKey: ["bus-stops"],
    queryFn: busStopApi.getAllStops,
    enabled,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (static data)
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  });

  return { data, isLoading, error, refetch, isError };
};

// ==================== Bus Real-Time Position Hooks ====================

/**
 * Fetch real-time bus positions
 * Auto-refreshes every 10 seconds
 */
export const useBusPositions = (
  route?: string,
  options?: { refetchInterval?: number; enabled?: boolean }
) => {
  const { refetchInterval = 10000, enabled = true } = options || {};

  const { data, isLoading, error, refetch, isError, isFetching } = useQuery({
    queryKey: ["bus-positions", route],
    queryFn: () => vehiclesApi.getBuses(route),
    refetchInterval,
    enabled,
    staleTime: 5000,
  });

  return { data, isLoading, error, refetch, isError, isFetching };
};

// Re-export Vehicle type for use in components
export type { Vehicle };

// ==================== Geocoding & Trip Planning Hooks ====================

/**
 * Hook to geocode an address/place name
 * Uses the debounced query to avoid excessive API calls
 */
export const useGeocode = (
  query: string,
  proximity?: { lng: number; lat: number } | null,
  options?: { enabled?: boolean }
) => {
  const { enabled = true } = options || {};

  return useQuery<GeocodingResult[]>({
    queryKey: ["geocode", query, proximity?.lng, proximity?.lat],
    queryFn: () =>
      tripPlannerApi.geocode(
        query,
        proximity ? { lng: proximity.lng, lat: proximity.lat } : undefined
      ),
    enabled: enabled && query.length >= 2, // Only search when query is at least 2 chars
    staleTime: 1000 * 60 * 5, // Cache results for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  });
};

/**
 * Hook to find nearby transit stops
 */
export const useNearbyStops = (
  location: { lat: number; lng: number } | null,
  options?: {
    limit?: number;
    maxDistance?: number;
    stopType?: "LRT" | "BUS";
    enabled?: boolean;
  }
) => {
  const { enabled = true, ...apiOptions } = options || {};

  return useQuery<NearbyStop[]>({
    queryKey: ["nearby-stops", location?.lat, location?.lng, apiOptions],
    queryFn: () =>
      tripPlannerApi.findNearbyStops(location!.lat, location!.lng, apiOptions),
    enabled: enabled && !!location,
    staleTime: 1000 * 60, // Cache for 1 minute
  });
};

/**
 * Hook to plan a trip between two locations
 */
export const usePlanTrip = (
  origin: { lng: number; lat: number } | null,
  destination: { lng: number; lat: number } | null,
  options?: {
    preferLrt?: boolean;
    enabled?: boolean;
  }
) => {
  const { preferLrt = true, enabled = true } = options || {};

  return useQuery<TripPlan>({
    queryKey: ["trip-plan", origin?.lng, origin?.lat, destination?.lng, destination?.lat, preferLrt],
    queryFn: () => tripPlannerApi.planTrip(origin!, destination!, preferLrt),
    enabled: enabled && !!origin && !!destination,
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });
};

// Re-export types for convenience
export type { GeocodingResult, TripPlan, NearbyStop };

// ==================== Mutation Hooks ====================

/**
 * Mutation hook for planning a trip
 * Use this when you need to trigger trip planning on-demand (e.g., button click)
 */
export const usePlanTripMutation = () => {
  return useMutation<
    TripPlan,
    Error,
    { origin: { lng: number; lat: number }; destination: { lng: number; lat: number }; preferLrt?: boolean }
  >({
    mutationFn: ({ origin, destination, preferLrt = true }) =>
      tripPlannerApi.planTrip(origin, destination, preferLrt),
  });
};
