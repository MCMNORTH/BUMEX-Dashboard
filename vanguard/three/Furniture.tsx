import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { JSX } from 'react'; // [bumex-one] React 19 has no global JSX namespace
import { woodTexture, brushedTexture, kraftTexture, monitorTexture, logoWallTexture } from './textures';
import { Person } from './People';

// Office furniture at real scale (metres). Materials are shared module-wide so a floor with hundreds of pieces
// stays cheap; every solid piece casts and receives shadows so it sits on the floor instead of floating.

let mats: Record<string, THREE.Material> | null = null;
export function M(): Record<string, THREE.Material> {
  if (mats) return mats;
  const oak = woodTexture('oak');
  oak.repeat.set(0.6, 0.6);
  const walnut = woodTexture('walnut');
  walnut.repeat.set(0.8, 0.8);
  const brushed = brushedTexture();
  brushed.repeat.set(2, 2);
  const kraft = kraftTexture();
  mats = {
    white: new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.55 }),
    laminate: new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.5 }),
    oak: new THREE.MeshStandardMaterial({ map: oak, roughness: 0.55 }),
    walnut: new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ map: brushed, color: '#c9c9cc', metalness: 0.75, roughness: 0.35 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 0.6, roughness: 0.45 }),
    mullion: new THREE.MeshStandardMaterial({ color: '#b9bec6', metalness: 0.6, roughness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.6 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#3b4252', roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#6b7180', roughness: 1 }),
    fabricNavy: new THREE.MeshStandardMaterial({ color: '#2b3f66', roughness: 1 }),
    fabricSand: new THREE.MeshStandardMaterial({ color: '#cdbfa6', roughness: 1 }),
    fabricBlue: new THREE.MeshStandardMaterial({ color: '#6b8dc1', roughness: 1 }),
    leather: new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f7a3c', roughness: 0.9 }),
    leaf2: new THREE.MeshStandardMaterial({ color: '#2f6133', roughness: 0.9 }),
    pot: new THREE.MeshStandardMaterial({ color: '#3a3b3f', roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#cfe0ee', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, transmission: 0, depthWrite: false, side: THREE.DoubleSide }),
    screen: new THREE.MeshStandardMaterial({ color: '#0e1118', roughness: 0.3, metalness: 0.2 }),
    paper: new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.9 }),
    kraft: new THREE.MeshStandardMaterial({ map: kraft, roughness: 0.95 }),
    red: new THREE.MeshStandardMaterial({ color: '#b4232c', roughness: 0.8 }),
    amber: new THREE.MeshStandardMaterial({ color: '#f0b94a', emissive: '#d9a13e', emissiveIntensity: 0.25, roughness: 0.6 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.92 }),
    wallCap: new THREE.MeshStandardMaterial({ color: '#dcd8d0', roughness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d8dadf', metalness: 0.9, roughness: 0.2 }),
  };
  return mats;
}

export function Box({ p, s, m, r = 0, shadow = true, rx = 0 }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: number; shadow?: boolean; rx?: number }) {
  return (
    <mesh position={p} rotation={[rx, r, 0]} material={m} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

export function Chair({ x, z, r = 0, m }: { x: number; z: number; r?: number; m?: THREE.Material }) {
  const mm = M();
  const seat = m ?? mm.fabric;
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin((i / 5) * Math.PI * 2) * 0.16, 0.03, Math.cos((i / 5) * Math.PI * 2) * 0.16]} rotation={[0, (i / 5) * Math.PI * 2, 0]} material={mm.darkSteel} castShadow>
          <boxGeometry args={[0.04, 0.03, 0.3]} />
        </mesh>
      ))}
      <mesh position={[0, 0.25, 0]} material={mm.darkSteel} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.4, 8]} />
      </mesh>
      <mesh position={[0, 0.47, 0]} material={seat} castShadow>
        <boxGeometry args={[0.48, 0.07, 0.48]} />
      </mesh>
      <mesh position={[0, 0.76, -0.22]} rotation={[-0.1, 0, 0]} material={seat} castShadow>
        <boxGeometry args={[0.44, 0.52, 0.05]} />
      </mesh>
      {[-0.26, 0.26].map((ax) => (
        <mesh key={ax} position={[ax, 0.66, -0.02]} material={mm.black} castShadow>
          <boxGeometry args={[0.03, 0.03, 0.3]} />
        </mesh>
      ))}
    </group>
  );
}

