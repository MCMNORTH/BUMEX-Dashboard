import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { FloorSignals } from '@bumex/domain';
import { facadeMaps, floorsToFacade, signTexture, stoneTexture, pavingTexture, lawnTexture, asphaltTexture, labelRegistry } from './textures';
import { useStore } from '../store';
import { BUILDING, floorY } from './plan';
import { M } from './Furniture';

// The tower at real scale, at night: a double-height glass lobby lit from inside, a curtain-wall shaft whose occupied
// bays glow, champagne spandrels and vertical fins, a stone service core on the back and a projecting roof with a
// light line. Plaza lamps light the forecourt; there is no sun and no neighbourhood. When the user is inside a floor,
// everything above that floor is removed so the plan reads like a cutaway of the same building.

export type Worst = 'good' | 'warn' | 'crit' | 'off';
export function worstSignal(f: FloorSignals): Worst {
  if (!f.visible) return 'off';
  const s = [f.cashSignal, f.overdueSignal, f.engagementSignal, f.draftSignal];
  if (s.includes('crit')) return 'crit';
  if (s.includes('warn')) return 'warn';
  return 'good';
}
export const LED_COLOR: Record<Worst, string> = { good: '#4cc26b', warn: '#e9b949', crit: '#e0433e', off: '#3a4252' };

const W = BUILDING.w, D = BUILDING.d, FH = BUILDING.floorH, PH = BUILDING.podiumH;

