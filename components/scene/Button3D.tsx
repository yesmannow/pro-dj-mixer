'use client';
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Button3DProps {
  position: [number, number, number];
  onClick: () => void;
  color?: string;
  size?: [number, number, number];
  active?: boolean;
}

export function Button3D({ position, onClick, color = '#222222', size = [1, 0.4, 1], active }: Button3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [isPressed, setIsPressed] = useState(false);

  const targetY = isPressed ? -0.1 : 0;
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.y = THREE.MathUtils.lerp(
        meshRef.current.position.y,
        targetY,
        20 * delta
      );
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsPressed(true);
    if (e.target) e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();
    if (isPressed) {
      setIsPressed(false);
      onClick();
    }
    if (e.target && e.target.hasPointerCapture(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  const actualColor = active ? '#D4AF37' : color;

  return (
    <group position={position}>
      {/* Base/Housing */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[size[0] + 0.1, 0.5, size[2] + 0.1]} />
        <meshStandardMaterial color="#050505" roughness={0.8} />
      </mesh>
      
      {/* Pressable Cap */}
      <group 
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerOut={() => setIsPressed(false)}
      >
        <mesh castShadow receiveShadow position={[0, size[1] / 2, 0]}>
          <boxGeometry args={[size[0], size[1], size[2]]} />
          <meshStandardMaterial 
            color={actualColor} 
            roughness={0.4} 
            metalness={0.5}
            emissive={active ? '#D4AF37' : '#000000'}
            emissiveIntensity={active ? 0.4 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}
