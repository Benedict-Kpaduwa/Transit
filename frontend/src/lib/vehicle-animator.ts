/**
 * Shared vehicle animation engine.
 *
 * GTFS-realtime feeds only update every 10-60s, so raw positions teleport.
 * This module smooths them the way ride-hailing apps do: every consumer
 * (2D markers, 3D models, camera follow) reads interpolated positions from
 * one requestAnimationFrame loop instead of animating independently.
 *
 * Key behaviors:
 * - Adaptive duration: each vehicle animates over the actual time elapsed
 *   between its last two updates, so motion stays continuous regardless of
 *   whether the feed refreshes every 10s or every 60s.
 * - Segments always start from the currently rendered position, so a new
 *   update mid-flight redirects the vehicle instead of snapping it.
 * - Bearing follows the direction of travel when the feed omits it, and
 *   always rotates along the shortest arc.
 * - Teleports (vehicle reassigned across the city) snap instead of gliding.
 */

export interface VehicleTarget {
  id: string;
  lng: number;
  lat: number;
  bearing?: number;
}

export interface AnimatedPosition {
  lng: number;
  lat: number;
  bearing: number;
}

interface AnimState {
  startLng: number;
  startLat: number;
  startBearing: number;
  targetLng: number;
  targetLat: number;
  targetBearing: number;
  startTime: number;
  duration: number;
  /** When the target was last changed — used to measure the feed's real cadence. */
  lastTargetTime: number;
}

const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 65_000;
const DEFAULT_DURATION_MS = 10_000;
/** ~0.9km at Calgary's latitude — larger jumps snap instead of animating. */
const SNAP_DISTANCE_DEG = 0.012;
/** Movement below this is jitter; don't restart the segment or re-derive bearing. */
const EPSILON_DEG = 1e-6;

function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

function shortestBearingDelta(from: number, to: number): number {
  let diff = to - from;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function headingFromMovement(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number
): number {
  const dLng = (toLng - fromLng) * Math.cos((fromLat * Math.PI) / 180);
  const dLat = toLat - fromLat;
  return normalizeBearing((Math.atan2(dLng, dLat) * 180) / Math.PI);
}

class VehicleAnimator {
  private anims = new Map<string, AnimState>();
  private listeners = new Set<() => void>();
  private rafId: number | null = null;

  /**
   * Feed the latest raw positions. Vehicles absent from the list are pruned.
   * Safe to call with identical data (unchanged targets are ignored).
   */
  setVehicles(targets: VehicleTarget[]): void {
    const now = performance.now();
    const activeIds = new Set<string>();

    for (const t of targets) {
      if (
        !t.id ||
        typeof t.lng !== "number" ||
        typeof t.lat !== "number" ||
        Number.isNaN(t.lng) ||
        Number.isNaN(t.lat)
      ) {
        continue;
      }
      activeIds.add(t.id);

      const existing = this.anims.get(t.id);
      const reportedBearing =
        typeof t.bearing === "number" && !Number.isNaN(t.bearing)
          ? normalizeBearing(t.bearing)
          : null;

      if (!existing) {
        // New vehicle: appear in place, no animation.
        const bearing = reportedBearing ?? 0;
        this.anims.set(t.id, {
          startLng: t.lng,
          startLat: t.lat,
          startBearing: bearing,
          targetLng: t.lng,
          targetLat: t.lat,
          targetBearing: bearing,
          startTime: now,
          duration: 0,
          lastTargetTime: now,
        });
        continue;
      }

      const dLng = t.lng - existing.targetLng;
      const dLat = t.lat - existing.targetLat;
      const moved = Math.abs(dLng) > EPSILON_DEG || Math.abs(dLat) > EPSILON_DEG;
      const bearingChanged =
        reportedBearing !== null &&
        Math.abs(shortestBearingDelta(existing.targetBearing, reportedBearing)) > 0.5;

      if (!moved && !bearingChanged) continue;

      const current = this.interpolate(existing, now);

      // Teleport guard: don't glide across the city.
      if (Math.abs(dLng) > SNAP_DISTANCE_DEG || Math.abs(dLat) > SNAP_DISTANCE_DEG) {
        const bearing = reportedBearing ?? current.bearing;
        this.anims.set(t.id, {
          startLng: t.lng,
          startLat: t.lat,
          startBearing: bearing,
          targetLng: t.lng,
          targetLat: t.lat,
          targetBearing: bearing,
          startTime: now,
          duration: 0,
          lastTargetTime: now,
        });
        continue;
      }

      // Animate over the feed's observed cadence so motion stays continuous.
      const sinceLast = now - existing.lastTargetTime;
      const duration =
        sinceLast >= MIN_DURATION_MS && sinceLast <= MAX_DURATION_MS
          ? sinceLast
          : DEFAULT_DURATION_MS;

      // Prefer the reported bearing; fall back to the direction of travel.
      let targetBearing = reportedBearing;
      if (targetBearing === null || targetBearing === 0) {
        targetBearing = moved
          ? headingFromMovement(current.lng, current.lat, t.lng, t.lat)
          : current.bearing;
      }

      this.anims.set(t.id, {
        startLng: current.lng,
        startLat: current.lat,
        startBearing: current.bearing,
        targetLng: t.lng,
        targetLat: t.lat,
        targetBearing,
        startTime: now,
        duration,
        lastTargetTime: now,
      });
    }

    for (const id of this.anims.keys()) {
      if (!activeIds.has(id)) this.anims.delete(id);
    }

    this.ensureLoop();
  }

  /** Current interpolated position, or undefined if the vehicle is unknown. */
  getPosition(id: string): AnimatedPosition | undefined {
    const anim = this.anims.get(id);
    if (!anim) return undefined;
    return this.interpolate(anim, performance.now());
  }

  hasVehicle(id: string): boolean {
    return this.anims.has(id);
  }

  /**
   * Called once per animation frame while any segment is in flight.
   * Consumers pull positions via getPosition inside the callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    this.ensureLoop();
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.anims.clear();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private interpolate(anim: AnimState, now: number): AnimatedPosition {
    if (anim.duration <= 0) {
      return { lng: anim.targetLng, lat: anim.targetLat, bearing: anim.targetBearing };
    }
    const progress = Math.min((now - anim.startTime) / anim.duration, 1);
    return {
      lng: anim.startLng + (anim.targetLng - anim.startLng) * progress,
      lat: anim.startLat + (anim.targetLat - anim.startLat) * progress,
      bearing: normalizeBearing(
        anim.startBearing +
          shortestBearingDelta(anim.startBearing, anim.targetBearing) * progress
      ),
    };
  }

  private ensureLoop(): void {
    if (this.rafId !== null) return;
    if (this.listeners.size === 0 || this.anims.size === 0) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = () => {
    this.rafId = null;
    const now = performance.now();

    let anyActive = false;
    for (const anim of this.anims.values()) {
      if (anim.duration > 0 && now - anim.startTime < anim.duration) {
        anyActive = true;
        break;
      }
    }

    for (const listener of this.listeners) listener();

    // Keep ticking while segments are in flight; otherwise sleep until the
    // next setVehicles/subscribe call wakes the loop.
    if (anyActive && this.listeners.size > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };
}

export const vehicleAnimator = new VehicleAnimator();
