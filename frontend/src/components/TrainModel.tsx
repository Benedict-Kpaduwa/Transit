import React from "react";

const SimpleTrainModel = React.forwardRef((props: any, ref: any) => {
  return (
    <group ref={ref} {...props}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[6, 2, 1.5]} />
        <meshStandardMaterial color="#1a56db" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Windows */}
      <mesh position={[0, 0.3, 0.76]}>
        <boxGeometry args={[5.6, 0.8, 0.05]} />
        <meshStandardMaterial
          color="#93c5fd"
          transparent
          opacity={0.7}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>

      {/* Stripe */}
      <mesh position={[0, -0.5, 0.76]}>
        <boxGeometry args={[5.8, 0.1, 0.05]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>

      {/* Wheels */}
      {[-2.2, -0.8, 0.8, 2.2].map((x, i) => (
        <group key={i}>
          <mesh position={[x, -1, 0.6]} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.2, 16]} />
            <meshStandardMaterial color="#1f2937" metalness={0.8} />
          </mesh>
          <mesh position={[x, -1, -0.6]} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.2, 16]} />
            <meshStandardMaterial color="#1f2937" metalness={0.8} />
          </mesh>
        </group>
      ))}

      {/* Headlights */}
      <mesh position={[2.8, 0, 0.3]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color="#fef3c7"
          emissive="#fef3c7"
          emissiveIntensity={2}
        />
      </mesh>
      <mesh position={[2.8, 0, -0.3]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial
          color="#fef3c7"
          emissive="#fef3c7"
          emissiveIntensity={2}
        />
      </mesh>
    </group>
  );
});

export default SimpleTrainModel;
