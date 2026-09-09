import type { ComponentType } from "react";
import { Train, Bus, MapPin, Navigation, Radio } from "lucide-react";
import { useMapStore } from "@/stores/useMapStore";
import { useNearbyArrivals, formatArrivalTime, getArrivalUrgencyColor } from "@/hooks/useArrivals";
import { cn } from "@/lib/utils";
import MapSearch from "@/components/map/map-search";

export function MobileDashboard() {
  const {
    setMobileView,
    userLocation,
    showLiveBuses,
    setShowLiveBuses,
    showLiveTrains,
    setShowLiveTrains,
    showBusStops,
    setShowBusStops,
    showTrainLines,
    setShowTrainLines
  } = useMapStore();

  const { data: nearbyCTrains } = useNearbyArrivals(userLocation, {
    radius: 2000,
    limitStops: 2,
    limitArrivals: 2,
    vehicleType: "CTrain",
    enabled: !!userLocation,
  });

  return (
    <div className="flex flex-col min-h-dvh bg-zinc-950 text-white pb-safe-10 overflow-x-hidden">
      {/* Header / Search */}
      <div
        className="sticky top-0 z-20 scroll-edge-bottom bg-zinc-950/80 backdrop-blur-xl p-5 pt-safe-4"
        style={{ ["--edge-color" as string]: "rgb(9 9 11 / 0.6)" }}
      >
        <h1 className="text-2xl font-black mb-1 tracking-tight">Where to?</h1>
        <MapSearch 
          onSelect={() => setMobileView("map")}
          className="w-full static shadow-none border border-zinc-900 rounded-2xl overflow-hidden mt-4" 
        />
      </div>

      <div className="p-5 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Quick Actions Horizontal Scroller */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Quick Actions</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide no-scrollbar snap-x-cards">
            <QuickActionButton
              icon={Radio}
              label="Live Trains"
              color={showLiveTrains ? "bg-red-600 shadow-red-500/20" : "bg-zinc-900 border border-zinc-900"}
              onClick={() => { setShowLiveTrains(!showLiveTrains); setMobileView("map"); }}
            />
            <QuickActionButton
              icon={MapPin}
              label="Bus Stops"
              color={showBusStops ? "bg-green-600 shadow-green-500/20" : "bg-zinc-900 border border-zinc-900"}
              onClick={() => { setShowBusStops(!showBusStops); setMobileView("map"); }}
            />
            <QuickActionButton
              icon={Bus}
              label="Live Buses"
              color={showLiveBuses ? "bg-emerald-600 shadow-emerald-500/20" : "bg-zinc-900 border border-zinc-900"}
              onClick={() => { setShowLiveBuses(!showLiveBuses); setMobileView("map"); }}
            />
            <QuickActionButton 
              icon={Train} 
              label="Route Lines" 
              color={showTrainLines ? "bg-purple-600 shadow-purple-500/20" : "bg-zinc-900 border border-zinc-900"} 
              onClick={() => { setShowTrainLines(!showTrainLines); setMobileView("map"); }} 
            />
          </div>
        </section>

        {/* Plan a Trip Card */}
        <section>
           <button
             onClick={() => setMobileView("map")}
             className="w-full bg-linear-to-br from-blue-600 to-indigo-700 p-6 rounded-[2.5rem] text-left relative overflow-hidden group shadow-xl shadow-blue-500/20 transition-transform duration-150 ease-out active:scale-[0.98]"
           >
             <div className="relative z-10">
               <div className="bg-white/20 w-fit p-3 rounded-2xl mb-4 backdrop-blur-md">
                 <Navigation className="size-6 text-white" />
               </div>
               <h3 className="text-2xl font-black text-white leading-tight mb-2">Plan your journey</h3>
               <p className="text-blue-100 font-medium">Get live directions & CTrain schedules</p>
             </div>
             <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-500">
                <Navigation className="size-32 text-white" />
             </div>
           </button>
        </section>

        {/* Nearby Suggestions */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Nearby Departures</h2>
          </div>
          <div className="space-y-3">
            {!userLocation && (
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-4xl text-center">
                <MapPin className="size-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">Enable location to see departures closest to you.</p>
              </div>
            )}
            
            {userLocation && nearbyCTrains?.stops.map((stopData, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                   <div className="size-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                     <MapPin className="size-5 text-zinc-400" />
                   </div>
                   <div className="flex-1">
                     <p className="font-bold">{stopData.stop.stop_name}</p>
                     <p className="text-xs text-zinc-500">{stopData.stop.distance_meters}m away</p>
                   </div>
                </div>
                <div className="space-y-2">
                   {stopData.arrivals.slice(0, 2).map((arr, j) => (
                    <div key={j} className="flex items-center justify-between bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50">
                       <div className="flex items-center gap-3">
                         <span className="text-xs font-black px-2 py-1 rounded-lg" style={{ backgroundColor: arr.color, color: 'white' }}>{arr.route_short_name}</span>
                         <span className="text-sm font-medium text-zinc-300 truncate max-w-[140px]">{arr.headsign}</span>
                       </div>
                       <span className={cn("text-sm font-black", getArrivalUrgencyColor(arr.minutes_away))}>
                         {formatArrivalTime(arr.minutes_away)}
                       </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

interface QuickActionButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  color: string;
  onClick: () => void;
}

function QuickActionButton({ icon: Icon, label, color, onClick }: QuickActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-3 shrink-0 group"
    >
      <div className={cn(
        "size-16 rounded-[1.75rem] flex items-center justify-center text-white shadow-lg transition-transform duration-150 ease-out group-active:scale-90",
        color
      )}>
        <Icon className="size-7" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</span>
    </button>
  );
}