export function Monitor({ x = 0, z = -0.22, y = 0.74, w = 0.6, ratio = null, tone = 'ok' as 'ok' | 'late' | 'over', r = 0 }: { x?: number; z?: number; y?: number; w?: number; ratio?: number | null; tone?: 'ok' | 'late' | 'over'; r?: number }) {
  const tex = useMemo(() => monitorTexture(ratio, tone), [ratio, tone]);
  const h = w * 0.58;
  return (
    <group position={[x, y, z]} rotation={[0, r, 0]}>
      <mesh position={[0, 0.02, 0]} material={M().darkSteel} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.02, 12]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} material={M().darkSteel}>
        <boxGeometry args={[0.04, 0.2, 0.03]} />
      </mesh>
      <mesh position={[0, 0.2 + h / 2, 0.02]} material={M().black} castShadow>
        <boxGeometry args={[w, h, 0.03]} />
      </mesh>
      <mesh position={[0, 0.2 + h / 2, 0.036]}>
        <planeGeometry args={[w - 0.03, h - 0.03]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function DeskLamp({ x, z, mode }: { x: number; z: number; mode: 'off' | 'warm' | 'amber' }) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.emissiveIntensity = mode === 'amber' ? 1.6 + Math.sin(clock.elapsedTime * 4) * 1.1 : mode === 'warm' ? 1.4 : 0;
  });
  return (
    <group position={[x, 0.74, z]}>
      <mesh position={[0, 0.01, 0]} material={M().darkSteel} castShadow>
        <cylinderGeometry args={[0.08, 0.09, 0.02, 12]} />
      </mesh>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0]} material={M().darkSteel}>
        <cylinderGeometry args={[0.008, 0.008, 0.38, 6]} />
      </mesh>
      <mesh position={[0.08, 0.38, 0]} rotation={[0, 0, -0.9]} material={M().darkSteel}>
        <cylinderGeometry args={[0.008, 0.008, 0.22, 6]} />
      </mesh>
      <mesh position={[0.17, 0.42, 0]} rotation={[0, 0, -0.5]} castShadow>
        <coneGeometry args={[0.07, 0.1, 12, 1, true]} />
        <meshStandardMaterial color="#2b3f66" side={THREE.DoubleSide} roughness={0.5} />
      </mesh>
      <mesh position={[0.19, 0.39, 0]}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshStandardMaterial ref={ref} color="#ffe9c0" emissive={mode === 'amber' ? '#f2b134' : '#ffd58a'} emissiveIntensity={mode === 'off' ? 0 : 1.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function FolderStack({ x, z, count, m, r = 0 }: { x: number; z: number; count: number; m?: THREE.Material; r?: number }) {
  const mm = m ?? M().red;
  const piles = Math.min(4, Math.ceil(count / 6));
  const items: JSX.Element[] = [];
  let left = count;
  for (let p = 0; p < piles; p++) {
    const n = Math.min(6, left);
    left -= n;
    for (let k = 0; k < n; k++) items.push(<Box key={`${p}-${k}`} p={[x + p * 0.3, 0.75 + k * 0.022, z]} s={[0.24, 0.02, 0.32]} m={mm} r={r + ((p * 7 + k * 3) % 5) * 0.03} />);
  }
  return <>{items}</>;
}

export function Desk({ x, z, r = 0, person, phase = 0, lamp, ratio = null, tone = 'ok' as 'ok' | 'late' | 'over', dual = false, top, folders = 0, folderMat, width = 1.6 }: { x: number; z: number; r?: number; person?: string; phase?: number; lamp?: 'off' | 'warm' | 'amber'; ratio?: number | null; tone?: 'ok' | 'late' | 'over'; dual?: boolean; top?: THREE.Material; folders?: number; folderMat?: THREE.Material; width?: number }) {
  const mm = M();
  const w = width, d = 0.8, h = 0.74;
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <mesh position={[0, h - 0.015, 0]} material={top ?? mm.laminate} castShadow receiveShadow>
        <boxGeometry args={[w, 0.03, d]} />
      </mesh>
      {[-w / 2 + 0.08, w / 2 - 0.08].map((lx) => (
        <group key={lx}>
          <mesh position={[lx, h / 2 - 0.02, -d / 2 + 0.06]} material={mm.darkSteel} castShadow>
            <boxGeometry args={[0.04, h - 0.04, 0.04]} />
          </mesh>
          <mesh position={[lx, h / 2 - 0.02, d / 2 - 0.06]} material={mm.darkSteel} castShadow>
            <boxGeometry args={[0.04, h - 0.04, 0.04]} />
          </mesh>
          <mesh position={[lx, 0.03, 0]} material={mm.darkSteel}>
            <boxGeometry args={[0.04, 0.03, d - 0.1]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, h - 0.2, -d / 2 + 0.03]} material={mm.graphite} castShadow>
        <boxGeometry args={[w - 0.2, 0.3, 0.02]} />
      </mesh>
      <Monitor x={dual ? 0.3 : 0} z={-0.22} ratio={ratio} tone={tone} r={dual ? -0.18 : 0} />
      {dual && <Monitor x={-0.3} z={-0.22} r={0.18} w={0.55} />}
      <mesh position={[0, h + 0.012, 0.1]} material={mm.black} castShadow>
        <boxGeometry args={[0.42, 0.02, 0.14]} />
      </mesh>
      <mesh position={[0.32, h + 0.015, 0.12]} material={mm.black} castShadow>
        <boxGeometry args={[0.06, 0.03, 0.1]} />
      </mesh>
      {lamp && <DeskLamp x={-w / 2 + 0.22} z={-0.2} mode={lamp} />}
      {folders > 0 && <FolderStack x={w / 2 - 0.5} z={-0.05} count={folders} m={folderMat} />}
      <Chair x={0} z={0.62} r={Math.PI} />
      {person && <Person position={[0, 0, 0.62]} color={person} rotation={Math.PI} seated phase={phase} />}
    </group>
  );
}

export function Cabinet({ x, z, r = 0, w = 0.8, h = 1.1, drawers = 3 }: { x: number; z: number; r?: number; w?: number; h?: number; drawers?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, h / 2, 0]} s={[w, h, 0.45]} m={mm.white} />
      {Array.from({ length: drawers }).map((_, i) => (
        <group key={i}>
          <Box p={[0, (h / drawers) * (i + 0.5), 0.226]} s={[w - 0.06, h / drawers - 0.03, 0.01]} m={mm.laminate} shadow={false} />
          <Box p={[0, (h / drawers) * (i + 0.5) + 0.08, 0.235]} s={[0.3, 0.02, 0.01]} m={mm.chrome} shadow={false} />
        </group>
      ))}
    </group>
  );
}

