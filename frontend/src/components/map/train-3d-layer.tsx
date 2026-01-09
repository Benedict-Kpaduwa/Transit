import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";

export interface TrainPositionData {
  id: string;
  lng: number;
  lat: number;
  bearing: number;
  nearestStation?: string;
  vehicleId?: string;
  tripId?: string;
}

interface Train3DLayerProps {
  map: mapboxgl.Map | null;
  // Support both single position (for simulation) and array (for real data)
  redTrainPosition?: { lng: number; lat: number; bearing: number } | null;
  blueTrainPosition?: { lng: number; lat: number; bearing: number } | null;
  // New props for multiple real trains
  redTrains?: TrainPositionData[];
  blueTrains?: TrainPositionData[];
}

// Animation duration in milliseconds - slightly less than poll interval for smooth overlap
const ANIMATION_DURATION = 9500;

// Linear easing for constant speed movement (more natural for transit)
function linear(t: number): number {
  return t;
}

// Interpolate between two values
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// Interpolate bearing (handle 360 degree wraparound)
function lerpBearing(start: number, end: number, t: number): number {
  let diff = end - start;
  // Handle wraparound
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return start + diff * t;
}

// Store animation state for each train
interface AnimationState {
  startLng: number;
  startLat: number;
  startBearing: number;
  targetLng: number;
  targetLat: number;
  targetBearing: number;
  startTime: number;
  animationId: number | null;
}

// Create a 3D-looking train marker element
function createTrainMarkerElement(color: "red" | "blue"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "train-3d-marker";

  const colorConfig = {
    red: {
      primary: "#DC143C",
      secondary: "#FF4444",
      glow: "rgba(220, 20, 60, 0.6)",
      shadow: "rgba(139, 0, 0, 0.8)",
    },
    blue: {
      primary: "#0088FF",
      secondary: "#44AAFF",
      glow: "rgba(0, 136, 255, 0.6)",
      shadow: "rgba(0, 50, 100, 0.8)",
    },
  };

  const colors = colorConfig[color];

  el.innerHTML = `
    <div class="train-container" style="
      position: relative;
      width: 60px;
      height: 30px;
      transform-style: preserve-3d;
      transform: rotateX(45deg);
    ">
      <!-- Train body -->
      <div style="
        position: absolute;
        width: 50px;
        height: 20px;
        left: 5px;
        top: 5px;
        background: linear-gradient(180deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${colors.shadow} 100%);
        border-radius: 6px 6px 2px 2px;
        box-shadow: 
          0 4px 8px rgba(0,0,0,0.4),
          0 0 20px ${colors.glow},
          inset 0 2px 4px rgba(255,255,255,0.3);
        transform: translateZ(8px);
      ">
        <!-- Windows -->
        <div style="
          position: absolute;
          top: 4px;
          left: 4px;
          right: 4px;
          height: 8px;
          background: linear-gradient(180deg, #87CEEB 0%, #5BA3D0 100%);
          border-radius: 2px;
          opacity: 0.9;
        "></div>
        <!-- Stripe -->
        <div style="
          position: absolute;
          bottom: 3px;
          left: 2px;
          right: 2px;
          height: 2px;
          background: #FFD700;
          border-radius: 1px;
        "></div>
      </div>
      
      <!-- Front light -->
      <div style="
        position: absolute;
        width: 6px;
        height: 6px;
        right: 2px;
        top: 12px;
        background: radial-gradient(circle, #FFFF00 0%, #FFD700 50%, transparent 100%);
        border-radius: 50%;
        box-shadow: 0 0 10px #FFFF00, 0 0 20px #FFD700;
        transform: translateZ(10px);
        animation: pulse-light 1s ease-in-out infinite;
      "></div>
      
      <!-- Wheels (left side) -->
      <div style="
        position: absolute;
        width: 8px;
        height: 8px;
        left: 10px;
        bottom: -2px;
        background: linear-gradient(135deg, #333 0%, #666 50%, #222 100%);
        border-radius: 50%;
        border: 1px solid #444;
        transform: translateZ(2px);
      "></div>
      <div style="
        position: absolute;
        width: 8px;
        height: 8px;
        left: 42px;
        bottom: -2px;
        background: linear-gradient(135deg, #333 0%, #666 50%, #222 100%);
        border-radius: 50%;
        border: 1px solid #444;
        transform: translateZ(2px);
      "></div>
      
      <!-- Shadow -->
      <div style="
        position: absolute;
        width: 55px;
        height: 15px;
        left: 2px;
        top: 20px;
        background: radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%);
        transform: translateZ(-5px) rotateX(-45deg);
        filter: blur(3px);
      "></div>
      
      <!-- Pulse ring -->
      <div style="
        position: absolute;
        width: 70px;
        height: 70px;
        left: -5px;
        top: -20px;
        border: 2px solid ${colors.glow};
        border-radius: 50%;
        animation: pulse-ring 2s ease-out infinite;
        transform: translateZ(-10px);
      "></div>
    </div>
  `;

  return el;
}

