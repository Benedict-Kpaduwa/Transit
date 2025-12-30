// components/StationCard.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MapPin, Clock, Users, Train } from "lucide-react";
import type { Station } from "@/types";

interface StationCardProps {
  station: Station;
  isSelected: boolean;
  onClick: () => void;
  showLineIndicator?: boolean;
}

export default function StationCard({
  station,
  isSelected,
  onClick,
  showLineIndicator = false,
}: StationCardProps) {
  const isRedLine = station.line === "Red" || station.route === "201";

  // Mock real-time data
  const status = {
    nextArrival: "3 min",
    crowd: "Moderate",
    platform: isRedLine ? "Northbound" : "Southbound",
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-all duration-200 overflow-hidden",
        isSelected
          ? "ring-2 ring-blue-500 ring-offset-2 shadow-lg bg-white"
          : "hover:shadow-md hover:-translate-y-0.5 bg-white border-slate-200"
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Line Indicator */}
          {showLineIndicator && (
            <div
              className={cn(
                "w-1.5 rounded-full flex-shrink-0",
                isRedLine ? "bg-gradient-to-b from-red-500 to-rose-600" : "bg-gradient-to-b from-blue-500 to-cyan-600"
              )}
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-slate-900 text-base leading-tight">
                  {station.name}
                </h3>
                {station.shared && (
                  <Badge variant="secondary" className="mt-1 text-xs bg-amber-100 text-amber-800 border-amber-300">
                    Free Fare Zone
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "font-medium text-xs px-2.5 py-0.5",
                    isRedLine
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  )}
                >
                  {isRedLine ? "201 Red" : "202 Blue"}
                </Badge>
              </div>
            </div>

            {/* Real-time Status */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="flex items-center gap-2 text-xs">
                <Clock className="size-3.5 text-slate-500" />
                <div>
                  <p className="text-slate-500">Next train</p>
                  <p className="font-semibold text-slate-900">{status.nextArrival}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Train className="size-3.5 text-slate-500" />
                <div>
                  <p className="text-slate-500">Platform</p>
                  <p className="font-medium text-slate-900 text-xs">{status.platform}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Users className="size-3.5 text-slate-500" />
                <div>
                  <p className="text-slate-500">Crowd</p>
                  <p className={cn(
                    "font-semibold",
                    status.crowd === "Low" ? "text-green-600" :
                    status.crowd === "Moderate" ? "text-amber-600" : "text-red-600"
                  )}>
                    {status.crowd}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3" />
                <span>Calgary, AB</span>
              </div>
              <span className="text-slate-400">Updated just now</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}