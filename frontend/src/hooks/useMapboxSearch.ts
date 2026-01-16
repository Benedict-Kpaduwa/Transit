import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { searchLocations, retrieveLocation, type SearchOptions } from "@/lib/mapbox/api";
import type { LocationSuggestion, LocationFeature } from "@/lib/mapbox/utils";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";

/**
 * Hook for Mapbox location search (suggestions)
 * Uses TanStack Query for caching and automatic refetch management
 */
export function useLocationSearch(
    query: string,
    options?: {
        country?: string;
        limit?: number;
        proximity?: [number, number];
        enabled?: boolean;
    }
) {
    const { enabled = true, country, limit, proximity } = options || {};

    return useQuery<LocationSuggestion[], Error>({
        queryKey: ["mapbox-search", query, country, limit, proximity],
        queryFn: async () => {
            const searchOptions: SearchOptions = {
                query,
                country: country ?? MAP_CONSTANTS.SEARCH.DEFAULT_COUNTRY,
                limit: limit ?? MAP_CONSTANTS.SEARCH.DEFAULT_LIMIT,
                proximity: proximity ?? MAP_CONSTANTS.SEARCH.DEFAULT_PROXIMITY,
            };
            return searchLocations(searchOptions);
        },
        enabled: enabled && query.trim().length >= 2, // Only search when at least 2 chars
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
        gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
        retry: 1, // Retry once on failure
    });
}

/**
 * Hook for Mapbox location retrieval (get full details from suggestion)
 */
export function useLocationRetrieve(
    mapboxId: string | null,
    options?: {
        enabled?: boolean;
    }
) {
    const { enabled = true } = options || {};

    return useQuery<LocationFeature[], Error>({
        queryKey: ["mapbox-retrieve", mapboxId],
        queryFn: () => retrieveLocation(mapboxId!),
        enabled: enabled && !!mapboxId,
        staleTime: 1000 * 60 * 30, // Cache for 30 minutes (location details rarely change)
        gcTime: 1000 * 60 * 60, // Keep in cache for 1 hour
    });
}

/**
 * Mutation hook for retrieving location details
 * Use this when you need to retrieve location on-demand (e.g., on selection)
 */
export function useRetrieveLocationMutation() {
    const queryClient = useQueryClient();

    return useMutation<LocationFeature[], Error, string>({
        mutationFn: (mapboxId: string) => retrieveLocation(mapboxId),
        onSuccess: (data, mapboxId) => {
            // Cache the result for future queries
            queryClient.setQueryData(["mapbox-retrieve", mapboxId], data);
        },
    });
}

// Re-export types for convenience
export type { LocationSuggestion, LocationFeature };
