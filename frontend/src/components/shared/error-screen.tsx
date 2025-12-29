import { AlertCircle, RefreshCw } from "lucide-react";

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
    <div className="fixed inset-0 z-50 bg-linear-to-br from-gray-900 to-black flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-red-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-lg w-full">
        <div className="bg-linear-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-900/30 rounded-xl">
                <AlertCircle className="size-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  Connection Error
                </h2>
                <p className="text-gray-400 text-sm">
                  Unable to load C-Train data
                </p>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="bg-gray-800/50 rounded-xl p-4">
                <p className="text-red-300/90">{error}</p>
              </div>

              <div className="bg-gray-800/30 rounded-xl p-4">
                <p className="text-gray-400 text-sm">
                  Backend endpoint:{" "}
                  <code className="bg-gray-900/50 px-2 py-1 rounded text-gray-300">
                    {import.meta.env.VITE_API_BASE_URL ||
                      "http://localhost:8000"}
                  </code>
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  Please ensure the backend server is running and accessible
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleRefresh}
                className="flex-1 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group"
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    refreshing
                      ? "animate-spin"
                      : "group-hover:rotate-180 transition-transform"
                  }`}
                />
                {refreshing ? "Retrying..." : "Retry Connection"}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors duration-300"
              >
                Reload Page
              </button>
            </div>
          </div>

          <div className="bg-linear-to-r from-red-900/20 via-transparent to-blue-900/20 h-1"></div>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;