export function Bookshelf({ x, z, r = 0, w = 0.9, h = 2.0, fill = 0.8, seed = 1 }: { x: number; z: number; r?: number; w?: number; h?: number; fill?: number; seed?: number }) {
  const mm = M();
  const shelves = 5;
  const books: JSX.Element[] = [];
  let s = seed * 7919;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cols = ['#2b3f66', '#6b8dc1', '#cdbfa6', '#8b2f3a', '#3f6b4a', '#d9a13e', '#f1efe9', '#3b4252'];
  for (let i = 0; i < shelves; i++) {
    let bx = -w / 2 + 0.05;
    const y = 0.08 + (i * (h - 0.1)) / shelves;
    while (bx < w / 2 - 0.08 && rnd() < fill + 0.15) {
      const bw = 0.03 + rnd() * 0.04;
      const bh = 0.2 + rnd() * 0.1;
      books.push(<mesh key={`${i}-${bx}`} position={[bx + bw / 2, y + bh / 2, 0.02]} castShadow><boxGeometry args={[bw, bh, 0.25]} /><meshStandardMaterial color={cols[Math.floor(rnd() * cols.length)]} roughness={0.85} /></mesh>);
      bx += bw + 0.004;
    }
  }
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[-w / 2 + 0.01, h / 2, 0]} s={[0.02, h, 0.36]} m={mm.white} />
      <Box p={[w / 2 - 0.01, h / 2, 0]} s={[0.02, h, 0.36]} m={mm.white} />
      <Box p={[0, h / 2, -0.17]} s={[w, h, 0.02]} m={mm.white} />
      {Array.from({ length: shelves + 1 }).map((_, i) => (
        <Box key={i} p={[0, 0.06 + (i * (h - 0.1)) / shelves, 0]} s={[w, 0.025, 0.36]} m={mm.white} />
      ))}
      {books}
    </group>
  );
}

