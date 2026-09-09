import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, Train } from "lucide-react";
import type { Station } from "@/types";
import { formatArrivalTime, getArrivalUrgencyColor } from "@/hooks/useArrivals";

interface Arrival {
  color: string;
  route_short_name: string;
  headsign: string;
  minutes_away: number;
}

interface StationSheetProps {
  station: Station | null;
  isMobile: boolean;
  onClose: () => void;
  arrivals?: Arrival[];
  isLoadingArrivals: boolean;
}

const EXIT_MS = 260;

/** Momentum projection (Apple's `project()` from Designing Fluid Interfaces). */
function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function StationSheet({
  station,
  isMobile,
  onClose,
  arrivals,
  isLoadingArrivals,
}: StationSheetProps) {
  // Presence: keep the last station mounted through the exit animation so
  // the sheet leaves along the same path it entered (§ spatial consistency).
  const [render, setRender] = useState<Station | null>(station);
  const [visible, setVisible] = useState(false);

  // Adjust the mounted station during render when a new one arrives —
  // React's sanctioned "derive state from props" path (no effect needed).
  if (station && station !== render) {
    setRender(station);
  }

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    offset: 0,
  });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    if (station) {
      // Next frame so the transition plays from the initial (hidden) state.
      raf = requestAnimationFrame(() => setVisible(true));
    } else {
      raf = requestAnimationFrame(() => setVisible(false));
      timer = window.setTimeout(
        () => setRender(null),
        prefersReducedMotion() ? 0 : EXIT_MS
      );
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [station]);

  const settle = useCallback(
    (dismiss: boolean) => {
      setDragging(false);
      if (dismiss) {
        onClose();
      } else {
        setDragOffset(0);
      }
    },
    [onClose]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isMobile || prefersReducedMotion()) return;
      // Ignore drags that start on the scrollable arrivals list.
      if ((e.target as HTMLElement).closest("[data-sheet-scroll]")) return;
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
    },
    [isMobile]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const now = performance.now();
    const dy = e.clientY - d.lastY;
    const dt = now - d.lastT || 16;
    d.velocity = (dy / dt) * 1000; // px/s
    d.lastY = e.clientY;
    d.lastT = now;

    let next = e.clientY - d.startY;
    // Rubber-band resistance when dragging up past the resting position.
    if (next < 0) next = next * 0.35;
    d.offset = next;
    setDragOffset(next);
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const height = sheetRef.current?.offsetHeight ?? 320;
    const projected = d.offset + project(d.velocity);
    settle(projected > height * 0.4);
  }, [settle]);

  if (!render) return null;

  const s = render;

  // Mobile: bottom sheet, drag-to-dismiss, symmetric enter/exit.
  // Desktop: floating card, fade + rise on enter, reverse on exit.
  const translateY = dragging
    ? dragOffset
    : visible
      ? 0
      : isMobile
        ? 24
        : 12;

  const wrapperClass = isMobile
    ? "absolute left-3 right-3 bottom-3 mb-safe z-20"
    : "absolute bottom-8 right-20 lg:right-24 w-[min(280px,calc(100vw-8rem))] xl:w-[320px] xl:max-w-sm 2xl:w-[360px] 2xl:max-w-md z-20";

  return (
    <div className={wrapperClass}>
      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateY(${translateY}px)`,
          opacity: visible ? 1 : 0,
          transition: dragging
            ? "none"
            : "transform 260ms cubic-bezier(0.32,0.72,0,1), opacity 200ms ease",
          touchAction: isMobile ? "none" : undefined,
        }}
        className="relative bg-[#18181b]/95 backdrop-blur-xl border border-zinc-800/50 rounded-2xl shadow-2xl p-4 xl:p-5"
      >
        {isMobile && (
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-700" aria-hidden />
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-2 -m-1 p-2 text-zinc-500 hover:text-zinc-300 rounded-full hover:bg-zinc-800/60 transition-colors"
          aria-label="Close station info"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-lg font-semibold text-white mb-3 pr-8 tracking-tight">
          {s.name}
        </h3>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Line:</span>
            <span
              className={`font-semibold ${
                s.line === "Red" ? "text-red-400" : "text-blue-400"
              }`}
            >
              {s.line} Line
            </span>
          </div>

          {s.shared && (
            <div className="bg-amber-500/15 border border-amber-500/25 rounded-lg px-3 py-2">
              <p className="text-amber-400 font-medium text-xs">
                ⭐ Downtown Transit Mall
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-zinc-700/50">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Upcoming Arrivals
            </h4>
            {isLoadingArrivals ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Loading arrivals…</span>
              </div>
            ) : arrivals && arrivals.length > 0 ? (
              <div
                data-sheet-scroll
                className={`space-y-2 overflow-y-auto ${
                  isMobile ? "max-h-[30dvh]" : "max-h-[200px]"
                }`}
              >
                {arrivals.slice(0, 6).map((arrival, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Train
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: arrival.color }}
                      />
                      <span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: arrival.color, color: "white" }}
                      >
                        {arrival.route_short_name}
                      </span>
                      <span className="text-xs text-zinc-300 truncate">
                        {arrival.headsign}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-bold shrink-0 ml-2 ${getArrivalUrgencyColor(
                        arrival.minutes_away
                      )}`}
                    >
                      {formatArrivalTime(arrival.minutes_away)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No upcoming arrivals</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
