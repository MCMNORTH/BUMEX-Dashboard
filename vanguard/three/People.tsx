import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Anonymous characters at human scale (1.72 m): legs, torso in the role's jacket colour, arms, a head without a face.
// Seated ones type with a small bob; walkers follow a polyline, swing their legs and face where they go.

export const ROLE_COLORS: Record<string, string> = { partner: '#1d2c49', manager: '#3b5a8f', senior: '#5d6b84', assistant: '#8c7a5e', visitor: '#7a3b45', courier: '#c9803c', staff: '#4a5160' };
const SKIN = ['#d9b08c', '#c48f66', '#8d5a3b', '#f0cfa8', '#6b4126'];
const HAIR = ['#2b1d12', '#141414', '#4b3221', '#1a1a1a', '#5a4632'];
const TROUSERS = '#2a2e38';

export function Person({ position, color, rotation = 0, seated = false, phase = 0, animate = true }: { position: [number, number, number]; color: string; rotation?: number; seated?: boolean; phase?: number; animate?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const skin = SKIN[Math.abs(Math.round(phase)) % SKIN.length];
  const hair = HAIR[Math.abs(Math.round(phase * 3)) % HAIR.length];
  useFrame(({ clock }) => {
    if (!ref.current || !animate) return;
    const t = clock.elapsedTime * (seated ? 3.2 : 1) + phase;
    ref.current.position.y = position[1] + (seated ? Math.sin(t) * 0.004 : 0);
    if (head.current) head.current.rotation.y = Math.sin(t * 0.37) * 0.25;
  });
  if (seated) {
    return (
      <group ref={ref} position={position} rotation={[0, rotation, 0]}>
        {/* thighs and shins */}
        {[-0.1, 0.1].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.5, 0.2]} castShadow>
              <boxGeometry args={[0.15, 0.13, 0.44]} />
              <meshStandardMaterial color={TROUSERS} roughness={0.9} />
            </mesh>
            <mesh position={[x, 0.22, 0.4]} castShadow>
              <capsuleGeometry args={[0.065, 0.34, 3, 8]} />
              <meshStandardMaterial color={TROUSERS} roughness={0.9} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.84, 0.02]} castShadow>
          <capsuleGeometry args={[0.17, 0.4, 4, 12]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        {[-0.23, 0.23].map((x) => (
          <mesh key={x} position={[x, 0.78, 0.2]} rotation={[Math.PI / 2 - 0.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.42, 3, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        ))}
        <group ref={head} position={[0, 1.27, 0.02]}>
          <mesh castShadow>
            <sphereGeometry args={[0.11, 14, 12]} />
            <meshStandardMaterial color={skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.03, -0.015]}>
            <sphereGeometry args={[0.108, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={hair} roughness={1} />
          </mesh>
        </group>
      </group>
    );
  }
  return (
    <group ref={ref} position={position} rotation={[0, rotation, 0]}>
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} position={[x, 0.44, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.7, 3, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.4, 4, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 1.08, 0]} rotation={[0, 0, x < 0 ? 0.12 : -0.12]} castShadow>
          <capsuleGeometry args={[0.05, 0.5, 3, 8]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
      <group ref={head} position={[0, 1.6, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.11, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.03, -0.015]}>
          <sphereGeometry args={[0.108, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

// A walking figure: legs and arms swing, the body bobs; it faces along the path and pauses at the ends.
export function Walker({ path, color, speed = 1.1, offset = 0, pauseAtEnds = 2, phase = 0 }: { path: [number, number][]; color: string; speed?: number; offset?: number; pauseAtEnds?: number; phase?: number }) {
  const ref = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const skin = SKIN[Math.abs(Math.round(phase)) % SKIN.length];
  const hair = HAIR[Math.abs(Math.round(phase * 3)) % HAIR.length];
  const segs = useMemo(() => {
    const out: { a: THREE.Vector2; b: THREE.Vector2; len: number }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = new THREE.Vector2(path[i][0], path[i][1]);
      const b = new THREE.Vector2(path[i + 1][0], path[i + 1][1]);
      out.push({ a, b, len: a.distanceTo(b) });
    }
    return out;
  }, [path]);
  const total = useMemo(() => segs.reduce((s, x) => s + x.len, 0), [segs]);
  useFrame(({ clock }) => {
    if (!ref.current || total === 0) return;
    const cycle = (total / speed + pauseAtEnds) * 2;
    let t = (clock.elapsedTime + offset) % cycle;
    const half = total / speed + pauseAtEnds;
    const forward = t < half;
    if (!forward) t -= half;
    const walking = t < total / speed;
    let dist = Math.min(t * speed, total);
    if (!forward) dist = total - dist;
    let pos = segs[0].a.clone();
    let dir = new THREE.Vector2(0, 1);
    for (const s of segs) {
      if (dist <= s.len) {
        pos = s.a.clone().lerp(s.b, s.len ? dist / s.len : 0);
        dir = s.b.clone().sub(s.a).normalize();
        break;
      }
      dist -= s.len;
      pos = s.b.clone();
      dir = s.b.clone().sub(s.a).normalize();
    }
    if (!forward) dir.multiplyScalar(-1);
    ref.current.position.set(pos.x, walking ? Math.abs(Math.sin(clock.elapsedTime * 6.5)) * 0.025 : 0, pos.y);
    ref.current.rotation.y = Math.atan2(dir.x, dir.y);
    const swing = walking ? Math.sin(clock.elapsedTime * 6.5 + phase) * 0.55 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.7;
    if (armR.current) armR.current.rotation.x = swing * 0.7;
  });
  return (
    <group ref={ref}>
      <group ref={legL} position={[-0.09, 0.86, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.68, 3, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legR} position={[0.09, 0.86, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <capsuleGeometry args={[0.075, 0.68, 3, 8]} />
          <meshStandardMaterial color={TROUSERS} roughness={0.9} />
        </mesh>
      </group>
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.4, 4, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <group ref={armL} position={[-0.24, 1.34, 0]}>
        <mesh position={[0, -0.27, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.48, 3, 8]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      </group>
      <group ref={armR} position={[0.24, 1.34, 0]}>
        <mesh position={[0, -0.27, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.48, 3, 8]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      </group>
      <group position={[0, 1.6, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.11, 14, 12]} />
          <meshStandardMaterial color={skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.03, -0.015]}>
          <sphereGeometry args={[0.108, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}