export function ConferenceTable({ x, z, r = 0, l = 3.6, w = 1.2, seats = 10, people = [] as (string | undefined)[], top }: { x: number; z: number; r?: number; l?: number; w?: number; seats?: number; people?: (string | undefined)[]; top?: THREE.Material }) {
  const mm = M();
  const perSide = Math.ceil(seats / 2);
  const chairs: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < perSide; i++) {
    const cx = -l / 2 + (l / (perSide + 1)) * (i + 1);
    chairs.push({ x: cx, z: w / 2 + 0.42, r: Math.PI });
    if (chairs.length < seats) chairs.push({ x: cx, z: -w / 2 - 0.42, r: 0 });
  }
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <mesh position={[0, 0.74, 0]} material={top ?? mm.walnut} castShadow receiveShadow>
        <boxGeometry args={[l, 0.04, w]} />
      </mesh>
      {[-l / 2 + 0.5, l / 2 - 0.5].map((lx) => (
        <mesh key={lx} position={[lx, 0.36, 0]} material={mm.darkSteel} castShadow>
          <boxGeometry args={[0.08, 0.72, w - 0.4]} />
        </mesh>
      ))}
      {chairs.map((c, i) => (
        <group key={i}>
          <Chair x={c.x} z={c.z} r={c.r} m={mm.fabricNavy} />
          {people[i] && <Person position={[c.x, 0, c.z]} color={people[i]!} rotation={c.r} seated phase={i + 2} />}
        </group>
      ))}
    </group>
  );
}

export function WallScreen({ x, z, r = 0, w = 1.8, y = 1.45 }: { x: number; z: number; r?: number; w?: number; y?: number }) {
  const mm = M();
  return (
    <group position={[x, y, z]} rotation={[0, r, 0]}>
      <mesh material={mm.black} castShadow>
        <boxGeometry args={[w, w * 0.5625, 0.05]} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[w - 0.04, w * 0.5625 - 0.04]} />
        <meshStandardMaterial color="#1a2742" emissive="#2b3f66" emissiveIntensity={0.35} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Sofa({ x, z, r = 0, w = 2.0, m, people = [] as (string | undefined)[] }: { x: number; z: number; r?: number; w?: number; m?: THREE.Material; people?: (string | undefined)[] }) {
  const mm = M();
  const mat = m ?? mm.fabricNavy;
  const seats = Math.max(1, Math.round(w / 0.8));
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.12, 0]} s={[w, 0.16, 0.85]} m={mm.darkSteel} />
      <Box p={[0, 0.33, 0.06]} s={[w, 0.24, 0.72]} m={mat} />
      <Box p={[0, 0.62, -0.34]} s={[w, 0.5, 0.18]} m={mat} />
      <Box p={[-w / 2 + 0.07, 0.5, 0]} s={[0.14, 0.4, 0.85]} m={mat} />
      <Box p={[w / 2 - 0.07, 0.5, 0]} s={[0.14, 0.4, 0.85]} m={mat} />
      {people.map((p, i) => p && <Person key={i} position={[-w / 2 + (w / (seats + 1)) * (i + 1), 0, 0.08]} color={p} rotation={0} seated phase={i + 5} />)}
    </group>
  );
}

export function Armchair({ x, z, r = 0, m, person, phase = 9 }: { x: number; z: number; r?: number; m?: THREE.Material; person?: string; phase?: number }) {
  const mm = M();
  const mat = m ?? mm.fabricSand;
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.12, 0]} s={[0.9, 0.16, 0.85]} m={mm.darkSteel} />
      <Box p={[0, 0.33, 0.06]} s={[0.9, 0.24, 0.72]} m={mat} />
      <Box p={[0, 0.62, -0.34]} s={[0.9, 0.5, 0.18]} m={mat} />
      <Box p={[-0.38, 0.5, 0]} s={[0.14, 0.4, 0.85]} m={mat} />
      <Box p={[0.38, 0.5, 0]} s={[0.14, 0.4, 0.85]} m={mat} />
      {person && <Person position={[0, 0, 0.08]} color={person} rotation={0} seated phase={phase} />}
    </group>
  );
}

