import { useState, useCallback, useEffect, useRef } from "react";
import {
  Navigation,
  MapPin,
  Search,
  X,
  Loader2,
  Train,
  Footprints,
  Clock,
  ChevronRight,
  LocateFixed,
  Bus,
} from "lucide-react";
import {
  tripPlannerApi,
  type GeocodingResult,
  type TripPlan,
  type TripSegment,
} from "@/services/api";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

interface TripPlannerProps {
  userLocation: { lng: number; lat: number } | null;
  onRouteCalculated: (tripPlan: TripPlan) => void;
  onClearRoute: () => void;
  externalDestination?: {
    name: string;
    address: string;
    coordinates: [number, number];
  } | null;
  onClearExternalDestination?: () => void;
}

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: GeocodingResult) => void;
  onUseCurrentLocation?: () => void;
  icon: React.ReactNode;
  isCurrentLocation?: boolean;
  suggestions: GeocodingResult[];
  isLoading: boolean;
  showSuggestions: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

function LocationInput({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  onUseCurrentLocation,
  icon,
  isCurrentLocation,
  suggestions,
  isLoading,
  showSuggestions,
  onFocus,
  onBlur,
}: LocationInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <label className="text-xs font-medium text-zinc-400 mb-1 block">
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          {icon}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={isCurrentLocation ? "Current Location" : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={isCurrentLocation}
          className={cn(
            "w-full pl-10 pr-10 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all",
            isCurrentLocation && "text-blue-400"
          )}
        />
        {onUseCurrentLocation && !isCurrentLocation && (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-blue-400 transition-colors"
            title="Use current location"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        )}
        {isCurrentLocation && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Searching...</span>
            </div>
          ) : (
            suggestions.map((result, index) => (
              <button
                key={index}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(result);
                }}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
              >
                <MapPin className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {result.name}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    {result.place_name}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TripSegmentCard({
  segment,
  isLast,
}: {
  segment: TripSegment;
  isLast: boolean;
}) {
  const isWalk = segment.type === "walk";
  const isTrain = segment.vehicle_type === "CTrain";

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-5 top-12 w-0.5 h-[calc(100%-1rem)]",
            isWalk ? "bg-zinc-600" : "bg-linear-to-b",
            !isWalk && segment.color === "#DC143C" && "from-red-500 to-red-500",
            !isWalk &&
              segment.color === "#0088FF" &&
              "from-blue-500 to-blue-500",
            !isWalk &&
              segment.color === "#22c55e" &&
              "from-green-500 to-green-500"
          )}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
            isWalk
              ? "bg-zinc-700"
              : isTrain
              ? segment.color === "#DC143C"
                ? "bg-red-500"
                : "bg-blue-500"
              : "bg-green-500"
          )}
        >
          {isWalk ? (
            <Footprints className="w-5 h-5 text-white" />
          ) : isTrain ? (
            <Train className="w-5 h-5 text-white" />
          ) : (
            <Bus className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pb-4">
          <p className="text-sm font-medium text-white">
            {segment.instruction}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
            {segment.duration && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {Math.round(segment.duration / 60)} min
              </span>
            )}
            {segment.distance && (
              <span>
                {segment.distance < 1000
                  ? `${segment.distance} m`
                  : `${(segment.distance / 1000).toFixed(1)} km`}
              </span>
            )}
            {segment.num_stops && <span>{segment.num_stops} stops</span>}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {segment.from.name} → {segment.to.name}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TripPlanner({
  userLocation,
  onRouteCalculated,
  onClearRoute,
  externalDestination,
  onClearExternalDestination,
}: TripPlannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCoords, setOriginCoords] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [destCoords, setDestCoords] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [useCurrentLocationForOrigin, setUseCurrentLocationForOrigin] =
    useState(false);

  const [originSuggestions, setOriginSuggestions] = useState<GeocodingResult[]>(
    []
  );
  const [destSuggestions, setDestSuggestions] = useState<GeocodingResult[]>([]);
  const [isLoadingOrigin, setIsLoadingOrigin] = useState(false);
  const [isLoadingDest, setIsLoadingDest] = useState(false);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);

  const debouncedOriginQuery = useDebounce(originQuery, 300);
  const debouncedDestQuery = useDebounce(destQuery, 300);

  // Handle external destination (from "Get Directions" button)
  useEffect(() => {
    if (externalDestination) {
      // Set destination
      setDestQuery(externalDestination.address || externalDestination.name);
      setDestCoords({
        lng: externalDestination.coordinates[0],
        lat: externalDestination.coordinates[1],
      });
      
      // Auto-set origin to current location if available
      if (userLocation) {
        setUseCurrentLocationForOrigin(true);
        setOriginCoords(userLocation);
      }
      
      // Expand the trip planner
      setIsExpanded(true);
      
      // Clear the external destination
      onClearExternalDestination?.();
    }
  }, [externalDestination, userLocation, onClearExternalDestination]);

  // Geocode origin query
  useEffect(() => {
    if (!debouncedOriginQuery || useCurrentLocationForOrigin) {
      return;
    }

    let cancelled = false;

    const searchOrigin = async () => {
      setIsLoadingOrigin(true);
      const results = await tripPlannerApi.geocode(
        debouncedOriginQuery,
        userLocation
          ? { lng: userLocation.lng, lat: userLocation.lat }
          : undefined
      );
      if (!cancelled) {
        setOriginSuggestions(results);
        setIsLoadingOrigin(false);
      }
    };

    searchOrigin();

    return () => {
      cancelled = true;
    };
  }, [debouncedOriginQuery, userLocation, useCurrentLocationForOrigin]);

  // Geocode destination query
  useEffect(() => {
    // Skip if no query
    if (!debouncedDestQuery) {
      return;
    }

    let cancelled = false;

    const searchDest = async () => {
      setIsLoadingDest(true);
      const results = await tripPlannerApi.geocode(
        debouncedDestQuery,
        userLocation
          ? { lng: userLocation.lng, lat: userLocation.lat }
          : undefined
      );
      if (!cancelled) {
        setDestSuggestions(results);
        setIsLoadingDest(false);
      }
    };

    searchDest();

    return () => {
      cancelled = true;
    };
  }, [debouncedDestQuery, userLocation]);

  const handleUseCurrentLocation = useCallback(() => {
    if (userLocation) {
      setUseCurrentLocationForOrigin(true);
      setOriginCoords(userLocation);
      setOriginQuery("");
      setOriginSuggestions([]);
    }
  }, [userLocation]);

  const handleOriginSelect = useCallback((result: GeocodingResult) => {
    setOriginQuery(result.name);
    setOriginCoords({ lng: result.coordinates[0], lat: result.coordinates[1] });
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    setUseCurrentLocationForOrigin(false);
  }, []);

  const handleDestSelect = useCallback((result: GeocodingResult) => {
    setDestQuery(result.name);
    setDestCoords({ lng: result.coordinates[0], lat: result.coordinates[1] });
    setDestSuggestions([]);
    setShowDestSuggestions(false);
  }, []);

  const handlePlanTrip = useCallback(async () => {
    const origin = useCurrentLocationForOrigin ? userLocation : originCoords;
    if (!origin || !destCoords) return;

    setIsPlanning(true);
    setTripPlan(null);

    const result = await tripPlannerApi.planTrip(origin, destCoords, true);
    setTripPlan(result);
    setIsPlanning(false);

    if (result.success) {
      onRouteCalculated(result);
    }
  }, [
    originCoords,
    destCoords,
    userLocation,
    useCurrentLocationForOrigin,
    onRouteCalculated,
  ]);

  const handleClear = useCallback(() => {
    setOriginQuery("");
    setDestQuery("");
    setOriginCoords(null);
    setDestCoords(null);
    setUseCurrentLocationForOrigin(false);
    setTripPlan(null);
    onClearRoute();
  }, [onClearRoute]);

  const canPlanTrip =
    (useCurrentLocationForOrigin && userLocation && destCoords) ||
    (originCoords && destCoords);

  return (
    <div className="absolute top-16 right-20 z-20 w-[360px]">
      {/* Collapsed state */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-3 w-full px-4 py-3 bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-2xl shadow-xl hover:bg-zinc-800/95 transition-all group"
        >
          <div className="p-2 bg-blue-500/20 rounded-xl">
            <Navigation className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">Plan a Trip</p>
            <p className="text-xs text-zinc-400">
              Get directions with Calgary Transit
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-zinc-500 ml-auto group-hover:translate-x-1 transition-transform" />
        </button>
      )}

      {/* Expanded state */}
      {isExpanded && (
        <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Plan a Trip</h3>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              aria-label="Close trip planner"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Input form */}
          <div className="p-4 space-y-3">
            <LocationInput
              label="From"
              placeholder="Enter starting point"
              value={originQuery}
              onChange={(val) => {
                setOriginQuery(val);
                setUseCurrentLocationForOrigin(false);
                setOriginCoords(null);
                if (!val) setOriginSuggestions([]);
              }}
              onSelect={handleOriginSelect}
              onUseCurrentLocation={
                userLocation ? handleUseCurrentLocation : undefined
              }
              icon={<div className="w-2 h-2 rounded-full bg-green-500" />}
              isCurrentLocation={useCurrentLocationForOrigin}
              suggestions={originSuggestions}
              isLoading={isLoadingOrigin}
              showSuggestions={showOriginSuggestions}
              onFocus={() => setShowOriginSuggestions(true)}
              onBlur={() =>
                setTimeout(() => setShowOriginSuggestions(false), 200)
              }
            />

            <LocationInput
              label="To"
              placeholder="Enter destination"
              value={destQuery}
              onChange={(val) => {
                setDestQuery(val);
                setDestCoords(null);
                if (!val) setDestSuggestions([]);
              }}
              onSelect={handleDestSelect}
              icon={<div className="w-2 h-2 rounded-full bg-red-500" />}
              suggestions={destSuggestions}
              isLoading={isLoadingDest}
              showSuggestions={showDestSuggestions}
              onFocus={() => setShowDestSuggestions(true)}
              onBlur={() =>
                setTimeout(() => setShowDestSuggestions(false), 200)
              }
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePlanTrip}
                disabled={!canPlanTrip || isPlanning}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition-colors"
              >
                {isPlanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Planning...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Get Directions
                  </>
                )}
              </button>
              {(tripPlan || originCoords || destCoords) && (
                <button
                  onClick={handleClear}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium text-zinc-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Trip results */}
          {tripPlan && (
            <div className="border-t border-zinc-800">
              {tripPlan.success && tripPlan.summary ? (
                <>
                  {/* Summary */}
                  <div className="px-4 py-3 bg-zinc-800/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium text-white">
                          {tripPlan.summary.total_duration_text}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Footprints className="w-3 h-3" />
                        <span>
                          {tripPlan.summary.total_walking_distance_text} walk
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      via {tripPlan.summary.transit_line}
                    </p>
                  </div>

                  {/* Segments */}
                  <div className="px-4 py-3 max-h-[300px] overflow-y-auto">
                    {tripPlan.segments?.map((segment, index) => (
                      <TripSegmentCard
                        key={index}
                        segment={segment}
                        isLast={index === (tripPlan.segments?.length ?? 0) - 1}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-red-400">{tripPlan.error}</p>
                  {tripPlan.suggestion && (
                    <p className="text-xs text-zinc-400 mt-2">
                      {tripPlan.suggestion}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
