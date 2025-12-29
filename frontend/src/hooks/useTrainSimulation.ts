import { useState, useEffect, useRef, useCallback } from "react";
import * as turf from "@turf/turf";
import type { Station, RouteLine } from "@/types";

interface SimulationProps {
  routeLines: RouteLine[];
  stations: Station[];
  lineColor: string;
  speed: number;
}

interface TrainPosition {
  lng: number;
  lat: number;
  bearing: number;
  currentStation?: Station;
  nextStation?: Station;
}

export const useTrainSimulation = ({
  routeLines,
  stations,
  lineColor,
  speed,
}: SimulationProps) => {
  // Only trainPosition is React state - this is what components render
  const [trainPosition, setTrainPosition] = useState<TrainPosition | null>(
    null
  );
  const [isMoving, setIsMoving] = useState(true);

  // ALL animation state is in refs - no re-renders during animation!
  const progressRef = useRef(0);
  const isWaitingRef = useRef(false);
  const lastStationRef = useRef<string | null>(null);
  const fullLineRef = useRef<ReturnType<typeof turf.lineString> | null>(null);
  const lineDistanceRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const stationsRef = useRef(stations);
  const isMovingRef = useRef(isMoving);
  const speedRef = useRef(speed);

  // Keep refs in sync with props/state
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    isMovingRef.current = isMoving;
  }, [isMoving]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Initialize the route line
  useEffect(() => {
    if (routeLines.length > 0) {
      const relevantLines = routeLines.filter((l) =>
        l.properties.line.toLowerCase().includes(lineColor.toLowerCase())
      );
      const coords = relevantLines.flatMap((line) => line.coordinates);
      if (coords.length > 1) {
        fullLineRef.current = turf.lineString(coords);
        lineDistanceRef.current = turf.length(fullLineRef.current);
      }
    }
  }, [routeLines, lineColor]);

  // Single animation loop - updates refs and only calls ONE setState per frame
  useEffect(() => {
    const animate = () => {
      // Check conditions using refs (no dependency on React state)
      if (
        !fullLineRef.current ||
        !isMovingRef.current ||
        isWaitingRef.current
      ) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update progress (ref, no re-render)
      const nextProgress = progressRef.current + speedRef.current;
      progressRef.current =
        nextProgress > lineDistanceRef.current ? 0 : nextProgress;

      // Calculate position
      const currentPoint = turf.along(fullLineRef.current, progressRef.current);
      const nextPoint = turf.along(
        fullLineRef.current,
        progressRef.current + 0.02
      );
      const bearing = turf.bearing(currentPoint, nextPoint);
      const lng = currentPoint.geometry.coordinates[0];
      const lat = currentPoint.geometry.coordinates[1];

      // Check for station stops
      const nearbyStation = stationsRef.current.find(
        (s) => turf.distance(currentPoint, s.coords) < 0.05
      );

      if (nearbyStation && lastStationRef.current !== nearbyStation.name) {
        isWaitingRef.current = true;
        lastStationRef.current = nearbyStation.name;
        setTimeout(() => {
          isWaitingRef.current = false;
        }, 3000); // 3 second stop at stations
      }

      // Find closest station for display
      const closestStation =
        stationsRef.current.length > 0
          ? stationsRef.current.reduce((prev, curr) => {
              const dist = turf.distance([lng, lat], curr.coords);
              return dist < turf.distance([lng, lat], prev.coords)
                ? curr
                : prev;
            }, stationsRef.current[0])
          : undefined;

      // ONLY state update - one per frame
      setTrainPosition({
        lng,
        lat,
        bearing,
        currentStation: closestStation,
        nextStation: closestStation,
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // Empty deps - runs once, uses refs for everything

  const toggleMovement = useCallback(() => {
    setIsMoving((prev) => !prev);
  }, []);

  return {
    trainPosition,
    isMoving,
    toggleMovement,
  };
};
