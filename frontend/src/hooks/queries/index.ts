import { useQuery } from "@tanstack/react-query";
import { stationApi } from "@/services/api";

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
