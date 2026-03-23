'use client';

import { useMixerStore } from '@/store/mixerStore';
import { Knob3D } from './Knob3D';
import { Fader3D } from './Fader3D';
import { Text } from '@react-three/drei';

export function Mixer3D() {
  const { eqA, eqB, volA, volB, crossfader, setEQ, setVolume, setCrossfader } = useMixerStore();

  return (
    <group position={[0, 0, 0]}>
      {/* Mixer Chassis Surface Details */}
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[14, 0.4, 11]} />
        <meshStandardMaterial color="#0c0c0e" roughness={0.6} metalness={0.5} />
      </mesh>
      
      {/* Glossy Mixer Faceplate */}
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[13.5, 0.02, 10.5]} />
        <meshStandardMaterial color="#050505" roughness={0.2} metalness={0.9} />
      </mesh>

      <Text position={[0, 0.2, -4.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.6} color="#D4AF37" font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2" anchorX="center" anchorY="middle" fillOpacity={0.6}>
        PRO MIXER HUD
      </Text>

      {/* --- DECK A EQ (Left) --- */}
      <group position={[-4, 0.2, -2]}>
        <Knob3D position={[0, 0, 0]} value={eqA.high} onChange={(v) => setEQ('A', 'high', v)} color="#00e5ff" />
        <Text position={[0, 0.1, -1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">HIGH</Text>

        <Knob3D position={[0, 0, 2]} value={eqA.mid} onChange={(v) => setEQ('A', 'mid', v)} color="#ff9500" />
        <Text position={[0, 0.1, 1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">MID</Text>

        <Knob3D position={[0, 0, 4]} value={eqA.low} onChange={(v) => setEQ('A', 'low', v)} color="#ff2a44" />
        <Text position={[0, 0.1, 3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">LOW</Text>
      </group>

      {/* --- DECK B EQ (Right) --- */}
      <group position={[4, 0.2, -2]}>
        <Knob3D position={[0, 0, 0]} value={eqB.high} onChange={(v) => setEQ('B', 'high', v)} color="#00e5ff" />
        <Text position={[0, 0.1, -1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">HIGH</Text>

        <Knob3D position={[0, 0, 2]} value={eqB.mid} onChange={(v) => setEQ('B', 'mid', v)} color="#ff9500" />
        <Text position={[0, 0.1, 1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">MID</Text>

        <Knob3D position={[0, 0, 4]} value={eqB.low} onChange={(v) => setEQ('B', 'low', v)} color="#ff2a44" />
        <Text position={[0, 0.1, 3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#888">LOW</Text>
      </group>

      {/* --- VOLUME FADERS --- */}
      <Fader3D 
        position={[-1.5, 0.2, 1.5]} 
        type="vertical" 
        length={4} 
        value={volA} 
        onChange={(v) => setVolume('A', v)} 
      />
      <Fader3D 
        position={[1.5, 0.2, 1.5]} 
        type="vertical" 
        length={4} 
        value={volB} 
        onChange={(v) => setVolume('B', v)} 
      />

      {/* --- CROSSFADER --- */}
      <Fader3D 
        position={[0, 0.2, 4.5]} 
        type="horizontal" 
        length={5} 
        value={crossfader} 
        onChange={(v) => setCrossfader(v)} 
      />
    </group>
  );
}
