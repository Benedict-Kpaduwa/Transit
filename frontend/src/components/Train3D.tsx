import React, { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Group, Vector3 } from "three";
import { useGLTF } from "@react-three/drei";
// import type { Position } from "@/services/api";
import SimpleTrainModel from "./TrainModel";

// Alternatively, we can create a simple procedural train
interface TrainPosition {
  lat: number;
  lng: number;
  bearing: number; // Direction in degrees
}

interface ThreeDTrainProps {
  position: TrainPosition;
  routeColor?: string;
  speed?: number;
}

const ThreeDTrain: React.FC<ThreeDTrainProps> = ({
  position,
  routeColor = "#1a56db",
  speed = 0,
}) => {
  const trainRef = useRef<Group>(null);
  const [trainModel, setTrainModel] = useState<any>(null);

  // Optional: Load external GLTF model
  // const { scene } = useGLTF('/models/train.glb');

  // Animate the train
  useFrame((state, delta) => {
    if (trainRef.current) {
      // Add subtle bobbing animation
      trainRef.current.position.y =
        Math.sin(state.clock.elapsedTime * 2) * 0.05;

      // Rotate wheels if moving
      if (speed > 0) {
        const wheels = trainRef.current.children.filter((child) =>
          child.name.includes("wheel")
        );
        wheels.forEach((wheel) => {
          wheel.rotation.x += delta * speed;
        });
      }
    }
  });

  // Update train position
  useEffect(() => {
    if (trainRef.current && position) {
      // Mapbox coordinates to Three.js position
      // Note: You'll need to convert lat/lng to your map's coordinate system
      trainRef.current.position.set(
        position.lng * 100, // Adjust scaling based on your map
        position.lat * 100,
        0.5 // Height above ground
      );

      // Set rotation based on bearing
      trainRef.current.rotation.y = (position.bearing * Math.PI) / 180;
    }
  }, [position]);

  return (
    <group>
      {/* Train shadow */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[position.lng * 100, position.lat * 100, 0.05]}
      >
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      {/* Main train model */}
      <SimpleTrainModel
        ref={trainRef}
        position={[position.lng * 100, position.lat * 100, 0.5]}
      />

      {/* Movement trail effect */}
      {speed > 0 && (
        <mesh position={[position.lng * 100, position.lat * 100, 0.1]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color={routeColor} transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
};

export default ThreeDTrain;
