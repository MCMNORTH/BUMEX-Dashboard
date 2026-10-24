import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { FloorSignals, Engagement, Asset, ArchiveRow, Task } from '@bumex/domain';
import { canOpenRoom } from '@bumex/domain';
import { useStore } from '../store';
import { ROOM_KEYS, type Room } from '../i18n';
import { PLAN, CORRIDOR, WALL, CLEAR_H, BUILDING, type Rect, type PlanRoom } from './plan';
import { woodTexture, tileTexture, carpetTexture, concreteTexture, kanbanTexture, chartTexture, labelRegistry } from './textures';
import { Person, Walker, ROLE_COLORS } from './People';
import { M, Box, Desk, Chair, Cabinet, Bookshelf, ConferenceTable, WallScreen, Sofa, Armchair, CoffeeTable, Plant, Planter, ReceptionDesk, LogoWall, Vault, Safe, Counter, Tray, Crate, ServerRack, Printer, HighTable, GlassWall, FolderStack } from './Furniture';
import { ArchiveRack } from './ArchiveRack';

// One office floor at real scale, drawn inside the building at its own height, lit at night by its own ceiling
// lighting: white, even, no hard shadows (the light itself is set up in Scene). Partitions are section-cut at 1.55 m so the plan reads from above; glass
// partitions keep their full height. Decor and people follow the data. Module rooms the signed-in person may not
// open are left in the dark.

const MODULE_ROOMS = new Set<string>(ROOM_KEYS);

// The light is off: a dark volume over the room, so its furniture and floor read as unlit.
function DarkRoom({ rect }: { rect: Rect }) {
  return (
    <mesh position={[rect.cx, CLEAR_H / 2 + 0.02, rect.cz]} renderOrder={5}>
      <boxGeometry args={[rect.w - 0.02, CLEAR_H + 0.02, rect.d - 0.02]} />
      <meshBasicMaterial color="#04060b" transparent opacity={0.68} depthWrite={false} side={THREE.FrontSide} />
    </mesh>
  );
}

interface Seg { x0: number; z0: number; x1: number; z1: number; doors?: number[]; glass?: boolean; doorW?: number }

function Wall({ seg }: { seg: Seg }) {
  const mm = M();
  const dx = seg.x1 - seg.x0, dz = seg.z1 - seg.z0;
  const len = Math.hypot(dx, dz);
  const r = Math.atan2(-dz, dx); // rotation so the box length runs along the segment
  const cx = (seg.x0 + seg.x1) / 2, cz = (seg.z0 + seg.z1) / 2;
  if (seg.glass) {
    return <GlassWall x={cx} z={cz} r={r} len={len} door={!!seg.doors?.length} />;
  }
  // split by door openings (positions measured along the segment from its start)
  const doorW = seg.doorW ?? 0.95;
  const cuts = [...(seg.doors ?? [])].sort((a, b) => a - b);
  const parts: [number, number][] = [];
  let from = 0;
  for (const d of cuts) {
    parts.push([from, d - doorW / 2]);
    from = d + doorW / 2;
  }
  parts.push([from, len]);
  const ux = dx / len, uz = dz / len;
  return (
    <group>
      {parts.filter(([a, b]) => b - a > 0.02).map(([a, b], i) => {
        const l = b - a;
        const m = (a + b) / 2;
        const px = seg.x0 + ux * m, pz = seg.z0 + uz * m;
        return (
          <group key={i} position={[px, 0, pz]} rotation={[0, r, 0]}>
            <mesh position={[0, WALL.h / 2, 0]} material={mm.wall} castShadow receiveShadow>
              <boxGeometry args={[l, WALL.h, WALL.t]} />
            </mesh>
            <mesh position={[0, WALL.h + 0.01, 0]} material={mm.wallCap}>
              <boxGeometry args={[l + 0.01, 0.02, WALL.t + 0.01]} />
            </mesh>
          </group>
        );
      })}
      {cuts.map((d, i) => (
        // door frame: a lintel over the opening at the cut height and a floor threshold
        <group key={`d${i}`} position={[seg.x0 + ux * d, 0, seg.z0 + uz * d]} rotation={[0, r, 0]}>
          <Box p={[0, WALL.h - 0.06, 0]} s={[doorW + 0.04, 0.12, WALL.t + 0.02]} m={mm.graphite} shadow={false} />
          <Box p={[-doorW / 2 + 0.03, WALL.h / 2, 0]} s={[0.06, WALL.h, WALL.t + 0.02]} m={mm.graphite} shadow={false} />
          <Box p={[doorW / 2 - 0.03, WALL.h / 2, 0]} s={[0.06, WALL.h, WALL.t + 0.02]} m={mm.graphite} shadow={false} />
          <Box p={[0, 0.005, 0]} s={[doorW, 0.01, WALL.t + 0.04]} m={mm.chrome} shadow={false} />
        </group>
      ))}
    </group>
  );
}

