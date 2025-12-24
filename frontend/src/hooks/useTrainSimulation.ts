import { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import { type Station } from "@/data/StationObject";
import type { RouteLine } from "@/services/api";

interface SimulationProps {
    routeLines: RouteLine[];
    stations: Station[];
    lineColor: string;
    speed: number;
}

export const useTrainSimulation = ({ routeLines, stations, lineColor, speed }: SimulationProps) => {
    const [trainPosition, setTrainPosition] = useState<{
        lng: number;
        lat: number;
        bearing: number;
        currentStation?: Station;
        nextStation?: Station;
    } | null>(null);

    const [isMoving, setIsMoving] = useState(true);
    const [progress, setProgress] = useState(0);
    const [isWaiting, setIsWaiting] = useState(false);
    const lastStationRef = useRef<string | null>(null);

    const fullLine = useRef<any>(null);
    const lineDistance = useRef<number>(0);

    useEffect(() => {
        if (routeLines.length > 0) {
            const relevantLines = routeLines.filter(l =>
                l.properties.line.toLowerCase().includes(lineColor.toLowerCase())
            );

            const coords = relevantLines.flatMap(line => line.coordinates);
            if (coords.length > 1) {
                fullLine.current = turf.lineString(coords);
                lineDistance.current = turf.length(fullLine.current);
            }
        }
    }, [routeLines, lineColor]);

    useEffect(() => {
        if (!fullLine.current || !isMoving || isWaiting) return;

        let animationFrame: number;
        const animate = () => {
            setProgress((prev) => {
                const nextProgress = prev + speed;
                const currentPoint = turf.along(fullLine.current!, nextProgress);
                const nearbyStation = stations.find(s =>
                    turf.distance(currentPoint, s.coords) < 0.05
                );

                if (nearbyStation && lastStationRef.current !== nearbyStation.id) {
                    setIsWaiting(true);
                    lastStationRef.current = nearbyStation.id;

                    setTimeout(() => {
                        setIsWaiting(false);
                    }, 5000);

                    return prev;
                }

                return nextProgress > lineDistance.current ? 0 : nextProgress;
            });
            animationFrame = requestAnimationFrame(animate);
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [isMoving, speed, isWaiting, stations]);

    useEffect(() => {
        if (!fullLine.current) return;

        const currentPoint = turf.along(fullLine.current, progress);
        const nextPoint = turf.along(fullLine.current, progress + 0.02);
        const bearing = turf.bearing(currentPoint, nextPoint);

        const lng = currentPoint.geometry.coordinates[0];
        const lat = currentPoint.geometry.coordinates[1];

        const closestStation = stations.reduce((prev, curr) => {
            const dist = turf.distance([lng, lat], curr.coords);
            return (dist < turf.distance([lng, lat], prev.coords)) ? curr : prev;
        }, stations[0]);

        setTrainPosition({
            lng,
            lat,
            bearing,
            currentStation: closestStation,
            nextStation: closestStation
        });
    }, [progress, stations]);

    return {
        trainPosition,
        isMoving,
        toggleMovement: () => setIsMoving(!isMoving)
    };
};