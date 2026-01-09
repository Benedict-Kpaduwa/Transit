import { useQuery } from "@tanstack/react-query";
import { stationApi, ctrainApi, busStopApi, vehiclesApi, type Vehicle } from "@/services/api";

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

