import { useState, useEffect, useCallback } from 'react';
import type { RouteLine, Station } from '@/services/api';

interface TrainPosition {
    lat: number;
    lng: number;
    bearing: number;
    progress: number;
    currentStation?: any;
    nextStation?: any;
}

interface UseTrainSimulationProps {
    routeLines: RouteLine[];
    stations: Station[];
    lineColor: 'red' | 'blue';
    speed?: number;
}

export const useTrainSimulation = ({
    routeLines,
    stations,
    lineColor,
    speed = 0.0008
}: UseTrainSimulationProps) => {
    const [trainPosition, setTrainPosition] = useState<TrainPosition | null>(null);
    const [currentPath, setCurrentPath] = useState<[number, number][]>([]);
    const [isMoving, setIsMoving] = useState(true);

    useEffect(() => {
        if (routeLines.length > 0) {
            const path: [number, number][] = [];

            routeLines.forEach(routeLine => {
                if (routeLine.coordinates && Array.isArray(routeLine.coordinates)) {
                    path.push(...routeLine.coordinates);
                }
            });

            setCurrentPath(path);

            if (path.length > 0) {
                const startPoint = path[0];
                setTrainPosition({
                    lat: startPoint[1],
                    lng: startPoint[0],
                    bearing: 0,
                    progress: 0
                });
            }
        }
    }, [routeLines]);

    // Calculate bearing between two points
    const calculateBearing = (point1: [number, number], point2: [number, number]): number => {
        const [lng1, lat1] = point1;
        const [lng2, lat2] = point2;

        const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);

        const bearing = Math.atan2(y, x);
        return (bearing * 180) / Math.PI;
    };

    // Find nearest station
    const findNearestStation = useCallback((lat: number, lng: number): {
        current?: any;
        next?: any;
    } => {
        if (!stations.length) return {};

        let nearestStation: any;
        let nextStation: any;
        let minDistance = Infinity;

        stations.forEach((station, index) => {
            const distance = Math.sqrt(
                Math.pow(station.latitude - lat, 2) +
                Math.pow(station.longitude - lng, 2)
            ) * 111000; // Convert to meters

            if (distance < minDistance) {
                minDistance = distance;
                nearestStation = station;
                nextStation = stations[(index + 1) % stations.length];
            }
        });

        return { current: nearestStation, next: nextStation };
    }, [stations]);

    // Animate train along path
    useEffect(() => {
        if (!currentPath.length || !trainPosition || !isMoving) return;

        let animationFrameId: number;
        let progress = trainPosition.progress;

        const animate = () => {
            progress += speed;

            if (progress > 1) {
                progress = 0; // Loop back to start
            }

            // Calculate current position along path
            const totalPoints = currentPath.length;
            const exactIndex = progress * (totalPoints - 1);
            const index1 = Math.floor(exactIndex);
            const index2 = Math.min(index1 + 1, totalPoints - 1);
            const t = exactIndex - index1;

            const point1 = currentPath[index1];
            const point2 = currentPath[index2];

            // Interpolate position
            const lat = point1[1] + (point2[1] - point1[1]) * t;
            const lng = point1[0] + (point2[0] - point1[0]) * t;

            // Calculate bearing
            const bearing = calculateBearing(point1, point2);

            // Find nearest stations
            const stationsInfo = findNearestStation(lat, lng);

            setTrainPosition({
                lat,
                lng,
                bearing,
                progress,
                currentStation: stationsInfo.current,
                nextStation: stationsInfo.next
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        animationFrameId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [currentPath, trainPosition?.progress, speed, isMoving, findNearestStation]);

    const toggleMovement = () => {
        setIsMoving(!isMoving);
    };

    const setSpeed = (newSpeed: number) => {
        speed = newSpeed;
    };

    return {
        trainPosition,
        isMoving,
        toggleMovement,
        setSpeed
    };
};