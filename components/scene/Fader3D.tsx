'use client';

import { useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Fader3DProps {
  position: [number, number, number];
  value: number; // 0 to 1 for volume, -1 to 1 for crossfader
  onChange: (val: number) => void;
  type?: 'vertical' | 'horizontal';
  length?: number;
  color?: string;
}

export function Fader3D({ 
  position, 
  value, 
  onChange, 
  type = 'vertical', 
  length = 4,
  color = '#D4AF37'
}: Fader3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);
  const startValue = useRef(0);
  const { size } = useThree();

  // Mapping value to physical position
  const minPos = -length / 2;
  
  let targetPos = 0;
  if (type === 'vertical') {
    targetPos = minPos + (value * length);
  } else {
    targetPos = (value * length) / 2;
  }

  useFrame((state, delta) => {
    if (meshRef.current) {
      if (type === 'vertical') {
        meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetPos, 15 * delta);
      } else {
        meshRef.current.position.x = THREE.MathUtils.lerp(meshRef.current.position.x, targetPos, 15 * delta);
      }
    }
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);
    startPos.current = type === 'vertical' ? e.clientY : e.clientX;
    startValue.current = value;
    
    if (e.target) e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    
    const sensitivity = 2.0 / (type === 'vertical' ? size.height : size.width);
    const delta = type === 'vertical' 
      ? startPos.current - e.clientY // Vertical moves UP = positive
      : e.clientX - startPos.current; // Horizontal moves RIGHT = positive
      
    let newValue = 0;
    if (type === 'vertical') {
      newValue = startValue.current + (delta * sensitivity * 10);
      newValue = Math.max(0, Math.min(1, newValue));
    } else {
      newValue = startValue.current + (delta * sensitivity * 10);
      newValue = Math.max(-1, Math.min(1, newValue));
    }
    
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
    onChange(type === 'vertical' ? 0.75 : 0);
  };

  return (
    <group position={position}>
      {/* Track Background */}
      <mesh receiveShadow position={[0, 0, 0]} rotation={type === 'horizontal' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
        <boxGeometry args={[0.6, length + 1, 0.2]} />
        <meshStandardMaterial color="#050505" roughness={0.9} metalness={0.1} />
      </mesh>
      
      {/* Track Slot Inner */}
      <mesh receiveShadow position={[0, 0.1, 0]} rotation={type === 'horizontal' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
        <boxGeometry args={[0.1, length + 0.8, 0.1]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Fader Cap */}
      <group 
        ref={meshRef}
        position-z={0.3}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOut={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <mesh castShadow receiveShadow rotation={type === 'horizontal' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
          <boxGeometry args={[0.8, 0.4, 0.6]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.7} />
        </mesh>
        
        {/* Indicator Line */}
        <mesh position={[0, type === 'horizontal' ? 0.21 : 0, type === 'horizontal' ? 0 : 0.31]} rotation={type === 'horizontal' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
          <boxGeometry args={[0.6, 0.05, 0.05]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
    </group>
  );
}
