import { useState, useMemo, useCallback } from "react";
import { Search, Train, X, MapPin } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Station } from "@/types";

interface StationSearchProps {
  stations: Station[];
  onStationSelect: (station: Station) => void;
}

export default function StationSearch({
  stations,
  onStationSelect,
}: StationSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Filter stations based on query
  const filteredStations = useMemo(() => {
    if (!query.trim()) return stations;
    const lowerQuery = query.toLowerCase();
    return stations.filter(
      (station) =>
        station.name.toLowerCase().includes(lowerQuery) ||
        station.line?.toLowerCase().includes(lowerQuery)
    );
  }, [stations, query]);

  // Group stations by line
  const groupedStations = useMemo(() => {
    const red = filteredStations.filter((s) => s.line === "Red");
    const blue = filteredStations.filter((s) => s.line === "Blue");
    const shared = filteredStations.filter((s) => s.shared);
    return { red, blue, shared };
  }, [filteredStations]);

  const handleSelect = useCallback(
    (station: Station) => {
      onStationSelect(station);
      setIsOpen(false);
      setQuery("");
    },
    [onStationSelect]
  );

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    setIsOpen(true);
  }, []);

  return (
    <section className="absolute top-28 left-7 z-10 w-[280px]">
      <Command className="rounded-lg border border-zinc-800 bg-zinc-900/95 backdrop-blur-sm shadow-lg">
        <div
          className={cn(
            "w-full flex items-center justify-between px-3 gap-1",
            isOpen && "border-b border-zinc-800"
          )}
        >
          <Train className="w-4 h-4 text-zinc-500" />
          <CommandInput
            placeholder="Search stations..."
            value={query}
            onValueChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-500"
          />
          {query && (
            <X
              className="size-4 shrink-0 text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors"
              onClick={() => {
                setQuery("");
                setIsOpen(false);
              }}
              aria-label="Clear search"
            />
          )}
          {!query && <Search className="size-4 shrink-0 text-zinc-500" />}
        </div>

        {isOpen && (
          <CommandList className="max-h-60 overflow-y-auto">
            {filteredStations.length === 0 ? (
              <CommandEmpty className="py-6 text-center">
                <div className="flex flex-col items-center justify-center space-y-1">
                  <p className="text-sm font-medium text-zinc-400">
                    No stations found
                  </p>
                  <p className="text-xs text-zinc-500">
                    Try a different search term
                  </p>
                </div>
              </CommandEmpty>
            ) : (
              <>
                {groupedStations.red.length > 0 && (
                  <CommandGroup heading="Red Line">
                    {groupedStations.red.map((station) => (
                      <CommandItem
                        key={`red-${station.id}`}
                        onSelect={() => handleSelect(station)}
                        value={`${station.name} red`}
                        className="flex items-center py-2 px-2 cursor-pointer hover:bg-zinc-800 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-white truncate">
                              {station.name}
                            </span>
                            {station.shared && (
                              <span className="text-xs text-orange-400">
                                Transfer Station
                              </span>
                            )}
                          </div>
                        </div>
                        <MapPin className="w-3 h-3 text-zinc-500 ml-auto" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {groupedStations.blue.length > 0 && (
                  <CommandGroup heading="Blue Line">
                    {groupedStations.blue.map((station) => (
                      <CommandItem
                        key={`blue-${station.id}`}
                        onSelect={() => handleSelect(station)}
                        value={`${station.name} blue`}
                        className="flex items-center py-2 px-2 cursor-pointer hover:bg-zinc-800 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-white truncate">
                              {station.name}
                            </span>
                            {station.shared && (
                              <span className="text-xs text-orange-400">
                                Transfer Station
                              </span>
                            )}
                          </div>
                        </div>
                        <MapPin className="w-3 h-3 text-zinc-500 ml-auto" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        )}
      </Command>

      {/* Station count badge */}
      <div className="mt-2 text-xs text-zinc-500 pl-1">
        {stations.length} CTrain stations
      </div>
    </section>
  );
}
