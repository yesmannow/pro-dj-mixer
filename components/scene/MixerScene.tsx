'use client';

import { Canvas } from '@react-three/fiber';
import { Environment, PerspectiveCamera, OrbitControls } from '@react-three/drei';
import { Suspense, ReactNode } from 'react';
import { Mixer3D } from './Mixer3D';
import { Deck3D } from './Deck3D';

interface MixerSceneProps {
  children?: ReactNode;
}

export function MixerScene({ children }: MixerSceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-auto" style={{ zIndex: 0 }}>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 12, 14]} fov={50} />
        
        <OrbitControls 
          enablePan={false}
          enableRotate={true}
          enableZoom={true}
          minPolarAngle={Math.PI / 6} 
          maxPolarAngle={Math.PI / 2.2} 
        />
        
        {/* Deep Moody Club Atmosphere */}
        <ambientLight intensity={0.05} color="#445566" />
        
        {/* Main Overhead Booth Light - high contrast, soft penumbra */}
        <spotLight 
          position={[0, 25, 5]} 
          angle={0.6} 
          penumbra={0.8} 
          intensity={2.5} 
          color="#ffffff"
          castShadow 
          shadow-bias={-0.0001}
          shadow-mapSize={4096} 
        />
        
        {/* Side rim lights to catch metallic edges of the hardware */}
        <spotLight position={[-15, 10, -5]} angle={0.5} penumbra={1} intensity={1} color="#6688aa" />
        <spotLight position={[15, 10, -5]} angle={0.5} penumbra={1} intensity={1} color="#6688aa" />

        {/* Dynamic deck glow lights - positioned closer to the platters */}
        <pointLight position={[-9.5, 2, 0]} intensity={0.8} color="#D4AF37" distance={15} decay={2} />
        <pointLight position={[9.5, 2, 0]} intensity={0.8} color="#00e5ff" distance={15} decay={2} />

        <Suspense fallback={null}>
          <Environment preset="night" background blur={0.8} />
          
          {/* Black reflective desk surface */}
          <mesh receiveShadow position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial color="#020202" roughness={0.1} metalness={0.8} />
          </mesh>

          <Deck3D deckId="A" position={[-9.5, 0, 0]} />
          <Mixer3D />
          <Deck3D deckId="B" position={[9.5, 0, 0]} />
          
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
}
