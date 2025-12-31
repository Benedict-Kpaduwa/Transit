import { AlertCircle, RefreshCw, Server, Wifi } from "lucide-react";

interface ErrorScreenProps {
  error: string;
  handleRefresh: () => void;
  refreshing: boolean;
}

const ErrorScreen = ({
  error,
  handleRefresh,
  refreshing,
}: ErrorScreenProps) => {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex items-center justify-center p-6 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(239, 68, 68, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(239, 68, 68, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />
      </div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-500/10 rounded-full blur-[120px]" />

      <div className="relative z-10 max-w-md w-full">
        {/* Card */}
        <div className="bg-zinc-900/80 backdrop-blur-xl rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
          {/* Top accent */}
          <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />

          <div className="p-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl" />
                <div className="relative w-16 h-16 bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-full flex items-center justify-center border border-red-500/30">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                Connection Failed
              </h2>
              <p className="text-zinc-500 text-sm">
                Unable to reach Calgary Transit API
              </p>
            </div>

            {/* Error message */}
            <div className="bg-zinc-800/50 rounded-xl p-4 mb-6 border border-zinc-700/50">
              <p className="text-red-400/90 text-sm font-mono break-all">
                {error}
              </p>
            </div>

            {/* Server info */}
            <div className="bg-zinc-800/30 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex items-center gap-3 text-zinc-400">
                <Server className="w-4 h-4 text-zinc-500" />
                <code className="text-xs bg-zinc-900/50 px-2 py-1 rounded text-zinc-300">
                  {import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}
                </code>
              </div>
              <div className="flex items-center gap-3 text-zinc-500 text-xs">
                <Wifi className="w-4 h-4" />
                <span>Ensure the backend server is running</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-red-500/50 disabled:to-red-600/50 text-white font-semibold px-6 py-3.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group shadow-lg shadow-red-500/20"
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    refreshing
                      ? "animate-spin"
                      : "group-hover:rotate-180 transition-transform duration-500"
                  }`}
                />
                {refreshing ? "Retrying..." : "Retry Connection"}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium px-6 py-3 rounded-xl transition-colors duration-300 border border-zinc-700"
              >
                Reload Page
              </button>
            </div>
          </div>

          {/* Bottom info */}
          <div className="px-8 py-4 bg-zinc-900/50 border-t border-zinc-800">
            <p className="text-zinc-600 text-xs text-center">
              If the problem persists, check your network connection or contact
              support
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;