export function CoffeeTable({ x, z, r = 0, w = 1.1, d = 0.6 }: { x: number; z: number; r?: number; w?: number; d?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.4, 0]} s={[w, 0.03, d]} m={mm.oak} />
      {[[-w / 2 + 0.05, -d / 2 + 0.05], [w / 2 - 0.05, -d / 2 + 0.05], [-w / 2 + 0.05, d / 2 - 0.05], [w / 2 - 0.05, d / 2 - 0.05]].map(([lx, lz], i) => (
        <Box key={i} p={[lx, 0.2, lz]} s={[0.03, 0.4, 0.03]} m={mm.darkSteel} />
      ))}
    </group>
  );
}

export function Plant({ x, z, s = 1, kind = 'ficus' as 'ficus' | 'palm' | 'bush' }: { x: number; z: number; s?: number; kind?: 'ficus' | 'palm' | 'bush' }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.22, 0]} material={mm.pot} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.17, 0.44, 14]} />
      </mesh>
      {kind === 'bush' ? (
        <mesh position={[0, 0.62, 0]} material={mm.leaf} castShadow>
          <sphereGeometry args={[0.36, 12, 10]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.7, 6]} />
            <meshStandardMaterial color="#5a4632" roughness={1} />
          </mesh>
          <mesh position={[0, 1.2, 0]} material={mm.leaf} castShadow>
            <sphereGeometry args={[0.42, 12, 10]} />
          </mesh>
          <mesh position={[0.22, 1.45, 0.1]} material={mm.leaf2} castShadow>
            <sphereGeometry args={[0.3, 12, 10]} />
          </mesh>
          <mesh position={[-0.2, 1.05, -0.14]} material={mm.leaf2} castShadow>
            <sphereGeometry args={[0.28, 12, 10]} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function Planter({ x, z, r = 0, l = 2.4 }: { x: number; z: number; r?: number; l?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.3, 0]} s={[l, 0.6, 0.45]} m={mm.graphite} />
      <Box p={[0, 0.78, 0]} s={[l - 0.1, 0.4, 0.36]} m={mm.leaf} />
    </group>
  );
}

export function ReceptionDesk({ x, z, r = 0 }: { x: number; z: number; r?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.55, 0]} s={[3.0, 1.1, 0.7]} m={mm.fabricNavy} />
      <Box p={[0, 1.11, 0]} s={[3.1, 0.04, 0.8]} m={mm.oak} />
      <Box p={[0, 0.37, -0.5]} s={[2.6, 0.74, 0.5]} m={mm.laminate} />
      <Box p={[0, 0.2, 0.36]} s={[3.0, 0.4, 0.02]} m={mm.chrome} shadow={false} />
      <Monitor x={0.5} z={-0.5} y={0.74} w={0.5} r={Math.PI} />
    </group>
  );
}

export function LogoWall({ x, z, r = 0, w = 3.2, h = 1.6, name = 'BUMEX VANGUARD', sub = 'GROUPE BUMEX · NOUAKCHOTT' }: { x: number; z: number; r?: number; w?: number; h?: number; name?: string; sub?: string }) {
  const tex = useMemo(() => logoWallTexture(name, sub), [name, sub]);
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, h / 2 + 0.6, 0]} s={[w + 0.3, h + 0.3, 0.08]} m={M().walnut} />
      <mesh position={[0, h / 2 + 0.6, 0.045]} castShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function Vault({ x, z, r = 0, lit }: { x: number; z: number; r?: number; lit: boolean }) {
  const mm = M();
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.emissiveIntensity = lit ? 0.9 + Math.sin(clock.elapsedTime * 1.5) * 0.3 : 0.08;
  });
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 1.05, 0]} s={[1.4, 2.1, 0.9]} m={mm.darkSteel} />
      <mesh position={[0, 1.05, 0.46]} material={mm.steel} castShadow>
        <boxGeometry args={[1.15, 1.85, 0.06]} />
      </mesh>
      <mesh position={[0.1, 1.05, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.2, 0.025, 8, 32]} />
        <meshStandardMaterial ref={ref} color="#a9bddc" emissive="#6b8dc1" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0.1 + Math.cos((i / 3) * Math.PI * 2) * 0.2, 1.05 + Math.sin((i / 3) * Math.PI * 2) * 0.2, 0.52]} rotation={[0, 0, (i / 3) * Math.PI * 2]} material={mm.chrome}>
          <boxGeometry args={[0.14, 0.03, 0.03]} />
        </mesh>
      ))}
      <mesh position={[-0.42, 1.2, 0.5]} material={mm.chrome}>
        <boxGeometry args={[0.05, 0.3, 0.04]} />
      </mesh>
    </group>
  );
}

