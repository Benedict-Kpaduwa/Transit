import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bike,
  Bus,
  Car,
  Footprints,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Train,
  X,
} from "lucide-react";
import {
  type GeocodingResult,
  type ModeChip,
  type SimpleDirections,
  type TripPlan,
  type TripRoute,
  type TripSegment,
} from "@/services/api";
import {
  useGeocode,
  usePlanTripMutation,
  useSimpleDirections,
} from "@/hooks/queries";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

type Mode = "driving" | "transit" | "walking";
type Coords = { lng: number; lat: number };

interface TripSheetProps {
  userLocation: Coords | null;
  onRouteCalculated: (plan: TripPlan) => void;
  onClearRoute: () => void;
  externalDestination?: {
    name: string;
    address: string;
    coordinates: [number, number];
  } | null;
  onClearExternalDestination?: () => void;
}

/** Momentum projection (Apple's `project()` from Designing Fluid Interfaces). */
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fmtDuration(seconds?: number) {
  if (!seconds && seconds !== 0) return "--";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function fmtDistance(meters?: number) {
  if (!meters && meters !== 0) return "";
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

function fmtClock(unix?: number) {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Location input                                                     */
/* ------------------------------------------------------------------ */

function LocationField({
  dotClass,
  placeholder,
  value,
  isCurrentLocation,
  onChange,
  onSelect,
  onUseCurrentLocation,
  onClear,
  suggestions,
  isLoading,
  showSuggestions,
  onFocus,
  onBlur,
}: {
  dotClass: string;
  placeholder: string;
  value: string;
  isCurrentLocation?: boolean;
  onChange: (v: string) => void;
  onSelect: (r: GeocodingResult) => void;
  onUseCurrentLocation?: () => void;
  onClear: () => void;
  suggestions: GeocodingResult[];
  isLoading: boolean;
  showSuggestions: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-xl bg-zinc-800/60 px-3 py-2.5">
        <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} />
        <input
          type="text"
          value={isCurrentLocation ? "Your location" : value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={() => setTimeout(onBlur, 150)}
          placeholder={placeholder}
          disabled={isCurrentLocation}
          className={cn(
            "flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none",
            isCurrentLocation && "text-blue-400"
          )}
        />
        {isCurrentLocation || value ? (
          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Clear"
          >
            <X className="size-4" />
          </button>
        ) : (
          onUseCurrentLocation && (
            <button
              type="button"
              onClick={onUseCurrentLocation}
              className="text-zinc-500 hover:text-blue-400"
              aria-label="Use current location"
            >
              <LocateFixed className="size-4" />
            </button>
          )
        )}
      </div>

      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-zinc-400">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Searching…</span>
            </div>
          ) : (
            suggestions.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {r.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{r.place_name}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mode chips (compact leg summary on a route card)                   */
/* ------------------------------------------------------------------ */

function Chip({ chip }: { chip: ModeChip }) {
  if (chip.type === "walk") {
    return (
      <span className="flex items-center gap-1 rounded-md bg-zinc-800 px-1.5 py-1 text-xs font-medium text-zinc-300">
        <Footprints className="size-3.5" />
        {chip.minutes}
      </span>
    );
  }
  const Icon = chip.type === "train" ? Train : Bus;
  return (
    <span
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-white"
      style={{ backgroundColor: chip.color || "#22c55e" }}
    >
      <Icon className="size-3.5" />
      {chip.label}
    </span>
  );
}

function ChipRow({ chips }: { chips: ModeChip[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((c, i) => (
        <div key={i} className="flex items-center gap-1">
          <Chip chip={c} />
          {i < chips.length - 1 && (
            <span className="text-zinc-600" aria-hidden>
              ›
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step-by-step detail                                                */
/* ------------------------------------------------------------------ */

function StepList({ segments }: { segments: TripSegment[] }) {
  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        const isWalk = seg.type === "walk";
        const isTrain = seg.vehicle_type === "CTrain";
        const Icon = isWalk ? Footprints : isTrain ? Train : Bus;
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  isWalk ? "bg-zinc-800 text-zinc-300" : "text-white"
                )}
                style={
                  isWalk
                    ? undefined
                    : { backgroundColor: seg.color || "#22c55e" }
                }
              >
                <Icon className="size-4" />
              </div>
              {i < segments.length - 1 && (
                <div className="my-1 w-px flex-1 bg-zinc-700" />
              )}
            </div>

            <div className="flex-1 pb-4">
              {isWalk ? (
                <>
                  <p className="text-sm font-medium text-white">
                    Walk {fmtDuration(seg.duration)}
                  </p>
                  {seg.distance ? (
                    <p className="text-xs text-zinc-500">
                      {fmtDistance(seg.distance)}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: seg.color || "#22c55e" }}
                    >
                      {isTrain
                        ? `${seg.route_short_name} Line`
                        : `Route ${seg.route_short_name}`}
                    </span>
                    {fmtClock(seg.departure_time) && (
                      <span className="text-xs text-zinc-500">
                        {fmtClock(seg.departure_time)}
                      </span>
                    )}
                  </div>
                  {seg.headsign && (
                    <p className="mt-1 text-sm text-zinc-300">
                      towards {seg.headsign}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Ride {seg.num_stops ?? seg.stops_count ?? 1}{" "}
                    {(seg.num_stops ?? 1) === 1 ? "stop" : "stops"} ·{" "}
                    {fmtDuration(seg.duration)}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function TripSheet({
  userLocation,
  onRouteCalculated,
  onClearRoute,
  externalDestination,
  onClearExternalDestination,
}: TripSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("transit");
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originCoords, setOriginCoords] = useState<Coords | null>(null);
  const [destCoords, setDestCoords] = useState<Coords | null>(null);
  const [useCurrentForOrigin, setUseCurrentForOrigin] = useState(false);
  const [showOriginSug, setShowOriginSug] = useState(false);
  const [showDestSug, setShowDestSug] = useState(false);

  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);

  const planTrip = usePlanTripMutation();

  const debouncedOrigin = useDebounce(originQuery, 300);
  const debouncedDest = useDebounce(destQuery, 300);

  const { data: originSug = [], isLoading: loadingOrigin } = useGeocode(
    debouncedOrigin,
    userLocation,
    { enabled: !useCurrentForOrigin && showOriginSug }
  );
  const { data: destSug = [], isLoading: loadingDest } = useGeocode(
    debouncedDest,
    userLocation,
    { enabled: showDestSug }
  );

  const resolvedOrigin = useCurrentForOrigin ? userLocation : originCoords;
  const haveEnds = !!resolvedOrigin && !!destCoords;

  // Drive / Walk times are fetched even while the Transit tab is active so the
  // tab bar can show all three at once (like Google Maps).
  const driveDir = useSimpleDirections(
    resolvedOrigin,
    destCoords,
    "driving",
    haveEnds
  );
  const walkDir = useSimpleDirections(
    resolvedOrigin,
    destCoords,
    "walking",
    haveEnds
  );

  /* ---- external destination (from "Get directions" elsewhere) ---- */
  useEffect(() => {
    if (!externalDestination) return;
    setDestQuery(externalDestination.address || externalDestination.name);
    setDestCoords({
      lng: externalDestination.coordinates[0],
      lat: externalDestination.coordinates[1],
    });
    if (userLocation) {
      setUseCurrentForOrigin(true);
      setOriginCoords(userLocation);
    }
    setIsOpen(true);
    setView("list");
    onClearExternalDestination?.();
  }, [externalDestination, userLocation, onClearExternalDestination]);

  /* ---- auto-plan the transit trip whenever both ends are known ---- */
  const planKeyRef = useRef<string>("");
  useEffect(() => {
    if (!haveEnds || !resolvedOrigin || !destCoords) return;
    const key = `${resolvedOrigin.lng},${resolvedOrigin.lat}->${destCoords.lng},${destCoords.lat}`;
    if (planKeyRef.current === key) return;
    planKeyRef.current = key;
    setTripPlan(null);
    setSelectedRouteId(null);
    planTrip.mutate(
      { origin: resolvedOrigin, destination: destCoords, preferLrt: true },
      { onSuccess: (res) => setTripPlan(res) }
    );
  }, [haveEnds, resolvedOrigin, destCoords, planTrip]);

  const routes: TripRoute[] = useMemo(() => {
    if (!tripPlan?.success) return [];
    if (tripPlan.routes?.length) return tripPlan.routes;
    if (tripPlan.segments && tripPlan.summary) {
      return [
        {
          id: "route-0",
          segments: tripPlan.segments,
          mode_chips: [],
          summary: tripPlan.summary,
        },
      ];
    }
    return [];
  }, [tripPlan]);

  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  /* ---- build the plan we hand to the map for the current mode ---- */
  const buildTransitMapPlan = useCallback(
    (route: TripRoute): TripPlan => ({
      success: true,
      source: tripPlan?.source,
      origin: tripPlan?.origin ?? {
        coordinates: [resolvedOrigin!.lng, resolvedOrigin!.lat],
      },
      destination: tripPlan?.destination ?? {
        coordinates: [destCoords!.lng, destCoords!.lat],
      },
      segments: route.segments,
      summary: route.summary,
      routes: [route],
    }),
    [tripPlan, resolvedOrigin, destCoords]
  );

  const buildSimpleMapPlan = useCallback(
    (m: "driving" | "walking", dir: SimpleDirections): TripPlan | null => {
      if (!dir.success || !dir.geometry || !resolvedOrigin || !destCoords)
        return null;
      const from = {
        name: "Start",
        coordinates: [resolvedOrigin.lng, resolvedOrigin.lat] as [
          number,
          number,
        ],
      };
      const to = {
        name: "Destination",
        coordinates: [destCoords.lng, destCoords.lat] as [number, number],
      };
      const seg: TripSegment =
        m === "walking"
          ? {
              type: "walk",
              instruction: "Walk to destination",
              duration: dir.duration ?? 0,
              distance: dir.distance,
              geometry: dir.geometry,
              from,
              to,
            }
          : {
              type: "transit",
              instruction: "Drive to destination",
              vehicle_type: "Car",
              color: "#4285F4",
              duration: dir.duration ?? 0,
              distance: dir.distance,
              geometry: dir.geometry,
              from,
              to,
            };
      return {
        success: true,
        origin: { coordinates: from.coordinates },
        destination: { coordinates: to.coordinates },
        segments: [seg],
        summary: {
          total_duration: dir.duration ?? 0,
          total_duration_text: fmtDuration(dir.duration),
          total_walking_distance: m === "walking" ? (dir.distance ?? 0) : 0,
          total_walking_distance_text:
            m === "walking" ? fmtDistance(dir.distance) : "0 m",
          transit_line: m === "walking" ? "Walk" : "Drive",
          transit_type: m === "walking" ? "Walk" : "Car",
        },
      };
    },
    [resolvedOrigin, destCoords]
  );

  /* ---- push the active route to the map (skip redundant re-emits) ---- */
  const lastEmitRef = useRef<string>("");
  useEffect(() => {
    let plan: TripPlan | null = null;
    let sig = "";
    if (mode === "transit") {
      if (!selectedRoute) return;
      plan = buildTransitMapPlan(selectedRoute);
      sig = `transit:${selectedRoute.id}`;
    } else {
      const dir = mode === "driving" ? driveDir.data : walkDir.data;
      if (!dir?.success) return;
      plan = buildSimpleMapPlan(mode, dir);
      sig = `${mode}:${dir.duration}:${dir.distance}`;
    }
    if (!plan || sig === lastEmitRef.current) return;
    lastEmitRef.current = sig;
    onRouteCalculated(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedRoute, driveDir.data, walkDir.data]);

  /* ---- handlers ---- */
  const handleUseCurrentLocation = useCallback(() => {
    if (!userLocation) return;
    setUseCurrentForOrigin(true);
    setOriginCoords(userLocation);
    setOriginQuery("");
  }, [userLocation]);

  const handleClear = useCallback(() => {
    setOriginQuery("");
    setDestQuery("");
    setOriginCoords(null);
    setDestCoords(null);
    setUseCurrentForOrigin(false);
    setTripPlan(null);
    setSelectedRouteId(null);
    setView("list");
    planKeyRef.current = "";
    lastEmitRef.current = "";
    onClearRoute();
  }, [onClearRoute]);

  const openRouteDetail = useCallback((route: TripRoute) => {
    setSelectedRouteId(route.id);
    setView("detail");
  }, []);

  /* ---- drag to dismiss ---- */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ active: false, startY: 0, lastY: 0, lastT: 0, velocity: 0, offset: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (prefersReducedMotion()) return;
    if ((e.target as HTMLElement).closest("[data-sheet-scroll],input,button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      offset: 0,
    };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const now = performance.now();
    const dt = now - d.lastT || 16;
    d.velocity = ((e.clientY - d.lastY) / dt) * 1000;
    d.lastY = e.clientY;
    d.lastT = now;
    let next = e.clientY - d.startY;
    if (next < 0) next *= 0.35;
    d.offset = next;
    setDragOffset(next);
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const height = sheetRef.current?.offsetHeight ?? 400;
    const projected = d.offset + project(d.velocity);
    setDragging(false);
    if (projected > height * 0.35) {
      setIsOpen(false);
      setDragOffset(0);
    } else {
      setDragOffset(0);
    }
  }, []);

  /* ---------------------------------------------------------------- */

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute left-3 right-16 top-3 z-20 flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 text-left shadow-xl backdrop-blur-xl"
      >
        <span className="rounded-xl bg-blue-500/20 p-2">
          <Navigation className="size-5 text-blue-400" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-white">
            Plan a trip
          </span>
          <span className="block text-xs text-zinc-400">
            Directions with Calgary Transit
          </span>
        </span>
        <Search className="size-4 text-zinc-500" />
      </button>
    );
  }

  const modeTabs: { id: Mode; icon: typeof Car; time?: number }[] = [
    { id: "driving", icon: Car, time: driveDir.data?.duration },
    {
      id: "transit",
      icon: Train,
      time: routes[0]?.summary.total_duration,
    },
    { id: "walking", icon: Footprints, time: walkDir.data?.duration },
  ];

  const translateY = dragging ? dragOffset : 0;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30">
      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: dragging
            ? "none"
            : "transform 260ms cubic-bezier(0.32,0.72,0,1)",
          touchAction: "none",
        }}
        className="mx-auto flex max-h-[86dvh] flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-[#18181b]/98 shadow-2xl backdrop-blur-xl"
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-zinc-700" aria-hidden />

        {/* header */}
        <div className="flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2">
            {view === "detail" && (
              <button
                onClick={() => setView("list")}
                className="-ml-1 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <h3 className="text-sm font-semibold text-white">
              {view === "detail" ? "Trip details" : "Plan a trip"}
            </h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          data-sheet-scroll
          className="flex-1 space-y-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        >
          {view === "list" && (
            <>
              {/* origin / destination */}
              <div className="space-y-2">
                <LocationField
                  dotClass="bg-emerald-500"
                  placeholder="Choose starting point"
                  value={originQuery}
                  isCurrentLocation={useCurrentForOrigin}
                  onChange={(v) => {
                    setOriginQuery(v);
                    setUseCurrentForOrigin(false);
                    setOriginCoords(null);
                  }}
                  onSelect={(r) => {
                    setOriginQuery(r.name);
                    setOriginCoords({
                      lng: r.coordinates[0],
                      lat: r.coordinates[1],
                    });
                    setUseCurrentForOrigin(false);
                    setShowOriginSug(false);
                  }}
                  onUseCurrentLocation={
                    userLocation ? handleUseCurrentLocation : undefined
                  }
                  onClear={() => {
                    setOriginQuery("");
                    setOriginCoords(null);
                    setUseCurrentForOrigin(false);
                  }}
                  suggestions={originSug}
                  isLoading={loadingOrigin}
                  showSuggestions={showOriginSug}
                  onFocus={() => setShowOriginSug(true)}
                  onBlur={() => setShowOriginSug(false)}
                />
                <LocationField
                  dotClass="bg-red-500"
                  placeholder="Choose destination"
                  value={destQuery}
                  onChange={(v) => {
                    setDestQuery(v);
                    setDestCoords(null);
                  }}
                  onSelect={(r) => {
                    setDestQuery(r.name);
                    setDestCoords({
                      lng: r.coordinates[0],
                      lat: r.coordinates[1],
                    });
                    setShowDestSug(false);
                  }}
                  onClear={() => {
                    setDestQuery("");
                    setDestCoords(null);
                  }}
                  suggestions={destSug}
                  isLoading={loadingDest}
                  showSuggestions={showDestSug}
                  onFocus={() => setShowDestSug(true)}
                  onBlur={() => setShowDestSug(false)}
                />
              </div>

              {/* mode tabs */}
              <div className="flex items-stretch gap-1 rounded-xl bg-zinc-800/40 p-1">
                {modeTabs.map(({ id, icon: Icon, time }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                      mode === id
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{time ? fmtDuration(time) : "--"}</span>
                  </button>
                ))}
                <button
                  disabled
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-zinc-600"
                >
                  <Bike className="size-4" />
                  <span>--</span>
                </button>
              </div>

              {/* body per mode */}
              {!haveEnds ? (
                <p className="px-1 py-6 text-center text-sm text-zinc-500">
                  Enter a start and destination to see routes.
                </p>
              ) : mode === "transit" ? (
                planTrip.isPending ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
                    <Loader2 className="size-4 animate-spin" />
                    <span className="text-sm">Finding routes…</span>
                  </div>
                ) : routes.length ? (
                  <div className="space-y-2">
                    {routes.map((route) => {
                      const s = route.summary;
                      const depart = fmtClock(s.depart_at);
                      const arrive = fmtClock(s.arrive_at);
                      return (
                        <button
                          key={route.id}
                          onClick={() => openRouteDetail(route)}
                          className={cn(
                            "w-full rounded-2xl border p-3 text-left transition-colors",
                            selectedRoute?.id === route.id
                              ? "border-blue-500/60 bg-blue-500/5"
                              : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                          )}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-lg font-bold leading-tight text-white">
                                {s.total_duration_text}
                              </p>
                              {depart && arrive && (
                                <p className="text-xs text-zinc-400">
                                  {depart} – {arrive}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-xs text-zinc-400">
                              {s.fare && (
                                <p className="font-medium text-zinc-300">
                                  {s.fare}
                                </p>
                              )}
                              <p>
                                {s.num_transfers
                                  ? `${s.num_transfers} transfer${
                                      s.num_transfers > 1 ? "s" : ""
                                    }`
                                  : "Direct"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <ChipRow chips={route.mode_chips} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-1 py-6 text-center text-sm text-zinc-500">
                    {tripPlan?.error || "No transit route found."}
                  </p>
                )
              ) : (
                <SimpleModeCard
                  mode={mode}
                  dir={mode === "driving" ? driveDir.data : walkDir.data}
                  loading={
                    mode === "driving" ? driveDir.isFetching : walkDir.isFetching
                  }
                />
              )}

              {haveEnds && (
                <button
                  onClick={handleClear}
                  className="w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  Clear
                </button>
              )}
            </>
          )}

          {view === "detail" && selectedRoute && (
            <>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xl font-bold text-white">
                  {selectedRoute.summary.total_duration_text}
                </p>
                <p className="text-sm text-zinc-400">
                  {fmtClock(selectedRoute.summary.depart_at)} –{" "}
                  {fmtClock(selectedRoute.summary.arrive_at)}
                  {selectedRoute.summary.fare
                    ? ` · ${selectedRoute.summary.fare}`
                    : ""}
                </p>
                <div className="mt-2">
                  <ChipRow chips={selectedRoute.mode_chips} />
                </div>
              </div>
              <StepList segments={selectedRoute.segments} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SimpleModeCard({
  mode,
  dir,
  loading,
}: {
  mode: "driving" | "walking";
  dir?: SimpleDirections;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-zinc-400">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Calculating…</span>
      </div>
    );
  }
  if (!dir?.success) {
    return (
      <p className="px-1 py-6 text-center text-sm text-zinc-500">
        {dir?.error || "No route found."}
      </p>
    );
  }
  const Icon = mode === "driving" ? Car : Footprints;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-200">
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight text-white">
            {fmtDuration(dir.duration)}
          </p>
          <p className="text-xs text-zinc-400">
            {fmtDistance(dir.distance)} · {mode === "driving" ? "Driving" : "Walking"}
          </p>
        </div>
      </div>
    </div>
  );
}
