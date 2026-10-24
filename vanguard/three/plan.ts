// The building in metres. One floor plate is 32 × 20 m; z grows toward the entrance (south), x toward the east.
// Shared by the exterior, the interior plan, the archive rack, the camera presets and the label projection.

export const BUILDING = {
  w: 32, // x
  d: 20, // z
  floorH: 3.6, // slab to slab
  podiumH: 6.4, // double-height lobby
  slab: 0.42,
  podiumW: 42,
  podiumD: 28,
  penthouseInset: 3.2, // the top floor steps back on every side
};

export function floorY(index: number): number {
  // index 0 = lowest office floor, sitting on the podium
  return BUILDING.podiumH + index * BUILDING.floorH;
}

export interface Rect {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

// The eight module rooms plus four unlabeled spaces (meeting room, boardroom, reception, the directors' office).
export type PlanRoom = 'bank' | 'suppliers' | 'assets' | 'tax' | 'hr' | 'accounting' | 'meeting' | 'board' | 'reception' | 'office' | 'clients' | 'missions';
export const COMMON_ROOMS: PlanRoom[] = ['meeting', 'board', 'reception', 'office'];

// Every zone of the plate. No lift or stair core: the five north offices share the whole band; the corridor is z −5.5 … −3.1.
export const PLAN: Record<PlanRoom, Rect> = {
  bank: { cx: -12.75, cz: -7.75, w: 6.5, d: 4.5 },
  suppliers: { cx: -6.25, cz: -7.75, w: 6.5, d: 4.5 },
  assets: { cx: 0, cz: -7.75, w: 6, d: 4.5 },
  tax: { cx: 6.25, cz: -7.75, w: 6.5, d: 4.5 },
  hr: { cx: 12.75, cz: -7.75, w: 6.5, d: 4.5 },
  accounting: { cx: -12.25, cz: 3.45, w: 7.5, d: 13.1 },
  meeting: { cx: -6, cz: -0.85, w: 5, d: 4.5 },
  board: { cx: -6, cz: 5.7, w: 5, d: 8.6 },
  reception: { cx: 0, cz: 0.05, w: 7, d: 6.3 },
  office: { cx: 0, cz: 6.6, w: 7, d: 6.8 },
  clients: { cx: 6.75, cz: 3.45, w: 6.5, d: 13.1 },
  missions: { cx: 13, cz: 3.45, w: 6, d: 13.1 },
};

export const CORRIDOR = { z0: -5.5, z1: -3.1, cz: -4.3, d: 2.4 };
export const WALL = { h: 1.55, t: 0.12, glassH: 3.0 }; // partitions are section-cut at 1.55 m so the plan reads from above; glass stays full height
export const CLEAR_H = 3.2;

// The archive rack: against the east wall of the clients room, facing west. Bays run along z.
export const RACK_POS = { x: PLAN.clients.cx + PLAN.clients.w / 2 - 0.32, z: 1.2, facing: -1 as const };
export const RACK_DIM = { bayW: 1.2, depth: 0.5, h: 2.25, shelfT: 0.035, uprightT: 0.05, bottom: 0.12 };

// Camera presets (positions relative to the floor's y for interior ones).
export const CAM = {
  exterior: { pos: [62, 38, 86] as [number, number, number], target: [0, 17, 0] as [number, number, number] },
  floor: { pos: [5, 35, 26] as [number, number, number], target: [3.5, 0, 0.8] as [number, number, number] },
  roomOffset: [0.4, 9.5, 7.4] as [number, number, number],
  rack: { pos: [RACK_POS.x - 4.4, 2.1, RACK_POS.z + 0.2] as [number, number, number], target: [RACK_POS.x, 1.15, RACK_POS.z] as [number, number, number] },
};

export function roomRect(room: string): Rect | null {
  return (PLAN as Record<string, Rect>)[room] ?? null;
}