export function Safe({ x, z, r = 0, w = 0.5, h = 0.6 }: { x: number; z: number; r?: number; w?: number; h?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, h / 2, 0]} s={[w, h, 0.5]} m={mm.darkSteel} />
      <Box p={[0, h / 2, 0.255]} s={[w - 0.08, h - 0.08, 0.01]} m={mm.steel} shadow={false} />
      <mesh position={[0.1, h / 2, 0.27]} rotation={[Math.PI / 2, 0, 0]} material={mm.chrome}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 12]} />
      </mesh>
    </group>
  );
}

export function Counter({ x, z, r = 0, l = 2.4 }: { x: number; z: number; r?: number; l?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.5, 0]} s={[l, 1.0, 0.6]} m={mm.white} />
      <Box p={[0, 1.01, 0]} s={[l + 0.06, 0.04, 0.68]} m={mm.oak} />
    </group>
  );
}

export function Tray({ x, z, y = 1.03, lit = false }: { x: number; z: number; y?: number; lit?: boolean }) {
  const mm = M();
  return (
    <group position={[x, y, z]}>
      <Box p={[0, 0.02, 0]} s={[0.36, 0.04, 0.26]} m={mm.black} />
      {lit && <Box p={[0, 0.06, 0]} s={[0.3, 0.04, 0.21]} m={mm.amber} />}
    </group>
  );
}

export function Crate({ x, z, r = 0, s = 1 }: { x: number; z: number; r?: number; s?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]} scale={s}>
      <Box p={[0, 0.3, 0]} s={[0.8, 0.6, 0.6]} m={M().kraft} />
      <Box p={[0, 0.6, 0]} s={[0.82, 0.03, 0.62]} m={M().graphite} shadow={false} />
    </group>
  );
}

export function ServerRack({ x, z, r = 0 }: { x: number; z: number; r?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 1.0, 0]} s={[0.6, 2.0, 0.8]} m={mm.black} />
      {Array.from({ length: 9 }).map((_, i) => (
        <group key={i}>
          <Box p={[0, 0.2 + i * 0.19, 0.405]} s={[0.5, 0.12, 0.01]} m={mm.darkSteel} shadow={false} />
          <mesh position={[0.18, 0.22 + i * 0.19, 0.415]}>
            <boxGeometry args={[0.02, 0.02, 0.005]} />
            <meshStandardMaterial color="#4cc26b" emissive="#4cc26b" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Printer({ x, z, r = 0 }: { x: number; z: number; r?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.45, 0]} s={[0.7, 0.9, 0.65]} m={mm.white} />
      <Box p={[0, 1.0, 0]} s={[0.66, 0.2, 0.6]} m={mm.graphite} />
      <Box p={[0, 1.12, 0.05]} s={[0.4, 0.04, 0.3]} m={mm.paper} shadow={false} />
    </group>
  );
}

export function HighTable({ x, z, r = 0, people = [] as (string | undefined)[] }: { x: number; z: number; r?: number; people?: (string | undefined)[] }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 1.05, 0]} s={[1.8, 0.04, 0.7]} m={mm.oak} />
      <Box p={[-0.7, 0.52, 0]} s={[0.06, 1.04, 0.5]} m={mm.darkSteel} />
      <Box p={[0.7, 0.52, 0]} s={[0.06, 1.04, 0.5]} m={mm.darkSteel} />
      {[-0.5, 0.5].map((sx, i) => (
        <group key={i}>
          <mesh position={[sx, 0.4, 0.6]} material={mm.darkSteel} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.76, 8]} />
          </mesh>
          <mesh position={[sx, 0.78, 0.6]} material={mm.fabricSand} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.05, 14]} />
          </mesh>
          <mesh position={[sx, 0.02, 0.6]} material={mm.darkSteel}>
            <cylinderGeometry args={[0.18, 0.18, 0.03, 14]} />
          </mesh>
          {people[i] && <Person position={[sx, 0.32, 0.6]} color={people[i]!} rotation={Math.PI} seated phase={i + 11} />}
        </group>
      ))}
    </group>
  );
}

