import * as React from "react";
import { cva } from "class-variance-authority";
import { PanelLeftIcon, ChevronDown, Menu, type LucideIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

const SIDEBAR_WIDTH = "20rem";
const SIDEBAR_WIDTH_ICON = "4.5rem";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value);
      } else {
        setUncontrolledOpen(value);
      }
    },
    [isControlled, onOpenChange]
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev);
    } else {
      setOpen(!open);
    }
  }, [open, setOpen, isMobile]);

  const state: "expanded" | "collapsed" = open ? "expanded" : "collapsed";

  const value = React.useMemo(
    () => ({ state, open, setOpen, isMobile, toggleSidebar, openMobile, setOpenMobile }),
    [state, open, setOpen, isMobile, toggleSidebar, openMobile, setOpenMobile]
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            } as React.CSSProperties
          }
          className={cn("flex min-h-screen w-full bg-[#0a0a0a]", className)}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className }: React.ComponentProps<"div">) {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return null;
  }

  return (
    <aside
      data-state={state}
      className={cn(
        "group sticky top-0 z-20 hidden h-screen transition-[width] duration-300 ease-in-out md:block shrink-0",
        state === "expanded"
          ? "w-(--sidebar-width)"
          : "w-(--sidebar-width-icon)",
        className
      )}
    >
      <div className="flex h-full w-full flex-col bg-sidebar backdrop-blur-md overflow-hidden">
        {children}
      </div>
    </aside>
  );
}

// --- Header, Content, Footer ---
export function SidebarHeader({
  children,
  className,
}: React.ComponentProps<"div">) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        "flex h-20 items-center shrink-0 transition-all duration-300",
        state === "expanded" ? "px-4" : "px-2 justify-center",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarContent({
  children,
  className,
}: React.ComponentProps<"div">) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar transition-all duration-300",
        state === "expanded" ? "px-3 py-2 space-y-4" : "px-1 py-2",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarFooter({
  children,
  className,
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto border-t border-slate-100 p-4 dark:border-slate-800",
        className
      )}
    >
      {children}
    </div>
  );
}

// --- Groups & Labels ---
export function SidebarGroup({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { state } = useSidebar();
  return (
    <div className={cn("space-y-1", className)}>
      {label && state === "expanded" && (
        <h4 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
          {label}
        </h4>
      )}
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

// --- Interactive Items ---
const sidebarButtonVariants = cva(
  "group/btn flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
  {
    variants: {
      active: {
        true: "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none",
        false:
          "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
      },
    },
    defaultVariants: { active: false },
  }
);

export function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const { state } = useSidebar();
  const [isOpen, setIsOpen] = React.useState(false);
  const hasChildren = !!children;

  const handleToggle = (e: React.MouseEvent) => {
    if (hasChildren) {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (onClick) {
      onClick();
    }
  };

  const buttonContent = (
    <button
      onClick={handleToggle}
      className={cn(
        sidebarButtonVariants({ active: active && !hasChildren }),
        hasChildren && isOpen && "text-slate-900 dark:text-white"
      )}
    >
      <Icon
        className={cn(
          "size-5 shrink-0 transition-transform group-hover/btn:scale-110"
        )}
      />
      {state === "expanded" && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {hasChildren && (
            <ChevronDown
              className={cn(
                "size-4 opacity-50 transition-transform duration-200",
                isOpen && "rotate-180 opacity-100"
              )}
            />
          )}
        </>
      )}
    </button>
  );

  return (
    <li>
      {state === "collapsed" ? (
        <Tooltip>
          <TooltipTrigger asChild>{buttonContent}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        buttonContent
      )}

      {hasChildren && state === "expanded" && isOpen && (
        <ul className="mt-1 ml-5 border-l-2 border-slate-100 pl-2 space-y-1 dark:border-slate-800 animate-in fade-in slide-in-from-top-1">
          {children}
        </ul>
      )}
    </li>
  );
}

export function SidebarSubItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center px-4 py-2 text-sm transition-all rounded-lg",
        active
          ? "text-indigo-600 font-semibold bg-indigo-50/50 dark:bg-indigo-900/20"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50"
      )}
    >
      {label}
    </button>
  );
}

// --- Trigger ---
export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar, state } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full h-9 w-9 hover:bg-slate-100 dark:hover:bg-slate-800",
        className
      )}
      onClick={toggleSidebar}
    >
      <PanelLeftIcon
        className={cn(
          "size-5 transition-transform duration-300",
          state === "collapsed" && "rotate-180 text-sidebar-primary"
        )}
      />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}
