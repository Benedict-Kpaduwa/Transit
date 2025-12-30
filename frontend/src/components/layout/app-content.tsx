import * as React from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "../../lib/utils";

interface AppContentProps extends React.ComponentProps<"main"> {
  variant?: "header" | "sidebar";
}

const AppContent = ({
  variant = "header",
  children,
  className,
  ...props
}: AppContentProps) => {
  const { state, isMobile } = useSidebar();

  if (variant === "sidebar") {
    return (
      <main
        className={cn(
          "relative flex min-h-screen flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
          "bg-slate-50 dark:bg-slate-950",
          className
        )}
        {...props}
      >
        <div className="flex flex-1 flex-col">{children}</div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "mx-auto flex min-h-screen w-full flex-1 flex-col gap-4 p-4",
        "md:max-w-6xl lg:max-w-7xl",
        "animate-in fade-in duration-500",
        className
      )}
      {...props}
    >
      {children}
    </main>
  );
};

export default AppContent;
