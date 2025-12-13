// components/Train3D.tsx
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as turf from "@turf/turf";

interface Train3DProps {
  map: mapboxgl.Map;
  pathCoords: [number, number][];
  color?: string;
  speed?: number;
}

export default function Train3D({
  map,
  pathCoords,
  color = "#ffffff",
  speed = 1,
}: Train3DProps) {
  const { scene } = useGLTF("/train.glb");
  const trainRef = useRef<THREE.Group>(null);
  const progress = useRef(0);

  const line = turf.lineString(pathCoords);
  const length = turf.length(line);

  useFrame((_, delta) => {
    if (!trainRef.current) return;

    progress.current += delta * speed * 0.3;
    if (progress.current > 1) progress.current = 0;

    const pos = turf.along(line, length * progress.current);
    const [lng, lat] = pos.geometry.coordinates;
    const projected = map.project([lng, lat]);

    trainRef.current.position.set(projected.x, projected.y, 15);

    // Look ahead
    const next = turf.along(line, length * (progress.current + 0.01));
    const [nextLng, nextLat] = next.geometry.coordinates;
    const nextProjected = map.project([nextLng, nextLat]);
    trainRef.current.lookAt(nextProjected.x, nextProjected.y, 15);
  });

  return <primitive ref={trainRef} object={scene} scale={10} />;
}