export default function Train3DLayer({
  map,
  redTrainPosition,
  blueTrainPosition,
  redTrains = [],
  blueTrains = [],
}: Train3DLayerProps) {
  // Refs for single simulated markers (backwards compatibility)
  const redMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const blueMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Refs for multiple real train markers
  const redMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const blueMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // Animation states for smooth transitions
  const redAnimationsRef = useRef<Map<string, AnimationState>>(new Map());
  const blueAnimationsRef = useRef<Map<string, AnimationState>>(new Map());

  const styleAddedRef = useRef(false);

  // Determine if we're using real data or simulation
  const useRealData = redTrains.length > 0 || blueTrains.length > 0;

  // Animate a marker smoothly from current to target position
  const animateMarker = useCallback(
    (
      marker: mapboxgl.Marker,
      trainId: string,
      targetLng: number,
      targetLat: number,
      targetBearing: number,
      animationsRef: React.MutableRefObject<Map<string, AnimationState>>
    ) => {
      // Get current position as starting point
      const currentPos = marker.getLngLat();
      const currentRotation = marker.getRotation() + 90; // Convert back from display rotation

      // Cancel any existing animation for this train
      const existingAnimation = animationsRef.current.get(trainId);
      if (existingAnimation?.animationId) {
        cancelAnimationFrame(existingAnimation.animationId);
      }

      // If this is a new marker or position hasn't changed significantly, snap directly
      const distance = Math.sqrt(
        Math.pow(targetLng - currentPos.lng, 2) +
          Math.pow(targetLat - currentPos.lat, 2)
      );

      if (distance < 0.00001) {
        // Position barely changed, just update bearing
        marker.setRotation(targetBearing - 90);
        return;
      }

      // Create new animation state
      const animState: AnimationState = {
        startLng: currentPos.lng,
        startLat: currentPos.lat,
        startBearing: currentRotation,
        targetLng,
        targetLat,
        targetBearing,
        startTime: performance.now(),
        animationId: null,
      };

      const animate = (currentTime: number) => {
        const elapsed = currentTime - animState.startTime;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = linear(progress);

        // Interpolate position and bearing
        const lng = lerp(animState.startLng, animState.targetLng, easedProgress);
        const lat = lerp(animState.startLat, animState.targetLat, easedProgress);
        const bearing = lerpBearing(
          animState.startBearing,
          animState.targetBearing,
          easedProgress
        );

        // Update marker position
        marker.setLngLat([lng, lat]);
        marker.setRotation(bearing - 90);

        // Continue animation if not complete
        if (progress < 1) {
          animState.animationId = requestAnimationFrame(animate);
          animationsRef.current.set(trainId, animState);
        } else {
          animationsRef.current.delete(trainId);
        }
      };

      // Start animation
      animState.animationId = requestAnimationFrame(animate);
      animationsRef.current.set(trainId, animState);
    },
    []
  );

  // Add CSS styles for animations
  const addStyles = useCallback(() => {
    if (styleAddedRef.current) return;

    const style = document.createElement("style");
    style.id = "train-3d-styles";
    style.textContent = `
      .train-3d-marker {
        cursor: pointer;
        will-change: transform;
      }
      
      .train-3d-marker:hover {
        transform: scale(1.1);
      }
      
      @keyframes pulse-ring {
        0% {
          transform: translateZ(-10px) scale(0.8);
          opacity: 1;
        }
        100% {
          transform: translateZ(-10px) scale(1.5);
          opacity: 0;
        }
      }
      
      @keyframes pulse-light {
        0%, 100% {
          opacity: 1;
          box-shadow: 0 0 10px #FFFF00, 0 0 20px #FFD700;
        }
        50% {
          opacity: 0.7;
          box-shadow: 0 0 5px #FFFF00, 0 0 10px #FFD700;
        }
      }
    `;
    document.head.appendChild(style);
    styleAddedRef.current = true;
  }, []);

  // Initialize single markers for simulation mode
  useEffect(() => {
    if (!map || useRealData) return;

    addStyles();

    // Create red train marker
    const redEl = createTrainMarkerElement("red");
    const redMarker = new mapboxgl.Marker({
      element: redEl,
      rotationAlignment: "map",
      pitchAlignment: "map",
    })
      .setLngLat([0, 0])
      .addTo(map);
    redMarkerRef.current = redMarker;

    // Create blue train marker
    const blueEl = createTrainMarkerElement("blue");
    const blueMarker = new mapboxgl.Marker({
      element: blueEl,
      rotationAlignment: "map",
      pitchAlignment: "map",
    })
      .setLngLat([0, 0])
      .addTo(map);
    blueMarkerRef.current = blueMarker;

    return () => {
      redMarker.remove();
      blueMarker.remove();
    };
  }, [map, addStyles, useRealData]);

  // Manage multiple red train markers for real data with smooth animation
  useEffect(() => {
    if (!map || !useRealData) return;

    addStyles();

    // Filter out trains with invalid coordinates
    const validTrains = redTrains.filter(
      (t) =>
        t.id &&
        typeof t.lng === "number" &&
        typeof t.lat === "number" &&
        !isNaN(t.lng) &&
        !isNaN(t.lat)
    );

    const currentIds = new Set(validTrains.map((t) => t.id));
    const existingIds = new Set(redMarkersRef.current.keys());

    // Remove markers that are no longer in the data
    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        // Cancel any ongoing animation
        const animation = redAnimationsRef.current.get(id);
        if (animation?.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
        redAnimationsRef.current.delete(id);

        const marker = redMarkersRef.current.get(id);
        marker?.remove();
        redMarkersRef.current.delete(id);
      }
    });

    // Add or update markers with smooth animation
    validTrains.forEach((train) => {
      let marker = redMarkersRef.current.get(train.id);

      if (!marker) {
        // Create new marker with initial position (no animation for new markers)
        const el = createTrainMarkerElement("red");
        marker = new mapboxgl.Marker({
          element: el,
          rotationAlignment: "map",
          pitchAlignment: "map",
        })
          .setLngLat([train.lng, train.lat])
          .setRotation((train.bearing || 0) - 90)
          .addTo(map);
        redMarkersRef.current.set(train.id, marker);
      } else {
        // Animate to new position
        animateMarker(
          marker,
          train.id,
          train.lng,
          train.lat,
          train.bearing || 0,
          redAnimationsRef
        );
      }
    });

    return () => {
      // Cancel all animations on unmount
      redAnimationsRef.current.forEach((animation) => {
        if (animation.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
      });
      redAnimationsRef.current.clear();

      // Cleanup all markers on unmount
      redMarkersRef.current.forEach((marker) => marker.remove());
      redMarkersRef.current.clear();
    };
  }, [map, redTrains, useRealData, addStyles, animateMarker]);

  // Manage multiple blue train markers for real data with smooth animation
  useEffect(() => {
    if (!map || !useRealData) return;

    addStyles();

    // Filter out trains with invalid coordinates
    const validTrains = blueTrains.filter(
      (t) =>
        t.id &&
        typeof t.lng === "number" &&
        typeof t.lat === "number" &&
        !isNaN(t.lng) &&
        !isNaN(t.lat)
    );

    const currentIds = new Set(validTrains.map((t) => t.id));
    const existingIds = new Set(blueMarkersRef.current.keys());

    // Remove markers that are no longer in the data
    existingIds.forEach((id) => {
      if (!currentIds.has(id)) {
        // Cancel any ongoing animation
        const animation = blueAnimationsRef.current.get(id);
        if (animation?.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
        blueAnimationsRef.current.delete(id);

        const marker = blueMarkersRef.current.get(id);
        marker?.remove();
        blueMarkersRef.current.delete(id);
      }
    });

    // Add or update markers with smooth animation
    validTrains.forEach((train) => {
      let marker = blueMarkersRef.current.get(train.id);

      if (!marker) {
        // Create new marker with initial position (no animation for new markers)
        const el = createTrainMarkerElement("blue");
        marker = new mapboxgl.Marker({
          element: el,
          rotationAlignment: "map",
          pitchAlignment: "map",
        })
          .setLngLat([train.lng, train.lat])
          .setRotation((train.bearing || 0) - 90)
          .addTo(map);
        blueMarkersRef.current.set(train.id, marker);
      } else {
        // Animate to new position
        animateMarker(
          marker,
          train.id,
          train.lng,
          train.lat,
          train.bearing || 0,
          blueAnimationsRef
        );
      }
    });

    return () => {
      // Cancel all animations on unmount
      blueAnimationsRef.current.forEach((animation) => {
        if (animation.animationId) {
          cancelAnimationFrame(animation.animationId);
        }
      });
      blueAnimationsRef.current.clear();

      // Cleanup all markers on unmount
      blueMarkersRef.current.forEach((marker) => marker.remove());
      blueMarkersRef.current.clear();
    };
  }, [map, blueTrains, useRealData, addStyles, animateMarker]);

  // Update single red train position (simulation mode)
  useEffect(() => {
    if (useRealData) return;
    if (redMarkerRef.current && redTrainPosition) {
      redMarkerRef.current.setLngLat([
        redTrainPosition.lng,
        redTrainPosition.lat,
      ]);
      redMarkerRef.current.setRotation(redTrainPosition.bearing - 90);
    }
  }, [redTrainPosition, useRealData]);

  // Update single blue train position (simulation mode)
  useEffect(() => {
    if (useRealData) return;
    if (blueMarkerRef.current && blueTrainPosition) {
      blueMarkerRef.current.setLngLat([
        blueTrainPosition.lng,
        blueTrainPosition.lat,
      ]);
      blueMarkerRef.current.setRotation(blueTrainPosition.bearing - 90);
    }
  }, [blueTrainPosition, useRealData]);

  return null;
}

