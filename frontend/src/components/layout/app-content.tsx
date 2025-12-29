import { SidebarInset } from "@/components/ui/sidebar";
import * as React from "react";

interface AppContentProps extends React.ComponentProps<"div"> {
  variant?: "header" | "sidebar";
}

const AppContent = ({
  variant = "header",
  children,
  ...props
}: AppContentProps) => {
  if (variant === "sidebar") {
    return <SidebarInset {...props}>{children}</SidebarInset>;
  }

  return (
    <main
      className="mx-auto flex h-full w-full max-w-full px-4 md:max-w-6xl lg:max-w-7xl flex-1 flex-col gap-4 rounded-xl"
      {...props}
    >
      {children}
    </main>
  );
};

export default AppContent;
