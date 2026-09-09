import { useEffect, useState } from "react";
import { MobileDashboard } from "@/components/mobile-dashboard";

const EXIT_MS = 340;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The mobile "home" dashboard, presented as a full-height sheet over the map.
 *
 * Home and map are the same space at two depths, so the transition is one
 * path in both directions (§ spatial consistency): the sheet slides down to
 * reveal the map and slides back up to return. It stays mounted through the
 * exit so it actually animates out instead of vanishing, and collapses to an
 * instant swap under reduced-motion.
 */
export function MobileHome({ open }: { open: boolean }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  // Mount immediately when opening (render-phase, React-sanctioned).
  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    if (open) {
      raf = requestAnimationFrame(() => setShown(true));
    } else {
      raf = requestAnimationFrame(() => setShown(false));
      timer = window.setTimeout(
        () => setMounted(false),
        prefersReducedMotion() ? 0 : EXIT_MS
      );
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black"
      aria-hidden={!shown}
      style={{
        transform: shown ? "translateY(0)" : "translateY(100%)",
        opacity: shown ? 1 : 0,
        transition:
          "transform 340ms cubic-bezier(0.32,0.72,0,1), opacity 240ms ease",
        pointerEvents: shown ? "auto" : "none",
        willChange: "transform",
      }}
    >
      <MobileDashboard />
    </div>
  );
}
