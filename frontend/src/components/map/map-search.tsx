import { useState, useCallback } from "react";
import { Loader, MapPin, X } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/useDebounce";
import { useMap } from "@/context/map-context";
import { cn } from "@/lib/utils";
import { iconMap } from "@/lib/mapbox/utils";
import type { LocationFeature, LocationSuggestion } from "@/lib/mapbox/utils";
import { MAP_CONSTANTS } from "@/lib/mapbox/constants";
import { LocationMarker } from "../location-marker";
import { LocationPopup } from "../location-popup";
import { useLocationSearch, useRetrieveLocationMutation } from "@/hooks/useMapboxSearch";
import { useMapStore } from "@/stores/useMapStore";

interface MapSearchProps {
  onGetDirections?: (destination: {
    name: string;
    address: string;
    coordinates: [number, number];
  }) => void;
  onClear?: () => void;
  onSelect?: (location: LocationFeature) => void;
  className?: string;
}

export default function MapSearch({ onGetDirections, onClear, onSelect, className }: MapSearchProps) {
  const { map: contextMap } = useMap();
  const { 
    mapInstance: storeMap, 
    selectedLocations, 
    setSelectedLocations,
    searchResult,
    setSearchResult 
  } = useMapStore();
  
  const map = contextMap || storeMap;
  
  const [query, setQuery] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);

  const debouncedQuery = useDebounce(query, MAP_CONSTANTS.SEARCH.DEBOUNCE_MS);

  // Use TanStack Query for location search
  const { 
    data: results = [], 
    isLoading: isSearching, 
    error 
  } = useLocationSearch(debouncedQuery, {
    enabled: isOpen && debouncedQuery.trim().length >= 2,
  });

  // Use mutation for retrieving location details
  const retrieveLocationMutation = useRetrieveLocationMutation();

  // Handle input change
  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    setDisplayValue(value);
    if (value.trim()) {
      setIsOpen(true);
    }
  }, []);

  // Handle location selection
  const handleSelect = useCallback(
    async (suggestion: LocationSuggestion) => {
      if (!map) return;

      setIsRetrieving(true);

      try {
        const features = await retrieveLocationMutation.mutateAsync(suggestion.mapbox_id);

        if (features.length === 0) {
          console.error("No location details found");
          return;
        }

        const [feature] = features;
        const coordinates = feature.geometry.coordinates;

        map.flyTo({
          center: coordinates,
          zoom: MAP_CONSTANTS.FLY_TO.ZOOM,
          speed: MAP_CONSTANTS.FLY_TO.SPEED,
          curve: MAP_CONSTANTS.FLY_TO.CURVE,
          duration: MAP_CONSTANTS.FLY_TO.DURATION,
          essential: true,
        });

        setDisplayValue(suggestion.name);
        setSelectedLocations(features);
        setSearchResult(feature);
        setIsOpen(false);
        
        // Trigger onSelect callback if provided
        if (onSelect) {
          onSelect(feature);
        }
      } catch (err) {
        console.error("Retrieve error:", err);
      } finally {
        setIsRetrieving(false);
      }
    },
    [map, retrieveLocationMutation]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setQuery("");
    setDisplayValue("");
    setIsOpen(false);
    setSearchResult(null);
    setSelectedLocations([]);
    
    // Call onClear callback to reset map
    onClear?.();
  }, [onClear, setSearchResult, setSelectedLocations]);

  const hasResults = results.length > 0;
  const showEmptyState =
    isOpen && !isSearching && query.trim() && !hasResults && !error;
  const isLoading = isSearching || isRetrieving;

  return (
    <>
      <section className={cn("z-10", className || "absolute top-4 left-1/2 -translate-x-1/2 w-[min(90vw,440px)] rounded-lg shadow-lg")}>
        <Command className="rounded-lg">
          <div
            className={cn(
              "w-full flex items-center justify-between px-3 gap-1",
              isOpen && "border-b"
            )}
          >
            <CommandInput
              placeholder="Search locations..."
              value={displayValue}
              onValueChange={handleInputChange}
              className="flex-1"
            />
            {displayValue && !isLoading && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="-m-1.5 p-1.5 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
            {isLoading && (
              <Loader
                className="size-4 shrink-0 text-primary animate-spin"
                aria-label="Searching"
              />
            )}
          </div>

          {isOpen && (
            <CommandList className="max-h-60 overflow-y-auto">
              {error ? (
                <CommandEmpty className="py-6 text-center">
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <p className="text-sm font-medium text-destructive">
                      Error occurred
                    </p>
                    <p className="text-xs text-muted-foreground">{error.message}</p>
                  </div>
                </CommandEmpty>
              ) : showEmptyState ? (
                <CommandEmpty className="py-6 text-center">
                  <div className="flex flex-col items-center justify-center space-y-1">
                    <p className="text-sm font-medium">No locations found</p>
                    <p className="text-xs text-muted-foreground">
                      Try a different search term
                    </p>
                  </div>
                </CommandEmpty>
              ) : hasResults ? (
                <CommandGroup>
                  {results.map((location) => (
                    <CommandItem
                      key={location.mapbox_id}
                      onSelect={() => handleSelect(location)}
                      value={`${location.name} ${location.place_formatted} ${location.mapbox_id}`}
                      className="flex items-center py-3 px-2 cursor-pointer hover:bg-accent rounded-md"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="bg-primary/10 p-1.5 rounded-full shrink-0">
                          {location.maki && iconMap[location.maki] ? (
                            iconMap[location.maki]
                          ) : (
                            <MapPin className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">
                            {location.name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {location.place_formatted}
                          </span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          )}
        </Command>
      </section>
    </>
  );
}