const WALLS: Seg[] = [
  // north band partitions: five offices across the whole band, no core
  { x0: -9.5, z0: -10, x1: -9.5, z1: -5.5 },
  { x0: -3, z0: -10, x1: -3, z1: -5.5 },
  { x0: 3, z0: -10, x1: 3, z1: -5.5 },
  { x0: 9.5, z0: -10, x1: 9.5, z1: -5.5 },
  // corridor, north side: treasury, suppliers, assets (wide door), tax and hr with glass fronts
  { x0: -16, z0: -5.5, x1: -9.5, z1: -5.5, doors: [4.5] },
  { x0: -9.5, z0: -5.5, x1: -3, z1: -5.5, doors: [3.2] },
  { x0: -3, z0: -5.5, x1: 3, z1: -5.5, doors: [3], doorW: 1.4 },
  { x0: 3, z0: -5.5, x1: 9.5, z1: -5.5, glass: true, doors: [2] },
  { x0: 9.5, z0: -5.5, x1: 16, z1: -5.5, glass: true, doors: [2] },
  // corridor, south side: accounting door, meeting glass front, the reception opens onto the corridor, clients door, missions door
  { x0: -16, z0: -3.1, x1: -8.5, z1: -3.1, doors: [2.2] },
  { x0: -8.5, z0: -3.1, x1: -3.5, z1: -3.1, glass: true, doors: [1.2] },
  { x0: 3.5, z0: -3.1, x1: 10, z1: -3.1, doors: [1.5] },
  { x0: 10, z0: -3.1, x1: 16, z1: -3.1, doors: [1.5] },
  // south block
  { x0: -8.5, z0: -3.1, x1: -8.5, z1: 10 },
  { x0: -8.5, z0: 1.4, x1: -3.5, z1: 1.4 },
  { x0: -3.5, z0: -3.1, x1: -3.5, z1: 1.4, glass: true, doors: [1.5] },
  { x0: -3.5, z0: 1.4, x1: -3.5, z1: 10, glass: true, doors: [1.6] },
  { x0: -3.5, z0: 3.2, x1: 3.5, z1: 3.2, doors: [5.9] },
  { x0: 3.5, z0: -3.1, x1: 3.5, z1: 10, glass: true, doors: [2.6] },
  { x0: 10, z0: -3.1, x1: 10, z1: 10 },
];

