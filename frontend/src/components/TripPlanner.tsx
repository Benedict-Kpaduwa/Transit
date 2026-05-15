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
  type GeocodingResult,
  type TripPlan,
  type TripSegment,
} from "@/services/api";
import { useGeocode, usePlanTripMutation } from "@/hooks/queries";
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
  stepIndex,
}: {
  segment: TripSegment;
  isLast: boolean;
  stepIndex: number;
}) {
  const isWalk = segment.type === "walk";
  const isTrain = segment.vehicle_type === "CTrain";
  
  // Format duration nicely
  const formatDuration = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
  };

  // Get the appropriate background color
  const getBgColor = () => {
    if (isWalk) return "bg-gradient-to-br from-zinc-600 to-zinc-700";
    if (isTrain) {
      if (segment.color === "#DC143C") return "bg-gradient-to-br from-red-500 to-red-600";
      return "bg-gradient-to-br from-blue-500 to-blue-600";
    }
    return "bg-gradient-to-br from-emerald-500 to-emerald-600";
  };

  // Get border color for the card
  const getBorderColor = () => {
    if (isWalk) return "border-zinc-700";
    if (isTrain) {
      if (segment.color === "#DC143C") return "border-red-500/30";
      return "border-blue-500/30";
    }
    return "border-emerald-500/30";
  };

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[19px] top-14 w-0.5 h-[calc(100%-2rem)]",
            isWalk 
              ? "bg-linear-to-b from-zinc-600 to-zinc-700 border-l border-dashed border-zinc-500" 
              : "bg-linear-to-b",
            !isWalk && segment.color === "#DC143C" && "from-red-500 to-red-400",
            !isWalk && segment.color === "#0088FF" && "from-blue-500 to-blue-400",
            !isWalk && segment.color === "#22c55e" && "from-emerald-500 to-emerald-400"
          )}
        />
      )}

      <div className={cn(
        "flex items-start gap-3 p-3 rounded-xl border transition-all hover:bg-zinc-800/30",
        getBorderColor(),
        "bg-zinc-900/30"
      )}>
        {/* Step number + Icon */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold text-zinc-500">{stepIndex}</span>
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
              getBgColor()
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
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header with route badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isWalk && segment.route_short_name && (
              <span 
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-md"
                style={{ backgroundColor: segment.color || (isTrain ? '#3b82f6' : '#22c55e') }}
              >
                {isTrain ? `${segment.route_short_name} Line` : `Route ${segment.route_short_name}`}
              </span>
            )}
            {segment.duration && (
              <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded-lg">
                <Clock className="w-3 h-3" />
                {formatDuration(segment.duration)}
              </span>
            )}
          </div>

          {/* Instruction */}
          <p className="text-sm font-medium text-white mt-2">
            {segment.instruction}
          </p>

          {/* Details row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400 flex-wrap">
            {segment.distance && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {segment.distance < 1000
                  ? `${Math.round(segment.distance)} m`
                  : `${(segment.distance / 1000).toFixed(1)} km`}
              </span>
            )}
            {segment.num_stops && segment.num_stops > 0 && (
              <span className="flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded">
                {segment.num_stops} {segment.num_stops === 1 ? 'stop' : 'stops'}
              </span>
            )}
            {segment.headsign && (
              <span className="flex items-center gap-1 text-zinc-500">
                <ChevronRight className="w-3 h-3" />
                towards {segment.headsign}
              </span>
            )}
          </div>

          {/* From/To with visual indicator */}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-zinc-400">{segment.from.name}</span>
            </div>
            <ChevronRight className="w-3 h-3 text-zinc-600" />
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-zinc-400">{segment.to.name}</span>
            </div>
          </div>
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

  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);

  // Use TanStack Query mutation for trip planning
  const planTripMutation = usePlanTripMutation();

  const debouncedOriginQuery = useDebounce(originQuery, 300);
  const debouncedDestQuery = useDebounce(destQuery, 300);

  // Use TanStack Query for geocoding instead of useEffect
  const { data: originSuggestions = [], isLoading: isLoadingOrigin } = useGeocode(
    debouncedOriginQuery,
    userLocation,
    { enabled: !useCurrentLocationForOrigin && showOriginSuggestions }
  );

  const { data: destSuggestions = [], isLoading: isLoadingDest } = useGeocode(
    debouncedDestQuery,
    userLocation,
    { enabled: showDestSuggestions }
  );

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

  const handleUseCurrentLocation = useCallback(() => {
    if (userLocation) {
      setUseCurrentLocationForOrigin(true);
      setOriginCoords(userLocation);
      setOriginQuery("");
    }
  }, [userLocation]);

  const handleOriginSelect = useCallback((result: GeocodingResult) => {
    setOriginQuery(result.name);
    setOriginCoords({ lng: result.coordinates[0], lat: result.coordinates[1] });
    setShowOriginSuggestions(false);
    setUseCurrentLocationForOrigin(false);
  }, []);

  const handleDestSelect = useCallback((result: GeocodingResult) => {
    setDestQuery(result.name);
    setDestCoords({ lng: result.coordinates[0], lat: result.coordinates[1] });
    setShowDestSuggestions(false);
  }, []);

  const handlePlanTrip = useCallback(() => {
    const origin = useCurrentLocationForOrigin ? userLocation : originCoords;
    if (!origin || !destCoords) return;

    setTripPlan(null);

    planTripMutation.mutate(
      { origin, destination: destCoords, preferLrt: true },
      {
        onSuccess: (result) => {
          setTripPlan(result);
          if (result.success) {
            onRouteCalculated(result);
          }
        },
      }
    );
  }, [
    originCoords,
    destCoords,
    userLocation,
    useCurrentLocationForOrigin,
    onRouteCalculated,
    planTripMutation,
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
    <div className="absolute top-4 right-16 sm:right-16 lg:right-20 z-20 w-[min(calc(100vw-8rem),360px)] sm:w-[360px]">
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
                disabled={!canPlanTrip || planTripMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition-colors"
              >
                {planTripMutation.isPending ? (
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
                  {/* Enhanced Summary Card */}
                  <div className="p-4 bg-linear-to-br from-zinc-800/80 to-zinc-900/80">
                    {/* Time header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                          <Navigation className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs text-zinc-400">Leave now</p>
                          <p className="text-sm font-semibold text-white">
                            Arrive ~{new Date(Date.now() + (tripPlan.summary.total_duration * 1000)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-lg font-bold text-white">
                          <Clock className="w-4 h-4 text-blue-400" />
                          {tripPlan.summary.total_duration_text}
                        </div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 p-2 bg-zinc-900/50 rounded-lg">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <Footprints className="w-3.5 h-3.5" />
                        <span>{tripPlan.summary.total_walking_distance_text} walk</span>
                      </div>
                      <div className="w-px h-4 bg-zinc-700" />
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span>via</span>
                        <span className="font-medium text-zinc-300">{tripPlan.summary.transit_line}</span>
                      </div>
                    </div>

                    {/* Route preview icons */}
                    <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
                      {tripPlan.segments?.map((segment, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <div 
                            className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                              segment.type === "walk" 
                                ? "bg-zinc-700" 
                                : segment.vehicle_type === "CTrain"
                                  ? segment.color === "#DC143C" ? "bg-red-500" : "bg-blue-500"
                                  : "bg-emerald-500"
                            )}
                          >
                            {segment.type === "walk" ? (
                              <Footprints className="w-3.5 h-3.5 text-white" />
                            ) : segment.vehicle_type === "CTrain" ? (
                              <Train className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Bus className="w-3.5 h-3.5 text-white" />
                            )}
                          </div>
                          {idx < (tripPlan.segments?.length ?? 0) - 1 && (
                            <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Segments */}
                  <div className="px-4 py-3 max-h-[40vh] sm:max-h-[320px] overflow-y-auto space-y-2">
                    {tripPlan.segments?.map((segment, index) => (
                      <TripSegmentCard
                        key={index}
                        segment={segment}
                        isLast={index === (tripPlan.segments?.length ?? 0) - 1}
                        stepIndex={index + 1}
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
