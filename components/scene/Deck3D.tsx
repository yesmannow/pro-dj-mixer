'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDeckStore } from '@/store/deckStore';
import { useDeckAudio } from '@/hooks/useDeckAudio';
import { Button3D } from './Button3D';
import { Fader3D } from './Fader3D';
import { Text, useTexture } from '@react-three/drei';

interface Deck3DProps {
  deckId: 'A' | 'B';
  position: [number, number, number];
}

const PLATTER_REVOLUTION_SECONDS = 1.8;

export function Deck3D({ deckId, position }: Deck3DProps) {
  const platterRef = useRef<THREE.Group>(null);
  
  const deckState = useDeckStore((state) => deckId === 'A' ? state.deckA : state.deckB);
  const { isPlaying, togglePlay, track, duration, currentTime, scrubTrack, getAudioData } = useDeckAudio(deckId);
  const setPitch = useDeckStore((state) => state.setPitch);
  const toggleSync = useDeckStore((state) => state.toggleSync);

  // Load artwork texture for platter 
  // Need to handle missing track/artwork safely
  const BLANK_ARTWORK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const artworkUrl = track?.artworkUrl || BLANK_ARTWORK;
  const texture = useTexture(artworkUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
  });

  const lastTimeRef = useRef(currentTime);
  const rotationRef = useRef(0);
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    // Determine rotation based on playback
    if (isPlaying) {
      rotationRef.current -= (delta / PLATTER_REVOLUTION_SECONDS) * (Math.PI * 2);
    }
    
    if (platterRef.current) {
      platterRef.current.rotation.y = rotationRef.current;
    }

    // Audio reactive glow
    if (glowLightRef.current) {
      const audioData = getAudioData?.();
      const intensity = audioData ? Math.max(0.2, audioData.rms * 6.0) : 0.2;
      glowLightRef.current.intensity = THREE.MathUtils.lerp(glowLightRef.current.intensity, intensity, 10 * delta);
    }
  });

  const pitchNormalized = deckState.pitchPercent / 100; // -0.08 to 0.08 map to -1 to 1

  return (
    <group position={position}>
      {/* Audio Reactive Light */}
      <pointLight ref={glowLightRef} position={[0, 1, 0]} color={deckId === 'A' ? '#D4AF37' : '#00e5ff'} distance={8} intensity={0.2} decay={2} />

      {/* Chassis */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[10, 0.4, 11]} />
        <meshStandardMaterial color="#0a0a0c" roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Platter Assembly */}
      <group position={[-0.5, 0.2, -1]}>
        
        {/* Outer Metallic Platter Rim */}
        <mesh receiveShadow castShadow position={[0, 0.1, 0]}>
          <cylinderGeometry args={[3.8, 3.8, 0.5, 64]} />
          <meshStandardMaterial color="#111" roughness={0.2} metalness={0.9} />
        </mesh>

        {/* Strobe Dots Ring */}
        <group position={[0, 0.35, 0]}>
          {Array.from({ length: 48 }).map((_, i) => (
            <mesh key={`strobe-${i}`} position={[
              3.75 * Math.cos((i / 48) * Math.PI * 2), 
              0, 
              3.75 * Math.sin((i / 48) * Math.PI * 2)
            ]}>
              <boxGeometry args={[0.08, 0.04, 0.08]} />
              <meshStandardMaterial color="#fff" roughness={0.2} metalness={0.8} emissive="#444" emissiveIntensity={0.2} />
            </mesh>
          ))}
        </group>
        
        {/* Rotating Vinyl Record */}
        <group ref={platterRef} position={[0, 0.36, 0]}>
          <mesh receiveShadow castShadow>
            <cylinderGeometry args={[3.6, 3.6, 0.05, 64]} />
            {/* Glossy Vinyl Material with a slight ridge/groove approximation using roughness constraints */}
            <meshStandardMaterial color="#050505" roughness={0.3} metalness={0.1} />
          </mesh>
          
          {/* Inner Groove Texture Rings (Pseudo-grooves) */}
          {[1.8, 2.2, 2.6, 3.0, 3.4].map((radius, i) => (
             <mesh key={`groove-${i}`} position={[0, 0.03, 0]} rotation={[1.5708, 0, 0]}>
               <ringGeometry args={[radius, radius + 0.02, 64]} />
               <meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.4} />
             </mesh>
          ))}
          
          {/* Record Label with Artwork */}
          <mesh position={[0, 0.04, 0]} rotation={[-1.5708, 0, 0]}>
            <circleGeometry args={[1.3, 64]} />
            <meshBasicMaterial map={texture} />
          </mesh>
        </group>

        {/* Center Metal Spindle */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 16]} />
          <meshStandardMaterial color="#ddd" roughness={0.1} metalness={1.0} />
        </mesh>
        
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#ddd" roughness={0.1} metalness={1.0} />
        </mesh>

        {/* --- TONE ARM ASSEMBLY --- */}
        <group position={[4.2, 0.4, 3.2]} rotation={[0, isPlaying ? 0.3 : 0, 0]}>
          {/* Base Pivot */}
          <mesh castShadow>
            <cylinderGeometry args={[0.4, 0.5, 0.4, 32]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.8} />
          </mesh>
          
          {/* Tone Arm Rod */}
          <mesh position={[-2.4, 0.4, -1.8]} rotation={[0, 0.6, 1.5708]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 5, 16]} />
            <meshStandardMaterial color="#Silver" roughness={0.2} metalness={0.9} />
          </mesh>

          {/* Headshell / Cartridge */}
          <mesh position={[-4.0, 0.3, -3.2]} rotation={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[0.3, 0.2, 0.6]} />
            <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[-4.0, 0.2, -3.2]} rotation={[0, 0.4, 0]}>
             <boxGeometry args={[0.05, 0.1, 0.1]} />
             <meshStandardMaterial color="#E11D48" />
          </mesh>
        </group>

      </group>

      {/* Pitch Fader Area */}
      <group position={[4, 0.4, 0]}>
        <Fader3D 
          position={[0, 0, 0]} 
          type="vertical" 
          length={6} 
          value={pitchNormalized * 12.5} // Convert -0.08 to -1..1 range (assuming 8% default range)
          onChange={(v) => setPitch(deckId, v * 8)} // Update to actual pitch
        />
        <Text position={[0, 0.1, -4]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">PITCH</Text>
      </group>

      {/* Transport Controls */}
      <group position={[-2.5, 0.2, 3.5]}>
        <Button3D 
          position={[-1, 0, 0]} 
          size={[1.5, 0.4, 1.2]} 
          onClick={togglePlay}
          color="#333"
          active={isPlaying}
        />
        <Text position={[-1, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color={isPlaying ? "#000" : "#D4AF37"}>
          PLAY
        </Text>

        <Button3D 
          position={[1, 0, 0]} 
          size={[1.5, 0.4, 1.2]} 
          onClick={() => {}}
          color="#333"
        />
        <Text position={[1, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#D4AF37">
          CUE
        </Text>

        <Button3D 
          position={[3, 0, 0]} 
          size={[1.5, 0.4, 1.2]} 
          onClick={() => toggleSync(deckId)}
          color="#333"
          active={deckState.sync}
        />
        <Text position={[3, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color={deckState.sync ? "#000" : "#D4AF37"}>
          SYNC
        </Text>
      </group>
    </group>
  );
}
