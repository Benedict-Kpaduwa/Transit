import { Spinner } from "@/components/ui/spinner";
import { Train } from "lucide-react";

const SplashScreen = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-linear-to-br from-gray-900 to-black">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-linear-to-r from-blue-500 to-red-500 rounded-full blur-xl opacity-30"></div>
          <div className="relative bg-linear-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700/50 shadow-2xl">
            <Train className="size-16 text-white mx-auto mb-4" />
          </div>
        </div>

        <h1 className="text-3xl font-bold bg-linear-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent mb-4">
          Calgary Transit Network
        </h1>

        <Spinner className="size-12 mb-6 text-blue-400" />

        <div className="space-y-3">
          <p className="text-white/90 text-lg font-medium">
            Loading transit data...
          </p>
          <p className="text-gray-400 text-sm">
            Fetching real-time station information and route lines
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-destructive animate-pulse"></div>
              <span className="text-gray-400 text-xs">Red Line</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-3 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-gray-400 text-xs">Blue Line</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
