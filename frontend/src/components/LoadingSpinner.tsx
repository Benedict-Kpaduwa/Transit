import { Train } from "lucide-react";

interface LoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

const LoadingSpinner = ({
  message = "Loading...",
  size = "md",
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: { container: "w-8 h-8", icon: "w-4 h-4", text: "text-xs" },
    md: { container: "w-12 h-12", icon: "w-6 h-6", text: "text-sm" },
    lg: { container: "w-16 h-16", icon: "w-8 h-8", text: "text-base" },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {/* Spinning ring */}
        <div className={`${classes.container} relative`}>
          <svg className="w-full h-full animate-spin" viewBox="0 0 50 50">
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="80 50"
              strokeLinecap="round"
              className="text-blue-500"
            />
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Train className={`${classes.icon} text-zinc-400`} />
          </div>
        </div>
      </div>
      {message && (
        <p className={`${classes.text} text-zinc-400 font-medium`}>{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