let exteriorMats: Record<string, THREE.Material> | null = null;
function EM() {
  if (exteriorMats) return exteriorMats;
  const stone = stoneTexture();
  stone.repeat.set(2, 8);
  const paving = pavingTexture();
  paving.repeat.set(24, 18);
  const lawn = lawnTexture();
  lawn.repeat.set(6, 6);
  const asphalt = asphaltTexture();
  asphalt.repeat.set(40, 2);
  exteriorMats = {
    spandrel: new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.5, metalness: 0.3 }),
    fin: new THREE.MeshStandardMaterial({ color: '#aeb2b8', roughness: 0.35, metalness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.75 }),
    roof: new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.95 }),
    paving: new THREE.MeshStandardMaterial({ map: paving, color: '#c9c4bb', roughness: 0.85 }),
    lawn: new THREE.MeshStandardMaterial({ map: lawn, color: '#6f7d5e', roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }),
    kerb: new THREE.MeshStandardMaterial({ color: '#d8d3c8', roughness: 0.8 }),
    hedge: new THREE.MeshStandardMaterial({ color: '#2f5c33', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#6b5236', roughness: 1 }),
    frond: new THREE.MeshStandardMaterial({ color: '#3d7a38', roughness: 0.95, side: THREE.DoubleSide }),
    canopy: new THREE.MeshStandardMaterial({ color: '#3f7a3c', roughness: 0.95 }),
    canopy2: new THREE.MeshStandardMaterial({ color: '#2f6133', roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: '#2b4a6b', roughness: 0.06, metalness: 0.5 }),
    lobbyGlass: new THREE.MeshPhysicalMaterial({ color: '#dfe9f4', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, depthWrite: false }),
    lobbyFloor: new THREE.MeshStandardMaterial({ color: '#d8d1c4', roughness: 0.3, metalness: 0.05 }),
    lobbyCeiling: new THREE.MeshStandardMaterial({ color: '#fff6e6', emissive: '#fff1d6', emissiveIntensity: 1.6, roughness: 0.9 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffe7bd', emissiveIntensity: 3.2, toneMapped: false }),
    strip: new THREE.MeshStandardMaterial({ color: '#f3f6ff', emissive: '#dfe8ff', emissiveIntensity: 2.2, toneMapped: false }),
    column: new THREE.MeshStandardMaterial({ color: '#e3ded4', roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2f333a', roughness: 0.7, metalness: 0.3 }),
    sand: new THREE.MeshStandardMaterial({ color: '#9a917f', roughness: 1 }),
    carBody: new THREE.MeshStandardMaterial({ color: '#e6e6e3', roughness: 0.35, metalness: 0.5 }),
    carBody2: new THREE.MeshStandardMaterial({ color: '#2b3f66', roughness: 0.35, metalness: 0.5 }),
    carGlass: new THREE.MeshStandardMaterial({ color: '#4a5f78', roughness: 0.15, metalness: 0.6 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#1a1c20', roughness: 0.9 }),
  };
  return exteriorMats;
}

function Palm({ position, h = 7, s = 1 }: { position: [number, number, number]; h?: number; s?: number }) {
  const m = EM();
  const fronds = useMemo(() => Array.from({ length: 13 }).map((_, i) => ({ a: (i / 13) * Math.PI * 2 + 0.3, tilt: 0.5 + (i % 4) * 0.16 })), []);
  return (
    <group position={position} scale={s}>
      <mesh position={[0.1, h / 2, 0]} rotation={[0, 0, -0.03]} material={m.trunk} castShadow>
        <cylinderGeometry args={[0.16, 0.3, h, 8]} />
      </mesh>
      {fronds.map((f, i) => (
        <group key={i} position={[0.2, h, 0]} rotation={[0, f.a, 0]}>
          <mesh position={[1.5, 0.2, 0]} rotation={[0, 0, -f.tilt]} material={m.frond} castShadow>
            <planeGeometry args={[3.2, 0.5, 4, 1]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.2, h + 0.1, 0]} material={m.trunk} castShadow>
        <sphereGeometry args={[0.35, 8, 6]} />
      </mesh>
    </group>
  );
}

function Tree({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  const m = EM();
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 1.6, 0]} material={m.trunk} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 3.2, 7]} />
      </mesh>
      <mesh position={[0, 4.4, 0]} material={m.canopy} castShadow>
        <sphereGeometry args={[2.2, 12, 10]} />
      </mesh>
      <mesh position={[1.1, 5.4, 0.5]} material={m.canopy2} castShadow>
        <sphereGeometry args={[1.5, 12, 10]} />
      </mesh>
      <mesh position={[-1.0, 3.9, -0.6]} material={m.canopy2} castShadow>
        <sphereGeometry args={[1.3, 12, 10]} />
      </mesh>
    </group>
  );
}

function Car({ position, r = 0, navy = false, suv = false }: { position: [number, number, number]; r?: number; navy?: boolean; suv?: boolean }) {
  const m = EM();
  const h = suv ? 0.8 : 0.6;
  return (
    <group position={position} rotation={[0, r, 0]}>
      <mesh position={[0, 0.3 + h / 2, 0]} material={navy ? m.carBody2 : m.carBody} castShadow>
        <boxGeometry args={[4.4, h, 1.85]} />
      </mesh>
      <mesh position={[-0.2, 0.3 + h + 0.3, 0]} material={m.carGlass} castShadow>
        <boxGeometry args={[2.4, 0.6, 1.7]} />
      </mesh>
      {[[-1.4, -0.95], [1.4, -0.95], [-1.4, 0.95], [1.4, 0.95]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.34, z]} rotation={[Math.PI / 2, 0, 0]} material={m.tyre} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.26, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function Fins({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const m = EM();
  const positions = useMemo(() => {
    const out: { x: number; y: number; z: number; r: number }[] = [];
    for (let i = 0; i < count; i++) {
      const y = floorY(i) + FH / 2 + 0.1;
      for (let x = -W / 2 + 1.6; x < W / 2; x += 3.2) { out.push({ x, y, z: D / 2 + 0.28, r: 0 }); out.push({ x, y, z: -D / 2 - 0.28, r: 0 }); }
      for (let z = -D / 2 + 1.6; z < D / 2 - 0.1; z += 3.2) { out.push({ x: W / 2 + 0.28, y, z, r: Math.PI / 2 }); out.push({ x: -W / 2 - 0.28, y, z, r: Math.PI / 2 }); }
    }
    return out;
  }, [count]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const o = new THREE.Object3D();
    positions.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, p.r, 0);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  if (!positions.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} material={m.fin} castShadow receiveShadow>
      <boxGeometry args={[0.1, FH - 0.5, 0.42]} />
    </instancedMesh>
  );
}

function FloorPick({ f, idx, hot }: { f: FloorSignals; idx: number; hot: boolean }) {
  const setUi = useStore((s) => s.setUi);
  const goFloor = useStore((s) => s.goFloor);
  const openRoom = useStore((s) => s.openRoom);
  const worst = worstSignal(f);
  const ledRef = useRef<THREE.MeshStandardMaterial>(null);
  const y = floorY(idx);
  useFrame(({ clock }) => {
    if (ledRef.current) ledRef.current.emissiveIntensity = worst === 'crit' ? 0.9 + 0.5 * Math.sin(clock.elapsedTime * 3) : worst === 'off' ? 0.1 : 0.9;
  });
  const clickable = f.visible;
  return (
    <group position={[0, y, 0]}>
      {/* a thin status line under the spandrel: the floor's worst signal */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[W + 0.42, 0.05, D + 0.42]} />
        <meshStandardMaterial ref={ledRef} color={LED_COLOR[worst]} emissive={LED_COLOR[worst]} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh
        position={[0, FH / 2, 0]}
        onPointerOver={(e) => { e.stopPropagation(); if (clickable) { setUi({ hoverFloor: f.entity.id }); document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { setUi({ hoverFloor: null }); document.body.style.cursor = ''; }}
        onClick={(e) => {
          e.stopPropagation();
          if (!clickable) return;
          document.body.style.cursor = '';
          if (f.entity.isHolding) { goFloor(f.entity.id); openRoom('penthouse'); } else goFloor(f.entity.id);
        }}
      >
        <boxGeometry args={[W + 1.2, FH, D + 1.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hot && (
        <lineSegments position={[0, FH / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(W + 0.7, FH - 0.1, D + 0.7)]} />
          <lineBasicMaterial color="#f4f5f7" transparent opacity={0.9} />
        </lineSegments>
      )}
    </group>
  );
}

export function Building({ floors, insideIndex }: { floors: FloorSignals[]; insideIndex: number | null }) {
  const hover = useStore((s) => s.ui.hoverFloor);
  // real point lights only outside and in the full-quality mode; the lamps always glow (emissive)
  const lights = useStore((s) => s.ui.quality.shadows) && insideIndex === null;
  const m = EM();
  const n = floors.length;
  const shown = insideIndex === null ? n : insideIndex; // office floors drawn as facade
  const version = floors.map((f) => `${f.entity.id}:${f.visible ? 1 : 0}:${f.entity.staffPresent}`).join(',');
  const bottomFirst = useMemo(() => floorsToFacade([...floors].reverse()), [floors, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const shaftMats = useMemo(() => {
    if (shown === 0) return null;
    const front = facadeMaps('front', bottomFirst, 20, version);
    const side = facadeMaps('side', bottomFirst, 12, version);
    const crop = (t: THREE.Texture) => {
      if (shown === n) return t;
      const c = t.clone();
      c.repeat.set(1, shown / n);
      c.offset.set(0, 0);
      c.needsUpdate = true;
      return c;
    };
    const glass = (maps: { map: THREE.Texture; emissive: THREE.Texture }) =>
      new THREE.MeshStandardMaterial({ map: crop(maps.map), emissiveMap: crop(maps.emissive), emissive: '#ffffff', emissiveIntensity: 1.25, metalness: 0.35, roughness: 0.12, envMapIntensity: 0.9 });
    const roof = new THREE.MeshStandardMaterial({ color: '#5e5c58', roughness: 0.95 });
    return [glass(side), glass(side), roof, roof, glass(front), glass(front)];
  }, [bottomFirst, version, shown, n]);
  const signTex = useMemo(() => signTexture('BUMEX'), []);
  const shaftH = shown * FH;
  const roofY = floorY(n);
  useEffect(() => {
    const hot = floors.find((f) => f.entity.id === hover);
    for (const f of floors) {
      const idx = n - 1 - f.entity.floorOrder;
      labelRegistry.set(`floor:${f.entity.id}`, { wx: -W / 2 - 1.2, wy: floorY(idx) + FH / 2, wz: D / 2 + 1, visible: insideIndex === null && hot?.entity.id === f.entity.id });
    }
  }, [floors, hover, insideIndex, n]);
  const coreTop = insideIndex === null ? roofY + 2.8 : floorY(insideIndex) + FH;
  return (
    <group>
      {/* shaft */}
      {shaftMats && (
        <mesh position={[0, PH + shaftH / 2, 0]} material={shaftMats} castShadow receiveShadow>
          <boxGeometry args={[W, shaftH, D]} />
        </mesh>
      )}
      {Array.from({ length: shown }).map((_, i) => (
        <mesh key={i} position={[0, floorY(i) + 0.25, 0]} material={m.spandrel} castShadow receiveShadow>
          <boxGeometry args={[W + 0.5, 0.5, D + 0.5]} />
        </mesh>
      ))}
      <Fins count={Math.max(0, shown === n ? n - 1 : shown)} />
      {insideIndex === null && floors.map((f) => <FloorPick key={f.entity.id} f={f} idx={n - 1 - f.entity.floorOrder} hot={hover === f.entity.id} />)}
      {/* service core on the back, roof and crown */}
      <mesh position={[0, coreTop / 2, -D / 2 - 2]} material={m.stone} castShadow receiveShadow>
        <boxGeometry args={[11, coreTop, 4.2]} />
      </mesh>
      {insideIndex === null && (
        <group>
          <mesh position={[0, roofY + 0.3, 0]} material={m.spandrel} castShadow receiveShadow>
            <boxGeometry args={[W + 4.4, 0.6, D + 4.4]} />
          </mesh>
          <mesh position={[0, roofY - 0.05, 0]} material={m.roof}>
            <boxGeometry args={[W, 0.1, D]} />
          </mesh>
          {[-W / 2 + 0.8, W / 2 - 0.8].map((x) => (
            <mesh key={x} position={[x, roofY + 1.0, 0]} material={m.spandrel} castShadow>
              <boxGeometry args={[0.3, 1.4, D - 1]} />
            </mesh>
          ))}
          {[-D / 2 + 0.8, D / 2 - 0.8].map((z) => (
            <mesh key={z} position={[0, roofY + 1.0, z]} material={m.spandrel} castShadow>
              <boxGeometry args={[W - 1, 1.4, 0.3]} />
            </mesh>
          ))}
          <mesh position={[8, roofY + 1.8, -4]} material={m.white} castShadow>
            <boxGeometry args={[7, 2.4, 5]} />
          </mesh>
          {/* a thin light line under the roof overhang */}
          <mesh position={[0, roofY + 0.02, 0]} material={m.strip}>
            <boxGeometry args={[W + 4.2, 0.06, D + 4.2]} />
          </mesh>
        </group>
      )}

      {/* podium: double-height glass lobby with columns, a stone back wall, the canopy */}
      <mesh position={[0, PH - 0.3, 0]} material={m.spandrel} castShadow receiveShadow>
        <boxGeometry args={[BUILDING.podiumW + 1, 0.6, BUILDING.podiumD + 1]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={m.lobbyFloor} receiveShadow>
        <boxGeometry args={[BUILDING.podiumW, 0.12, BUILDING.podiumD]} />
      </mesh>
      <mesh position={[0, PH / 2 - 0.3, 0]} material={m.lobbyGlass}>
        <boxGeometry args={[BUILDING.podiumW, PH - 0.6, BUILDING.podiumD]} />
      </mesh>
      <mesh position={[0, PH - 0.66, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.lobbyCeiling}>
        <planeGeometry args={[BUILDING.podiumW - 1.5, BUILDING.podiumD - 1.5]} />
      </mesh>
      {lights && [-10, 10].map((x) => <pointLight key={x} position={[x, PH - 1.2, 2]} intensity={160} distance={36} decay={2} color="#ffe9c8" />)}
      {[-16, -8, 0, 8, 16].flatMap((x) => [-10, 0, 10].map((z) => (
        <mesh key={`${x}${z}`} position={[x, PH / 2 - 0.3, z]} material={m.column} castShadow>
          <cylinderGeometry args={[0.35, 0.35, PH - 0.6, 14]} />
        </mesh>
      )))}
      <mesh position={[0, PH / 2 - 0.3, -BUILDING.podiumD / 2 + 1.5]} material={m.stone} castShadow receiveShadow>
        <boxGeometry args={[BUILDING.podiumW - 6, PH - 0.6, 1.2]} />
      </mesh>
      <mesh position={[0, 0.7, -3]} material={m.dark} castShadow>
        <boxGeometry args={[6, 1.2, 1.4]} />
      </mesh>
      <mesh position={[0, PH - 0.3, BUILDING.podiumD / 2 + 4.5]} material={m.spandrel} castShadow receiveShadow>
        <boxGeometry args={[18, 0.5, 9]} />
      </mesh>
      {[-7, 7].map((x) => (
        <mesh key={x} position={[x, PH / 2 - 0.3, BUILDING.podiumD / 2 + 7.5]} material={m.column} castShadow>
          <cylinderGeometry args={[0.22, 0.22, PH - 0.6, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 1.4, BUILDING.podiumD / 2]} material={m.lobbyGlass}>
        <cylinderGeometry args={[1.5, 1.5, 2.8, 24]} />
      </mesh>

      {/* plaza, lawns, hedges, water, trees, palms */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]} material={m.paving} receiveShadow>
        <planeGeometry args={[96, 72]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} material={m.sand} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
      </mesh>
      {[[-36, 4, 20, 40], [36, 4, 20, 40], [0, -30, 90, 8]].map(([x, z, w, d], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, z]} material={m.lawn} receiveShadow>
          <planeGeometry args={[w, d]} />
        </mesh>
      ))}
      {[[-26, 4, 0.6, 40], [26, 4, 0.6, 40], [0, -26, 90, 0.6]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.4, z]} material={m.hedge} castShadow receiveShadow>
          <boxGeometry args={[w, 0.8, d]} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, 23]} material={m.kerb} receiveShadow>
        <boxGeometry args={[22, 0.3, 4.6]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.24, 23]} material={m.water}>
        <planeGeometry args={[21, 3.6]} />
      </mesh>
      {[-14, 14].map((x) => [8, 22].map((z) => <Palm key={`${x}${z}`} position={[x, 0, z]} h={7 + ((x + z) % 3)} />))}
      {[-33, 33].map((x) => [-8, 0, 8, 16].map((z) => <Palm key={`${x}${z}`} position={[x, 0, z]} h={6 + ((x + z + 40) % 4)} s={0.9} />))}
      {[-42, -30, -18, 18, 30, 42].map((x) => <Tree key={x} position={[x, 0, 33]} s={0.9 + (Math.abs(x) % 7) / 20} />)}
      {[-20, -10, 10, 20].map((x) => <Tree key={x} position={[x, 0, -30]} s={1.1} />)}
      {[-18, 18].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.25, 12]} material={m.dark} castShadow>
            <boxGeometry args={[2.2, 0.08, 0.6]} />
          </mesh>
          <mesh position={[x, 0.12, 12]} material={m.dark}>
            <boxGeometry args={[1.8, 0.2, 0.4]} />
          </mesh>
        </group>
      ))}
      {[[-20, 28], [-12, 28], [12, 28], [20, 28], [-30, 8], [30, 8], [-30, -14], [30, -14]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <mesh position={[x, 3.5, z]} material={m.dark} castShadow>
            <cylinderGeometry args={[0.07, 0.1, 7, 8]} />
          </mesh>
          <mesh position={[x, 7, z]} material={m.dark}>
            <boxGeometry args={[0.8, 0.14, 0.3]} />
          </mesh>
          <mesh position={[x, 6.92, z]} material={m.lamp}>
            <boxGeometry args={[0.7, 0.05, 0.24]} />
          </mesh>
          {lights && z === 28 && <pointLight position={[x, 6.6, z]} intensity={90} distance={30} decay={2} color="#ffe2b8" />}
        </group>
      ))}
      {/* a small, discreet lit sign by the entrance */}
      <group position={[24, 0, 16]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 0.8, 0.3]} />
          <meshStandardMaterial map={signTex} emissiveMap={signTex} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.25, 0]} material={m.dark}>
          <boxGeometry args={[3.2, 0.5, 0.5]} />
        </mesh>
      </group>
      {/* road, kerbs, crossing, parking */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 44]} material={m.asphalt} receiveShadow>
        <planeGeometry args={[240, 9]} />
      </mesh>
      <mesh position={[0, 0.1, 39.4]} material={m.kerb} receiveShadow>
        <boxGeometry args={[240, 0.2, 0.4]} />
      </mesh>
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-116 + i * 8, 0.02, 44]} material={m.white}>
          <planeGeometry args={[3, 0.2]} />
        </mesh>
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-3 + i * 1, 0.02, 44]} material={m.white}>
          <planeGeometry args={[0.5, 8]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[34, 0.015, 30]} material={m.asphalt} receiveShadow>
        <planeGeometry args={[26, 12]} />
      </mesh>
      {[-10, -5, 0, 5, 10].map((dx, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[34 + dx, 0.03, 30]} material={m.white}>
          <planeGeometry args={[0.15, 6]} />
        </mesh>
      ))}
      <Car position={[26.5, 0, 30]} r={Math.PI / 2} suv />
      <Car position={[31.5, 0, 30]} r={Math.PI / 2} navy />
      <Car position={[41.5, 0, 30]} r={Math.PI / 2} />
    </group>
  );
}
