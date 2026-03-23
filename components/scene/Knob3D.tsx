'use client';

import { useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Knob3DProps {
  position: [number, number, number];
  value: number; // -1 to 1
  onChange: (val: number) => void;
  color?: string;
  label?: string;
}

export function Knob3D({ position, value, onChange, color = '#D4AF37', label }: Knob3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const { size } = useThree();

  // Rotation from -135deg to +135deg mapped from value -1 to 1
  const targetRotation = value * (Math.PI * 0.75);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = THREE.MathUtils.lerp(
        meshRef.current.rotation.y,
        targetRotation,
        15 * delta
      );
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    
    // Lock pointer capture
    if (e.target) {
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    
    // Sensitivity based on screen size
    const sensitivity = 2.0 / size.height;
    const deltaY = startY.current - e.clientY;
    
    let newValue = startValue.current + (deltaY * sensitivity * 100);
    newValue = Math.max(-1, Math.min(1, newValue));
    onChange(newValue);
  };

  const handlePointerUp = (e: any) => {
    setIsDragging(false);
    if (e.target && e.target.hasPointerCapture(e.pointerId)) {
      e.target.releasePointerCapture(e.pointerId);
    }
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    onChange(0);
  };

  return (
    <group position={position}>
      <group 
        ref={meshRef} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Base Cylinder */}
        <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.5, 0.55, 0.8, 32]} />
          <meshStandardMaterial 
            color="#111111" 
            roughness={0.6} 
            metalness={0.4}
          />
        </mesh>
        
        {/* Glow Ring Base */}
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.1, 32]} />
          <meshStandardMaterial 
            color={value !== 0 ? color : "#222"} 
            emissive={value !== 0 ? color : "#000"} 
            emissiveIntensity={Math.abs(value) * 1.5} 
            toneMapped={false}
          />
        </mesh>

        {/* Glow Indicator Line */}
        <mesh position={[0, 0.81, 0.3]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.08, 0.02, 0.35]} />
          <meshStandardMaterial 
            color={value === 0 ? "#888" : "#fff"}
            emissive={value === 0 ? "#000" : "#fff"} 
            emissiveIntensity={value !== 0 ? 1.0 : 0} 
          />
        </mesh>
      </group>
    </group>
  );
}