function RoomFloor({ room, rect, map, color, hot, floorY, y = 0.012 }: { room: PlanRoom; rect: Rect; map?: THREE.Texture; color: string; hot: boolean; floorY: number; y?: number }) {
  const setUi = useStore((s) => s.setUi);
  const focusRoom = useStore((s) => s.focusRoom);
  const openRoom = useStore((s) => s.openRoom);
  const toast = useStore((s) => s.toast);
  const state = useStore((s) => s.state);
  const entityId = useStore((s) => s.ui.entityId);
  const focused = useStore((s) => s.ui.focusRoom);
  const isModule = MODULE_ROOMS.has(room);
  const allowed = isModule && entityId ? canOpenRoom(state, entityId, room) : true;
  useEffect(() => {
    labelRegistry.set(`room:${room}`, { wx: rect.cx, wy: floorY + 1.9, wz: rect.cz, visible: true });
    // the far edge of the room: where the name sits when the room is open, above it, out of the way
    labelRegistry.set(`roomtop:${room}`, { wx: rect.cx, wy: floorY + 2.4, wz: rect.cz - rect.d / 2 + 0.3, visible: true });
    return () => { labelRegistry.delete(`room:${room}`); labelRegistry.delete(`roomtop:${room}`); };
  }, [room, rect, floorY]);
  const tint = focused === room ? 0.1 : isModule ? 0.14 : 0.07;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[rect.cx, y, rect.cz]}
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setUi({ hoverRoom: room }); document.body.style.cursor = allowed ? 'pointer' : 'not-allowed'; }}
        onPointerOut={() => { setUi({ hoverRoom: null }); document.body.style.cursor = ''; }}
        onClick={(e) => {
          e.stopPropagation();
          document.body.style.cursor = '';
          if (!allowed) { toast('error', 'Module non autorisé pour votre compte : la lumière reste éteinte'); return; }
          if (focused === room && isModule) openRoom(room as Room);
          else focusRoom(room);
        }}
      >
        <planeGeometry args={[rect.w, rect.d]} />
        <meshStandardMaterial map={map} color={color} roughness={0.9} />
      </mesh>
      {(hot || focused === room) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.cx, y + 0.01, rect.cz]}>
          <planeGeometry args={[rect.w, rect.d]} />
          <meshBasicMaterial color={focused === room ? '#d9a13e' : '#6b8dc1'} transparent opacity={tint} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// Curtain wall around the plate: floor-to-ceiling glass with mullions every 1.6 m, so the floor reads as part of the tower.
