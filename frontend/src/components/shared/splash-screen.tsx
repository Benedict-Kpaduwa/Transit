import { Train, MapPin, Wifi } from "lucide-react";

interface SplashStep {
  label: string;
  done: boolean;
}

interface SplashScreenProps {
  /** Real loading milestones. Progress and status text are derived from
      these, so the bar reflects actual state instead of a fake timer. */
  steps?: SplashStep[];
}

const DEFAULT_STEPS: SplashStep[] = [{ label: "Loading transit data", done: false }];

const SplashScreen = ({ steps = DEFAULT_STEPS }: SplashScreenProps) => {
  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done);

  // Leave a little headroom until the app actually swaps in.
  const progress = total === 0 ? 90 : Math.min(95, Math.round((completed / total) * 100));
  const statusText = current ? `${current.label}…` : "Almost ready…";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f] overflow-hidden">
      {/* Static depth: a faint fixed grid + soft glows. No motion — a
          full-viewport moving background is a vestibular trigger. */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/15 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/15 rounded-full blur-[120px]" />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center max-w-lg px-8 text-center">
        <div className="relative mb-10">
          {/* Outer ring — a single slow rotation reads as "working" without
              strobing; it stops entirely under reduced-motion (see index.css). */}
          <div className="absolute inset-0 w-32 h-32 -m-4">
            <svg className="w-full h-full animate-spin-slow" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="url(#gradient)"
                strokeWidth="2"
                strokeDasharray="70 200"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="relative w-24 h-24 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-red-500/10 rounded-2xl" />
            <Train className="w-12 h-12 text-white relative z-10" />
          </div>
        </div>

        {/* Title — matches the app's display weight (font-black). */}
        <h1 className="text-4xl font-black mb-2 tracking-tight">
          <span className="bg-gradient-to-r from-blue-400 via-white to-red-400 bg-clip-text text-transparent">
            Calgary Transit
          </span>
        </h1>
        <p className="text-zinc-500 text-sm font-medium tracking-widest uppercase mb-8">
          Real-Time Tracker
        </p>

        {/* Progress bar — driven by real load milestones. */}
        <div className="w-full max-w-xs mb-6">
          <div
            className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-red-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-zinc-400 text-sm mt-3 h-5">{statusText}</p>
        </div>

        {/* Feature indicators */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2 text-zinc-500">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs font-medium">Red Line</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-xs font-medium">Blue Line</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-8 mt-10 text-zinc-600">
          <div className="flex flex-col items-center gap-1">
            <MapPin className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-wider">45 Stations</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col items-center gap-1">
            <Train className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-wider">2 Lines</span>
          </div>
          <div className="w-px h-6 bg-zinc-800" />
          <div className="flex flex-col items-center gap-1">
            <Wifi className="w-4 h-4" />
            <span className="text-[11px] uppercase tracking-wider">Live Data</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
