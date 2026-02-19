import * as React from "react";
import { Train, Bus, MapPin, Navigation, Clock, Search, Settings } from "lucide-react";
import { useMapStore } from "@/stores/useMapStore";
import { useAllStationsByLineSorted } from "@/hooks/queries";
import { useNearbyArrivals, formatArrivalTime, getArrivalUrgencyColor } from "@/hooks/useArrivals";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function MobileDashboard() {
  const { 
    setMobileView, 
    setSelectedStation, 
    userLocation, 
    setShowLiveBuses, 
    setShowLiveTrains 
  } = useMapStore();
  const { data: stations } = useAllStationsByLineSorted();
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredRed = stations?.red.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];
  const filteredBlue = stations?.blue.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? [];

  const { data: nearbyCTrains } = useNearbyArrivals(userLocation, {
    radius: 2000,
    limitStops: 2,
    limitArrivals: 2,
    vehicleType: "CTrain",
    enabled: !!userLocation,
  });

  const handleStationSelect = (station: any) => {
    setSelectedStation(station);
    setMobileView("map");
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white pb-10">
      {/* Header / Search */}
      <div className="sticky top-0 z-20 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 p-5 pt-8">
        <h1 className="text-2xl font-black mb-4 tracking-tight">Where to?</h1>
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
          <Input
            type="text"
            placeholder="Search stations or places..."
            className="w-full bg-zinc-900 border-zinc-800 pl-12 h-14 rounded-2xl text-lg focus:ring-2 focus:ring-blue-500/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Search Dropdown */}
          {searchQuery && (filteredRed.length > 0 || filteredBlue.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2">
                {[...filteredRed, ...filteredBlue].slice(0, 6).map((station, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleStationSelect(station)}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-zinc-800 transition-colors text-left"
                  >
                    <div className={cn(
                      "size-10 rounded-xl flex items-center justify-center shrink-0",
                      stations?.red.includes(station) ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      <Train className="size-5" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-100">{station.name}</p>
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">
                        {stations?.red.includes(station) ? "Red Line" : "Blue Line"} Station
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Quick Actions Horizontal Scroller */}
        <section>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-500">Quick Actions</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide no-scrollbar">
            <QuickActionButton 
              icon={Train} 
              label="Red Line" 
              color="bg-red-500"
              onClick={() => { setSelectedStation(null); setMobileView("map"); }} 
            />
            <QuickActionButton 
              icon={Train} 
              label="Blue Line" 
              color="bg-blue-500"
              onClick={() => { setSelectedStation(null); setMobileView("map"); }} 
            />
            <QuickActionButton 
              icon={Bus} 
              label="Live Buses" 
              color="bg-emerald-500"
              onClick={() => { setShowLiveBuses(true); setMobileView("map"); }} 
            />
            <QuickActionButton 
              icon={Settings} 
              label="Settings" 
              color="bg-zinc-700" 
            />
          </div>
        </section>

        {/* Plan a Trip Card */}
        <section>
           <button 
             onClick={() => setMobileView("map")}
             className="w-full bg-linear-to-br from-blue-600 to-indigo-700 p-6 rounded-[2.5rem] text-left relative overflow-hidden group shadow-xl shadow-blue-500/20"
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

function QuickActionButton({ icon: Icon, label, color, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-3 shrink-0 group"
    >
      <div className={cn(
        "size-16 rounded-[1.75rem] flex items-center justify-center text-white shadow-lg transition-all duration-300 group-active:scale-90",
        color
      )}>
        <Icon className="size-7" />
      </div>
      <span className="text-xs font-bold text-zinc-400 whitespace-nowrap">{label}</span>
    </button>
  );
}