function CurtainWall() {
  const mm = M();
  const w = BUILDING.w, d = BUILDING.d, h = CLEAR_H;
  const mullions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.6) { out.push([x, -d / 2, 0]); out.push([x, d / 2, 0]); }
    for (let z = -d / 2 + 1.6; z < d / 2; z += 1.6) { out.push([-w / 2, z, Math.PI / 2]); out.push([w / 2, z, Math.PI / 2]); }
    return out;
  }, [w, d]);
  return (
    <group>
      {[[0, -d / 2, 0, w], [0, d / 2, 0, w], [-w / 2, 0, Math.PI / 2, d], [w / 2, 0, Math.PI / 2, d]].map(([x, z, r, len], i) => (
        <mesh key={i} position={[x, h / 2, z]} rotation={[0, r, 0]} material={mm.glass}>
          <planeGeometry args={[len, h]} />
        </mesh>
      ))}
      {mullions.map(([x, z, r], i) => (
        <mesh key={i} position={[x, h / 2, z]} rotation={[0, r, 0]} material={mm.mullion}>
          <boxGeometry args={[0.07, h, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[w + 0.02, 1.0, d + 0.02]} />
        <meshStandardMaterial color="#d9d3c7" roughness={0.6} side={THREE.BackSide} />
      </mesh>
      <Box p={[0, 0.5, -d / 2]} s={[w + 0.3, 1.0, 0.3]} m={mm.wall} shadow={false} />
      <Box p={[0, 0.5, d / 2]} s={[w + 0.3, 1.0, 0.3]} m={mm.wall} shadow={false} />
      <Box p={[-w / 2, 0.5, 0]} s={[0.3, 1.0, d + 0.3]} m={mm.wall} shadow={false} />
      <Box p={[w / 2, 0.5, 0]} s={[0.3, 1.0, d + 0.3]} m={mm.wall} shadow={false} />
    </group>
  );
}

export function OfficeFloor({ y, signals, engagements, assets, archives, tasks, today, people = true }: { y: number; signals: FloorSignals; engagements: Engagement[]; assets: Asset[]; archives: ArchiveRow[]; tasks: Task[]; today: string; people?: boolean }) {
  const hover = useStore((s) => s.ui.hoverRoom);
  const state = useStore((s) => s.state);
  const mm = M();
  const stone = useMemo(() => { const m = tileTexture('#e9e5dd', 'rgba(70,60,50,.35)', 128); m.repeat.set(8, 0.6); return m; }, []);
  const stoneHall = useMemo(() => { const m = tileTexture('#ebe7df', 'rgba(70,60,50,.3)', 128); m.repeat.set(1.75, 1.6); return m; }, []);
  const carpetBlue = useMemo(() => { const m = carpetTexture('#5c6b85', 7); m.repeat.set(3.75, 6.5); return m; }, []);
  const carpetGray = useMemo(() => { const m = carpetTexture('#8a8f99', 8); m.repeat.set(3, 6.5); return m; }, []);
  const carpetNavy = useMemo(() => { const m = carpetTexture('#3d4a66', 9); m.repeat.set(3.25, 2.25); return m; }, []);
  const walnut = useMemo(() => { const m = woodTexture('walnut'); m.repeat.set(1.25, 2.2); return m; }, []);
  const oak = useMemo(() => { const m = woodTexture('oak'); m.repeat.set(1.75, 1.7); return m; }, []);
  const darkTile = useMemo(() => { const m = tileTexture('#8e9298', 'rgba(20,20,25,.45)', 128); m.repeat.set(1.6, 1.1); return m; }, []);
  const lino = useMemo(() => { const m = carpetTexture('#c9c2b4', 10); m.repeat.set(1.6, 1.1); return m; }, []);
  const concrete = useMemo(() => { const m = concreteTexture(); m.repeat.set(1.5, 1.1); return m; }, []);
  const active = engagements.filter((e) => e.status === 'active').slice(0, 10);
  const toArchive = engagements.filter((e) => e.status === 'completed' && !e.archiveId).length;
  const kanban = useMemo(() => kanbanTexture([1, 2, 3, 4, 5].map((st) => engagements.filter((e) => e.stage === st && e.status !== 'completed').length)), [engagements]);
  const assetRatio = assets.length ? assets.reduce((a, x) => a + x.accumulated, 0) / Math.max(1, assets.reduce((a, x) => a + x.cost, 0)) : 0;
  const chart = useMemo(() => chartTexture('Amortissement du parc', assetRatio, 'amorti'), [assetRatio]);
  const colors = [ROLE_COLORS.partner, ROLE_COLORS.manager, ROLE_COLORS.senior, ROLE_COLORS.assistant, ROLE_COLORS.staff];
  // Seats are filled in priority order (the busy rooms first) until the number of people present is reached.
  const ORDER = ['acc0', 'mis0', 'cli0', 'acc1', 'mis1', 'bank', 'board0', 'acc2', 'mis2', 'sup', 'cli1', 'acc3', 'mis3', 'tax', 'office0', 'acc4', 'mis4', 'board1', 'hr', 'acc5', 'mis5', 'assets', 'meet0', 'acc6', 'mis6', 'office1', 'board2', 'acc7', 'mis7', 'meet1', 'acc8', 'mis8', 'acc9', 'mis9', 'hi'];
  const present = people ? signals.entity.staffPresent : 0;
  const seated = new Set(ORDER.slice(0, present));
  const take = (c: string, id: string) => (seated.has(id) ? c : undefined);
  const r = PLAN;
  const meetingOn = tasks.some((t) => t.status === 'in_progress' && t.module === 'missions');
  const entityId = signals.entity.id;
  const dark = useMemo(() => new Set(ROOM_KEYS.filter((k) => !canOpenRoom(state, entityId, k)) as string[]), [state, entityId]);
  return (
    <group position={[0, y, 0]}>
      {/* slab and the glass envelope */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[BUILDING.w, BUILDING.d]} />
        <meshStandardMaterial color="#d9d6cf" roughness={0.95} />
      </mesh>
      <Box p={[0, -BUILDING.slab / 2 - 0.001, 0]} s={[BUILDING.w + 0.3, BUILDING.slab, BUILDING.d + 0.3]} m={mm.wallCap} shadow={false} />
      <CurtainWall />

      {/* corridor: pale stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, CORRIDOR.cz]} receiveShadow>
        <planeGeometry args={[BUILDING.w, CORRIDOR.d]} />
        <meshStandardMaterial map={stone} roughness={0.5} />
      </mesh>
      <RoomFloor room="reception" rect={r.reception} map={stoneHall} color="#ffffff" hot={hover === 'reception'} floorY={y} />
      <RoomFloor room="office" rect={r.office} map={oak} color="#ffffff" hot={hover === 'office'} floorY={y} />
      <RoomFloor room="bank" rect={r.bank} map={darkTile} color="#ffffff" hot={hover === 'bank'} floorY={y} />
      <RoomFloor room="suppliers" rect={r.suppliers} map={lino} color="#ffffff" hot={hover === 'suppliers'} floorY={y} />
      <RoomFloor room="assets" rect={r.assets} map={concrete} color="#ffffff" hot={hover === 'assets'} floorY={y} />
      <RoomFloor room="tax" rect={r.tax} map={carpetNavy} color="#ffffff" hot={hover === 'tax'} floorY={y} />
      <RoomFloor room="hr" rect={r.hr} map={carpetNavy} color="#ffffff" hot={hover === 'hr'} floorY={y} />
      <RoomFloor room="accounting" rect={r.accounting} map={carpetBlue} color="#ffffff" hot={hover === 'accounting'} floorY={y} />
      <RoomFloor room="meeting" rect={r.meeting} map={carpetGray} color="#ffffff" hot={hover === 'meeting'} floorY={y} />
      <RoomFloor room="board" rect={r.board} map={walnut} color="#ffffff" hot={hover === 'board'} floorY={y} />
      <RoomFloor room="clients" rect={r.clients} map={carpetBlue} color="#ffffff" hot={hover === 'clients'} floorY={y} />
      <RoomFloor room="missions" rect={r.missions} map={carpetGray} color="#ffffff" hot={hover === 'missions'} floorY={y} />
      {WALLS.map((w, i) => <Wall key={i} seg={w} />)}

      {/* corridor life */}
      <Plant x={-15.3} z={CORRIDOR.cz} />
      <Plant x={-3.3} z={CORRIDOR.cz + 0.8} />
      <Plant x={3.3} z={CORRIDOR.cz - 0.8} />
      <Plant x={15.3} z={CORRIDOR.cz} />
      {people && <Walker path={[[-14.5, CORRIDOR.cz - 0.5], [14.5, CORRIDOR.cz - 0.5]]} color={ROLE_COLORS.staff} speed={1.1} phase={1} />}
      {people && <Walker path={[[0.2, -3.0], [0.2, CORRIDOR.cz + 0.6], [-13.8, CORRIDOR.cz + 0.6], [-13.8, -2.6]]} color={ROLE_COLORS.senior} speed={1.0} offset={9} phase={2} />}
      {people && <Walker path={[[5, -2.9], [5, CORRIDOR.cz + 0.4], [11.5, CORRIDOR.cz + 0.4], [11.5, -2.9]]} color={ROLE_COLORS.manager} speed={0.95} offset={21} phase={3} />}
      {people && signals.pendingApprovals > 0 && <Walker path={[[0.4, -5.0], [-6.3, -5.0], [-6.3, -6.4]]} color={ROLE_COLORS.courier} speed={1.2} offset={4} pauseAtEnds={3} phase={4} />}

      {/* reception: desk facing the corridor, the logo wall, a waiting corner */}
      <ReceptionDesk x={0} z={-1.3} r={Math.PI} />
      {people && <Person position={[0, 0, -0.5]} color={ROLE_COLORS.staff} rotation={0} seated phase={6} />}
      <Chair x={0} z={-0.5} r={0} m={mm.fabricNavy} />
      <LogoWall x={-0.6} z={3.1} r={Math.PI} w={2.6} h={1.3} />
      <Armchair x={-2.6} z={1.4} r={Math.PI / 2} person={signals.overdueCount > 0 && people ? ROLE_COLORS.visitor : undefined} phase={7} />
      <Armchair x={2.6} z={1.4} r={-Math.PI / 2} />
      <CoffeeTable x={-2.6} z={0.3} r={Math.PI / 2} w={0.8} d={0.5} />
      <Planter x={-2.6} z={-2.9} l={1.4} />
      <Planter x={2.6} z={-2.9} l={1.4} />
      <Plant x={3.0} z={2.6} />

      {/* directors' office (no label): a walnut desk, two visitor chairs, a sitting corner, a bookshelf */}
      <Desk x={0} z={8.4} r={0} top={mm.walnut} width={2.0} person={take(colors[0], 'office0')} phase={14} />
      <Chair x={-0.5} z={7.0} r={Math.PI + 0.2} m={mm.fabricSand} />
      <Chair x={0.5} z={7.0} r={Math.PI - 0.2} m={mm.fabricSand} />
      <Sofa x={-1.7} z={3.95} r={Math.PI} w={2.0} people={[take(colors[1], 'office1'), undefined]} />
      <CoffeeTable x={-1.7} z={5.05} w={1.1} d={0.55} />
      <Armchair x={-3.0} z={5.3} r={Math.PI / 2} m={mm.fabricBlue} />
      <Bookshelf x={3.2} z={6.6} r={-Math.PI / 2} w={2.2} h={2.0} fill={0.85} seed={11} />
      <Cabinet x={2.9} z={9.5} r={0} w={0.8} />
      <Plant x={-3.0} z={9.4} />

      {/* treasury: vault, counter with a status lamp, safes, the treasurer's desk */}
      <Vault x={-15.1} z={-8.2} r={Math.PI / 2} lit={signals.cashSignal === 'good'} />
      <Counter x={-12.2} z={-6.3} l={2.6} />
      <mesh position={[-11.2, 1.12, -6.3]}>
        <boxGeometry args={[0.12, 0.08, 0.12]} />
        <meshStandardMaterial color="#1a1a1a" emissive={signals.cashSignal === 'good' ? '#4cc26b' : signals.cashSignal === 'warn' ? '#f2b134' : '#e0433e'} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => <Safe key={i} x={-13.4 + i * 0.7} z={-9.6} r={0} />)}
      <Desk x={-12.4} z={-8.4} r={Math.PI} person={take(colors[1], 'bank')} phase={1} lamp={signals.unmatchedBank > 0 ? 'amber' : 'warm'} />
      <Cabinet x={-10.3} z={-9.6} r={0} />
      <Plant x={-10.1} z={-6.6} kind="bush" s={0.8} />

      {/* suppliers: mail counter on the corridor with amber trays, shelving, parcels, the purchasing desk */}
      <Counter x={-6.4} z={-6.3} l={3.2} />
      {[0, 1, 2, 3, 4, 5].map((i) => <Tray key={i} x={-7.7 + i * 0.52} z={-6.3} lit={i < signals.pendingApprovals} />)}
      <Bookshelf x={-8.8} z={-8.1} r={Math.PI / 2} w={1.8} h={2.0} fill={0.6} seed={3} />
      <Crate x={-4.2} z={-9.3} s={0.9} />
      <Crate x={-5.1} z={-9.3} s={0.8} r={0.2} />
      <Crate x={-4.6} z={-9.3} s={0.7} r={0.1} />
      <Desk x={-6.4} z={-8.6} r={Math.PI} person={take(colors[2], 'sup')} phase={5} />
      <Printer x={-3.7} z={-7.2} r={-Math.PI / 2} />

      {/* assets: equipment store with shelving, crates, the server rack and the depreciation chart */}
      <Bookshelf x={-2.3} z={-8.2} r={Math.PI / 2} w={2.6} h={2.0} fill={0.4} seed={5} />
      <ServerRack x={2.3} z={-9.2} r={0} />
      <Crate x={0.0} z={-9.3} />
      <Crate x={1.0} z={-9.3} s={0.8} />
      <Crate x={0.5} z={-9.3} s={0.6} />
      {[0, 1, 2, 3].map((i) => <Box key={i} p={[-0.8 + i * 0.5, 0.65 + (i % 2) * 0.05, -6.3]} s={[0.36, 0.025, 0.26]} m={mm.graphite} />)}
      <Box p={[-0.2, 0.3, -6.3]} s={[2.0, 0.6, 0.6]} m={mm.white} />
      <mesh position={[2.93, 1.6, -7.6]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.6, 1.0]} />
        <meshStandardMaterial map={chart} roughness={0.8} />
      </mesh>
      {take(colors[4], 'assets') && people && <Person position={[1.2, 0, -7.6]} color={colors[4]} rotation={-Math.PI / 2} phase={8} />}

      {/* tax and hr: offices with glass fronts */}
      <Desk x={6.25} z={-8.3} r={Math.PI} top={mm.walnut} width={1.8} person={take(colors[0], 'tax')} phase={12} />
      <Chair x={5.8} z={-7.0} r={0.2} m={mm.fabricSand} />
      <Chair x={6.7} z={-7.0} r={-0.2} m={mm.fabricSand} />
      <Bookshelf x={3.7} z={-8.6} r={Math.PI / 2} w={1.6} h={2.0} fill={0.9} seed={7} />
      <Cabinet x={8.7} z={-9.6} r={0} w={0.8} />
      <Plant x={8.9} z={-6.4} kind="bush" s={0.8} />
      <Desk x={11.9} z={-8.3} r={Math.PI} top={mm.walnut} width={1.8} person={take(colors[1], 'hr')} phase={13} />
      <Chair x={11.4} z={-7.0} r={0.2} m={mm.fabricSand} />
      <Chair x={12.3} z={-7.0} r={-0.2} m={mm.fabricSand} />
      <ConferenceTable x={14.6} z={-7.6} r={0} l={1.3} w={1.0} seats={4} top={mm.laminate} />
      <Cabinet x={15.5} z={-9.6} r={0} w={0.8} />
      <Plant x={10.1} z={-9.5} kind="bush" s={0.8} />

      {/* accounting: five pods of two desks facing each other, cabinets, the printer corner; drafts light the first lamp */}
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i}>
          <Desk x={-13.7} z={-1.4 + i * 2.3} r={Math.PI / 2} dual person={take(colors[(i + 2) % 5], `acc${i * 2}`)} phase={20 + i} lamp={i === 0 ? (signals.drafts > 0 ? 'amber' : 'warm') : undefined} />
          <Desk x={-11.7} z={-1.4 + i * 2.3} r={-Math.PI / 2} dual person={take(colors[(i + 3) % 5], `acc${i * 2 + 1}`)} phase={30 + i} />
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => <Cabinet key={i} x={-15.5} z={-1.8 + i * 1.0} r={Math.PI / 2} />)}
      <Box p={[-15.5, 1.12, -0.3]} s={[0.4, 0.02, 3.2]} m={mm.laminate} shadow={false} />
      <FolderStack x={-15.65} z={-1.6} count={signals.drafts * 2 + 2} m={mm.graphite} r={Math.PI / 2} />
      <Printer x={-9.5} z={9.4} r={Math.PI} />
      <Cabinet x={-14.5} z={9.6} r={0} w={1.2} />
      <Plant x={-9.1} z={-2.5} kind="bush" s={0.8} />
      <Plant x={-15.4} z={9.3} />

      {/* meeting room and boardroom with glass fronts (no label), screens and people in the running meeting */}
      <ConferenceTable x={-6} z={-0.85} r={0} l={2.6} w={1.0} seats={6} people={meetingOn ? [take(colors[1], 'meet0'), undefined, take(ROLE_COLORS.visitor, 'meet1')] : []} top={mm.laminate} />
      <WallScreen x={-8.4} z={-0.85} r={Math.PI / 2} w={1.4} />
      <ConferenceTable x={-6} z={5.8} r={Math.PI / 2} l={5.0} w={1.4} seats={12} people={signals.lateEngagements > 0 ? [take(colors[0], 'board0'), undefined, take(colors[2], 'board1'), undefined, undefined, take(colors[3], 'board2')] : []} />
      <WallScreen x={-6} z={1.5} r={0} w={2.0} />
      <Plant x={-8.0} z={9.4} />
      <Plant x={-4.0} z={9.4} kind="bush" s={0.8} />

      {/* clients and engagements: the archive rack along the east wall, account managers with the overdue folders, the client lounge */}
      <Box p={[9.93, 1.5, 1.2]} s={[0.1, 3.0, 4.2]} m={mm.fabricNavy} />
      <ArchiveRack rows={archives} floorY={y} />
      <Desk x={5.5} z={-1.4} r={Math.PI / 2} person={take(colors[1], 'cli0')} phase={40} folders={signals.overdueCount} folderMat={mm.red} />
      <Desk x={5.5} z={1.2} r={Math.PI / 2} person={take(colors[3], 'cli1')} phase={41} />
      <ConferenceTable x={6.8} z={5.2} r={0} l={1.6} w={1.6} seats={4} people={signals.overdueCount > 2 ? [take(colors[0], 'cli1'), take(ROLE_COLORS.visitor, 'cli1')] : []} top={mm.oak} />
      <Sofa x={5.5} z={9.2} r={0} w={2.0} m={mm.fabricSand} people={[undefined, people && signals.overdueCount > 0 ? ROLE_COLORS.visitor : undefined]} />
      <Armchair x={8.2} z={9.2} r={0} m={mm.fabricSand} />
      <CoffeeTable x={6.8} z={7.9} w={1.2} d={0.6} />
      <Cabinet x={4.2} z={-2.5} r={Math.PI / 2} w={1.0} />
      <Plant x={9.5} z={-2.5} />
      <Plant x={4.3} z={9.4} />
      {toArchive > 0 && <Crate x={8.6} z={-1.6} s={0.55} r={0.3} />}

      {/* engagements workroom: one desk per active engagement, the kanban wall, a stand-up table */}
      <mesh position={[13, 1.5, -3.02]} castShadow>
        <planeGeometry args={[3.6, 1.8]} />
        <meshStandardMaterial map={kanban} roughness={0.9} />
      </mesh>
      <Box p={[13, 1.5, -3.0]} s={[3.7, 1.9, 0.03]} m={mm.graphite} shadow={false} />
      {active.map((e, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const ratio = e.budgetHours ? e.actualHours / e.budgetHours : 0;
        const late = e.deadline < today;
        return <Desk key={e.id} x={col === 0 ? 11.7 : 14.3} z={-1.2 + row * 2.1} r={col === 0 ? Math.PI / 2 : -Math.PI / 2} ratio={ratio} tone={ratio > 1 ? 'over' : late ? 'late' : 'ok'} lamp={late ? 'amber' : undefined} person={take(colors[(i + 1) % 5], `mis${i}`)} phase={50 + i} width={1.4} />;
      })}
      <HighTable x={13} z={9.0} r={Math.PI} people={[take(colors[2], 'hi'), undefined]} />
      <Plant x={15.4} z={9.4} kind="bush" s={0.8} />

      {/* rooms the signed-in person cannot open stay in the dark */}
      {[...dark].map((k) => <DarkRoom key={k} rect={PLAN[k as PlanRoom]} />)}
    </group>
  );
}