export function Pantry({ x, z, r = 0, l = 3.0 }: { x: number; z: number; r?: number; l?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <Box p={[0, 0.45, 0]} s={[l, 0.9, 0.6]} m={mm.walnut} />
      <Box p={[0, 0.92, 0]} s={[l + 0.04, 0.04, 0.64]} m={mm.white} />
      <Box p={[-l / 2 + 0.4, 1.17, -0.15]} s={[0.4, 0.46, 0.3]} m={mm.black} />
      <Box p={[l / 2 - 0.5, 1.0, -0.1]} s={[0.5, 0.12, 0.3]} m={mm.chrome} />
      <Box p={[0, 1.9, -0.25]} s={[l, 0.7, 0.35]} m={mm.white} />
    </group>
  );
}

export function Lifts({ x, z, r = 0 }: { x: number; z: number; r?: number }) {
  const mm = M();
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      {[-0.95, 0.95].map((dx, i) => (
        <group key={i} position={[dx, 0, 0]}>
          <Box p={[0, 1.15, 0]} s={[1.5, 2.3, 0.06]} m={mm.steel} />
          <Box p={[0, 1.1, 0.035]} s={[0.02, 2.1, 0.01]} m={mm.black} shadow={false} />
          <mesh position={[0, 2.4, 0.04]}>
            <boxGeometry args={[0.3, 0.08, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" emissive={i === 0 ? '#d9a13e' : '#6b8dc1'} emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Box p={[0, 1.1, 0.03]} s={[0.1, 0.22, 0.02]} m={mm.chrome} shadow={false} />
    </group>
  );
}

export function Stairs({ x, z, r = 0, steps = 9, onClick }: { x: number; z: number; r?: number; steps?: number; onClick?: () => void }) {
  const mm = M();
  const rise = 0.17, run = 0.28;
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
      {Array.from({ length: steps }).map((_, i) => (
        <Box key={i} p={[0, (i + 0.5) * rise, -(i + 0.5) * run]} s={[1.3, rise, run]} m={mm.wallCap} />
      ))}
      {[-0.68, 0.68].map((sx) => (
        <group key={sx}>
          <mesh position={[sx, steps * rise * 0.5 + 0.5, -(steps * run) / 2]} rotation={[Math.atan2(rise, run), 0, 0]} material={mm.chrome} castShadow>
            <cylinderGeometry args={[0.02, 0.02, Math.hypot(steps * rise, steps * run), 8]} />
          </mesh>
          {[0.2, 0.5, 0.8].map((k) => (
            <mesh key={k} position={[sx, steps * rise * k + 0.5, -steps * run * k]} material={mm.chrome}>
              <cylinderGeometry args={[0.012, 0.012, 0.95, 6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function GlassWall({ x, z, r = 0, len, h = 3.0, door = false }: { x: number; z: number; r?: number; len: number; h?: number; door?: boolean }) {
  const mm = M();
  const panes = Math.max(1, Math.round(len / 1.2));
  return (
    <group position={[x, 0, z]} rotation={[0, r, 0]}>
      <mesh position={[0, h / 2, 0]} material={mm.glass}>
        <boxGeometry args={[len, h, 0.02]} />
      </mesh>
      <Box p={[0, 0.03, 0]} s={[len, 0.06, 0.06]} m={mm.darkSteel} shadow={false} />
      <Box p={[0, h - 0.03, 0]} s={[len, 0.06, 0.06]} m={mm.darkSteel} shadow={false} />
      {Array.from({ length: panes + 1 }).map((_, i) => (
        <Box key={i} p={[-len / 2 + (len / panes) * i, h / 2, 0]} s={[0.04, h, 0.05]} m={mm.darkSteel} shadow={false} />
      ))}
      {door && <Box p={[len / 2 - 0.55, 1.05, 0.03]} s={[0.04, 0.3, 0.03]} m={mm.chrome} shadow={false} />}
    </group>
  );
}
