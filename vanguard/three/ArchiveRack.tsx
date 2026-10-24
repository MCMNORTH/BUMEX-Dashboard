import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ArchiveRow } from '@bumex/domain';
import { RACK } from '@bumex/domain';
import { useStore } from '../store';
import { M, Box } from './Furniture';
import { RACK_POS, RACK_DIM } from './plan';
import { boxLabelTexture, labelRegistry } from './textures';

// The archive rack of the clients room: steel shelving, three bays of five shelves, four slots per shelf.
// Every box or binder set is one ArchiveRecord. Hover lifts a highlight, click selects it and opens the panel.

const PITCH = (RACK_DIM.h - RACK_DIM.bottom - 0.05) / RACK.shelves;
const SLOT_PITCH = 0.285;

export function slotPosition(bay: number, shelf: number, slot: number): { y: number; z: number } {
  const z0 = RACK_POS.z - (RACK.bays * RACK_DIM.bayW) / 2 + (bay - 1) * RACK_DIM.bayW;
  const boardFromBottom = RACK.shelves - shelf;
  return { y: RACK_DIM.bottom + boardFromBottom * PITCH + RACK_DIM.shelfT / 2, z: z0 + 0.03 + SLOT_PITCH / 2 + (slot - 1) * SLOT_PITCH };
}

function ArchiveBox({ row, selected, hovered }: { row: ArchiveRow; selected: boolean; hovered: boolean }) {
  const { record, customer, year } = row;
  const setUi = useStore((s) => s.setUi);
  const openArchive = useStore((s) => s.openArchive);
  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const { y, z } = slotPosition(record.bay, record.shelf, record.slot);
  const label = useMemo(() => boxLabelTexture(record.reference, customer?.name ?? '', `${year} · ${record.kind === 'box' ? `${record.boxCount} bte` : 'classeur'}`, record.kind), [record.reference, customer?.name, year, record.kind, record.boxCount]);
  const retrieved = record.status === 'retrieved';
  useFrame((_, dt) => {
    if (group.current) {
      const pull = selected ? -0.1 : hovered ? -0.04 : 0;
      group.current.position.x += (RACK_POS.x + pull - group.current.position.x) * Math.min(1, dt * 10);
    }
    if (mat.current) {
      const target = selected ? 0.55 : hovered ? 0.3 : 0;
      mat.current.emissiveIntensity += (target - mat.current.emissiveIntensity) * Math.min(1, dt * 12);
    }
  });
  const depth = record.kind === 'box' ? 0.36 : 0.29;
  const h = record.kind === 'box' ? 0.27 : 0.32;
  const w = record.kind === 'box' ? 0.26 : 0.255;
  const handlers = {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); setUi({ hoverArchiveId: record.id }); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setUi({ hoverArchiveId: null }); document.body.style.cursor = ''; },
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); document.body.style.cursor = ''; openArchive(record.id, true); },
  };
  if (retrieved) {
    // the slot is empty: a card in a stand says the box is out
    return (
      <group position={[RACK_POS.x, y, z]} {...handlers}>
        <mesh position={[-0.1, 0.09, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.16, 0.12]} />
          <meshStandardMaterial ref={mat} color="#f7f5ef" emissive="#d9a13e" emissiveIntensity={0} side={THREE.DoubleSide} />
        </mesh>
        <Box p={[-0.1, 0.012, 0]} s={[0.06, 0.024, 0.12]} m={M().chrome} shadow={false} />
        <mesh position={[0, 0.14, 0]} visible={false}>
          <boxGeometry args={[depth, 0.28, w]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    );
  }
  return (
    <group ref={group} position={[RACK_POS.x, y, z]} {...handlers}>
      {record.kind === 'box' ? (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[depth, h, w]} />
          <meshStandardMaterial ref={mat} color={record.status === 'pending_destruction' ? '#a88a62' : '#b8955f'} emissive="#6b8dc1" emissiveIntensity={0} roughness={0.95} />
        </mesh>
      ) : (
        <>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, h / 2, -w / 2 + 0.04 + i * 0.085]} castShadow receiveShadow>
              <boxGeometry args={[depth, h, 0.075]} />
              <meshStandardMaterial ref={i === 0 ? mat : undefined} color={['#2b3f66', '#3b5a8f', '#2b3f66'][i]} emissive="#6b8dc1" emissiveIntensity={0} roughness={0.7} />
            </mesh>
          ))}
        </>
      )}
      <mesh position={[-depth / 2 - 0.002, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[w - 0.02, h - 0.04]} />
        <meshStandardMaterial map={label} roughness={0.9} />
      </mesh>
      {selected && (
        <mesh position={[-depth / 2 - 0.01, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <ringGeometry args={[0.1, 0.115, 32]} />
          <meshBasicMaterial color="#d9a13e" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

export function ArchiveRack({ rows, floorY }: { rows: ArchiveRow[]; floorY: number }) {
  const mm = M();
  const archiveId = useStore((s) => s.ui.archiveId);
  const hoverId = useStore((s) => s.ui.hoverArchiveId);
  const rackFocus = useStore((s) => s.ui.rackFocus);
  const len = RACK.bays * RACK_DIM.bayW;
  const z0 = RACK_POS.z - len / 2;
  const selected = rows.find((r) => r.record.id === archiveId);
  useEffect(() => {
    if (!selected) { labelRegistry.set('arc:selected', { wx: 0, wy: 0, wz: 0, visible: false }); return; }
    const p = slotPosition(selected.record.bay, selected.record.shelf, selected.record.slot);
    labelRegistry.set('arc:selected', { wx: RACK_POS.x - 0.3, wy: floorY + p.y + 0.32, wz: p.z, visible: rackFocus });
  }, [selected, floorY, rackFocus]);
  return (
    <group>
      {/* uprights, back ties and shelf boards */}
      {Array.from({ length: RACK.bays + 1 }).map((_, i) => (
        <group key={i}>
          <Box p={[RACK_POS.x - RACK_DIM.depth / 2 + 0.03, RACK_DIM.h / 2, z0 + i * RACK_DIM.bayW]} s={[RACK_DIM.uprightT, RACK_DIM.h, RACK_DIM.uprightT]} m={mm.darkSteel} />
          <Box p={[RACK_POS.x + RACK_DIM.depth / 2 - 0.03, RACK_DIM.h / 2, z0 + i * RACK_DIM.bayW]} s={[RACK_DIM.uprightT, RACK_DIM.h, RACK_DIM.uprightT]} m={mm.darkSteel} />
          <Box p={[RACK_POS.x, RACK_DIM.h - 0.04, z0 + i * RACK_DIM.bayW]} s={[RACK_DIM.depth - 0.06, 0.04, 0.04]} m={mm.darkSteel} shadow={false} />
        </group>
      ))}
      {Array.from({ length: RACK.shelves + 1 }).map((_, b) => (
        <Box key={b} p={[RACK_POS.x, RACK_DIM.bottom + b * PITCH, RACK_POS.z]} s={[RACK_DIM.depth, RACK_DIM.shelfT, len]} m={mm.steel} />
      ))}
      <Box p={[RACK_POS.x + RACK_DIM.depth / 2 - 0.01, RACK_DIM.h / 2, RACK_POS.z]} s={[0.02, RACK_DIM.h, len]} m={mm.graphite} />
      {rows.map((r) => (
        <ArchiveBox key={r.record.id} row={r} selected={r.record.id === archiveId} hovered={r.record.id === hoverId} />
      ))}
    </group>
  );
}
