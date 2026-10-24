import * as THREE from 'three';
import type { FloorSignals } from '@bumex/domain';

// Procedural textures: facade maps (albedo + lit-window emissive from occupancy data), floor and ground materials,
// labels and screens. Nothing is downloaded: every texture is drawn once on a canvas at start-up and cached.

const cache = new Map<string, THREE.CanvasTexture>();
const FONT = "'Aptos', 'Aptos Narrow', 'Segoe UI', system-ui, sans-serif";

export function texture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false, srgb = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, n: number, alpha: number, size = 2, dark = true) {
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (rand() * alpha).toFixed(3);
    ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    ctx.fillRect(rand() * w, rand() * h, size, size);
  }
}

export interface FacadeFloor {
  occupancy: number; // 0..1
  visible: boolean;
  isPenthouse: boolean;
}

export function floorsToFacade(floors: FloorSignals[]): FacadeFloor[] {
  return floors.map((f) => ({ occupancy: f.entity.staffTotal ? f.entity.staffPresent / f.entity.staffTotal : 0.5, visible: f.visible, isPenthouse: f.entity.isHolding }));
}

// Curtain wall: per floor a spandrel band and floor-to-ceiling glass bays. The emissive map lights the bays
// whose desks are occupied; unauthorised floors are blacked out. Floor 0 is at the bottom of the texture.
export function facadeMaps(face: string, floors: FacadeFloor[], cols: number, version: string): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const bay = 64;
  const floorPx = 128;
  const W = cols * bay;
  const H = floors.length * floorPx;
  const spandrel = 22;
  const seed = face.length * 31 + cols;
  const map = texture(`facade-map-${face}-${cols}-${version}`, W, H, (ctx) => {
    const rand = rng(seed);
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const y0 = (floors.length - 1 - i) * floorPx;
      // glass: a cool blue-gray that reads as reflective sky; a little variation per bay
      for (let c = 0; c < cols; c++) {
        const x0 = c * bay;
        const g = ctx.createLinearGradient(0, y0 + spandrel, 0, y0 + floorPx);
        const v = rand() * 14 - 7;
        g.addColorStop(0, `rgb(${74 + v},${106 + v},${146 + v})`);
        g.addColorStop(1, `rgb(${38 + v},${58 + v},${88 + v})`);
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0 + spandrel, bay, floorPx - spandrel);
        // transom rail at mid height and the mullion on the left of the bay
        ctx.fillStyle = 'rgba(30,36,48,.55)';
        ctx.fillRect(x0, y0 + spandrel + 60, bay, 2);
        ctx.fillStyle = 'rgba(24,28,38,.9)';
        ctx.fillRect(x0, y0 + spandrel, 3, floorPx - spandrel);
        if (!f.visible) {
          ctx.fillStyle = 'rgba(20,24,32,.6)';
          ctx.fillRect(x0 + 3, y0 + spandrel, bay - 3, floorPx - spandrel);
        }
      }
      // spandrel: champagne anodised band with a shadow line under it
      ctx.fillStyle = f.isPenthouse ? '#cfc6b4' : '#d9d3c7';
      ctx.fillRect(0, y0, W, spandrel);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(0, y0 + spandrel - 4, W, 4);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(0, y0, W, 2);
    }
  });
  const emissive = texture(`facade-emi-${face}-${cols}-${version}`, W, H, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    const rand = rng(seed + 7);
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const y0 = (floors.length - 1 - i) * floorPx;
      if (!f.visible) continue;
      for (let c = 0; c < cols; c++) {
        const x0 = c * bay;
        if (rand() < f.occupancy * 0.7) {
          const g = ctx.createLinearGradient(0, y0 + spandrel, 0, y0 + floorPx);
          g.addColorStop(0, f.isPenthouse ? 'rgba(214,226,246,.95)' : 'rgba(255,238,210,.9)');
          g.addColorStop(1, f.isPenthouse ? 'rgba(160,184,220,.6)' : 'rgba(255,214,160,.5)');
          ctx.fillStyle = g;
          ctx.fillRect(x0 + 4, y0 + spandrel + 2, bay - 6, floorPx - spandrel - 4);
          // a desk and a person silhouette
          ctx.fillStyle = 'rgba(40,30,20,.5)';
          ctx.fillRect(x0 + 12 + rand() * 20, y0 + floorPx - 52, 24, 5);
          ctx.beginPath();
          ctx.arc(x0 + 20 + rand() * 24, y0 + floorPx - 62, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  return { map, emissive };
}

export function stoneTexture(): THREE.CanvasTexture {
  return texture('stone', 512, 512, (ctx) => {
    ctx.fillStyle = '#d4cbbc';
    ctx.fillRect(0, 0, 512, 512);
    const rand = rng(21);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(120,100,80,${(0.03 + rand() * 0.08).toFixed(3)})`;
      const y = rand() * 512;
      ctx.fillRect(0, y, 512, 1 + rand() * 3);
    }
    noise(ctx, 512, 512, 22, 6000, 0.08, 2);
    noise(ctx, 512, 512, 23, 3000, 0.1, 2, false);
    // panel joints every 128 px
    ctx.fillStyle = 'rgba(60,50,40,.35)';
    for (let i = 0; i <= 512; i += 128) { ctx.fillRect(0, i, 512, 2); ctx.fillRect(i, 0, 2, 512); }
  }, true);
}

export function pavingTexture(): THREE.CanvasTexture {
  return texture('paving', 512, 512, (ctx) => {
    ctx.fillStyle = '#c9c4b8';
    ctx.fillRect(0, 0, 512, 512);
    const rand = rng(31);
    const n = 4; // 4 slabs per tile → 1 m slabs on a 4 m repeat
    const s = 512 / n;
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) {
        const v = rand() * 18 - 9;
        ctx.fillStyle = `rgb(${201 + v},${196 + v},${184 + v})`;
        ctx.fillRect(i * s + 2, k * s + 2, s - 4, s - 4);
      }
    noise(ctx, 512, 512, 32, 9000, 0.07, 2);
    ctx.fillStyle = 'rgba(70,65,58,.45)';
    for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 1, 0, 3, 512); ctx.fillRect(0, i * s - 1, 512, 3); }
  }, true);
}

export function lawnTexture(): THREE.CanvasTexture {
  return texture('lawn', 256, 256, (ctx) => {
    ctx.fillStyle = '#5f8a3f';
    ctx.fillRect(0, 0, 256, 256);
    const rand = rng(41);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(${40 + rand() * 60},${90 + rand() * 70},${30 + rand() * 30},${(0.2 + rand() * 0.5).toFixed(2)})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2, 3);
    }
  }, true);
}

export function asphaltTexture(): THREE.CanvasTexture {
  return texture('asphalt', 256, 256, (ctx) => {
    ctx.fillStyle = '#4a4b4f';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 51, 5000, 0.25, 2);
    noise(ctx, 256, 256, 52, 2500, 0.12, 2, false);
  }, true);
}

export function woodTexture(tone: 'oak' | 'walnut' | 'ash' = 'oak'): THREE.CanvasTexture {
  const base = tone === 'oak' ? [196, 160, 118] : tone === 'walnut' ? [96, 66, 46] : [214, 200, 180];
  return texture(`wood-${tone}`, 512, 512, (ctx) => {
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, 0, 512, 512);
    const rand = rng(tone === 'oak' ? 3 : tone === 'walnut' ? 4 : 5);
    const plank = 64;
    for (let p = 0; p < 512 / plank; p++) {
      const v = rand() * 24 - 12;
      ctx.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v},.9)`;
      ctx.fillRect(0, p * plank, 512, plank);
      for (let k = 0; k < 28; k++) {
        ctx.fillStyle = `rgba(${Math.max(0, base[0] - 60)},${Math.max(0, base[1] - 50)},${Math.max(0, base[2] - 40)},${(0.04 + rand() * 0.1).toFixed(3)})`;
        const y = p * plank + rand() * plank;
        ctx.fillRect(rand() * 200 - 100, y, 300 + rand() * 300, 1 + rand() * 2);
      }
      ctx.fillStyle = 'rgba(40,25,15,.5)';
      ctx.fillRect(0, p * plank, 512, 2);
      ctx.fillRect(rand() * 512, p * plank, 2, plank);
    }
  }, true);
}

export function carpetTexture(color: string, seed = 7): THREE.CanvasTexture {
  return texture(`carpet-${color}`, 256, 256, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, seed, 7000, 0.16, 2);
    noise(ctx, 256, 256, seed + 1, 3000, 0.08, 2, false);
    // carpet tiles 50 cm: 4 per tile at a 2 m repeat
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    for (let i = 0; i <= 256; i += 64) { ctx.fillRect(i, 0, 1, 256); ctx.fillRect(0, i, 256, 1); }
  }, true);
}

export function tileTexture(color = '#e6e2da', line = 'rgba(60,55,50,.35)', size = 128): THREE.CanvasTexture {
  return texture(`tile-${color}-${size}`, 512, 512, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 512);
    noise(ctx, 512, 512, 61, 7000, 0.05, 2);
    noise(ctx, 512, 512, 62, 3000, 0.08, 2, false);
    ctx.fillStyle = line;
    for (let i = 0; i <= 512; i += size) { ctx.fillRect(i - 1, 0, 2, 512); ctx.fillRect(0, i - 1, 512, 2); }
  }, true);
}

export function concreteTexture(): THREE.CanvasTexture {
  return texture('concrete', 256, 256, (ctx) => {
    ctx.fillStyle = '#b4b2ad';
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 71, 6000, 0.12, 2);
    noise(ctx, 256, 256, 72, 2000, 0.1, 3, false);
  }, true);
}

export function kraftTexture(): THREE.CanvasTexture {
  return texture('kraft', 128, 128, (ctx) => {
    ctx.fillStyle = '#b8955f';
    ctx.fillRect(0, 0, 128, 128);
    noise(ctx, 128, 128, 81, 1500, 0.12, 2);
    noise(ctx, 128, 128, 82, 800, 0.1, 2, false);
  }, true);
}

// The label on the spine of an archive box: reference, year and a short client name.
export function boxLabelTexture(ref: string, line2: string, line3: string, kind: 'box' | 'binder'): THREE.CanvasTexture {
  return texture(`label-${kind}-${ref}-${line2}-${line3}`, 256, 192, (ctx) => {
    ctx.fillStyle = kind === 'box' ? '#b8955f' : '#2b3f66';
    ctx.fillRect(0, 0, 256, 192);
    if (kind === 'box') noise(ctx, 256, 192, 83, 2000, 0.1, 2);
    // the paper label
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(28, 38, 200, 116);
    ctx.fillStyle = kind === 'box' ? '#2b3f66' : '#d9a13e';
    ctx.fillRect(28, 38, 200, 10);
    ctx.fillStyle = '#1c2231';
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(ref, 128, 84);
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = '#3b4252';
    ctx.fillText(line2.slice(0, 18), 128, 112);
    ctx.font = `400 18px ${FONT}`;
    ctx.fillStyle = '#6a7382';
    ctx.fillText(line3.slice(0, 20), 128, 138);
  });
}

export function bayLabelTexture(text: string, sub: string): THREE.CanvasTexture {
  return texture(`bay-${text}-${sub}`, 256, 96, (ctx) => {
    ctx.fillStyle = '#2b3f66';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#f7f5ef';
    ctx.font = `700 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 46);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillStyle = '#a9bddc';
    ctx.fillText(sub, 128, 78);
  });
}

// The small entrance sign: the three-bird mark and the name, on navy, lit at night.
export function signTexture(text: string): THREE.CanvasTexture {
  return texture(`sign-${text}`, 1024, 272, (ctx) => {
    ctx.fillStyle = '#1d2c49';
    ctx.fillRect(0, 0, 1024, 272);
    const bird = (x: number, y: number, s: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = 10 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 42 * s, y + 10 * s); ctx.quadraticCurveTo(x - 14 * s, y - 24 * s, x, y); ctx.quadraticCurveTo(x + 14 * s, y - 24 * s, x + 42 * s, y + 10 * s); ctx.stroke(); };
    bird(200, 150, 1.4, '#f7f5ef');
    bird(262, 98, 0.8, '#d9a13e');
    bird(150, 86, 0.7, '#cdbfa6');
    ctx.fillStyle = '#f7f5ef';
    ctx.font = `700 120px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 340, 136);
    ctx.fillStyle = '#d9a13e';
    ctx.fillRect(340, 206, 560, 4);
  });
}

export function logoWallTexture(name: string, sub: string): THREE.CanvasTexture {
  return texture(`logowall-${name}-${sub}`, 1024, 512, (ctx) => {
    ctx.fillStyle = '#2b3f66';
    ctx.fillRect(0, 0, 1024, 512);
    // the wreath suggested by two arcs and the three birds as simple chevrons
    ctx.strokeStyle = 'rgba(169,189,220,.55)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(512, 230, 150, Math.PI * 0.75, Math.PI * 1.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 230, 150, Math.PI * 1.55, Math.PI * 2.25); ctx.stroke();
    const bird = (x: number, y: number, s: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = 10 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 42 * s, y + 10 * s); ctx.quadraticCurveTo(x - 14 * s, y - 24 * s, x, y); ctx.quadraticCurveTo(x + 14 * s, y - 24 * s, x + 42 * s, y + 10 * s); ctx.stroke(); };
    bird(512, 150, 1.5, '#f7f5ef');
    bird(585, 90, 0.9, '#d9a13e');
    bird(455, 70, 0.8, '#cdbfa6');
    ctx.fillStyle = '#f7f5ef';
    ctx.font = `700 92px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(name, 512, 372);
    ctx.font = `500 34px ${FONT}`;
    ctx.fillStyle = '#a9bddc';
    ctx.letterSpacing = '12px';
    ctx.fillText(sub, 512, 430);
  });
}

// A monitor: a soft light desktop with a progress bar for the engagement desks; plain for the others.
export function monitorTexture(ratio: number | null, tone: 'ok' | 'late' | 'over' = 'ok'): THREE.CanvasTexture {
  const r = ratio === null ? -1 : Math.round(Math.min(1.1, Math.max(0, ratio)) * 20) / 20;
  return texture(`monitor-${r}-${tone}`, 256, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 160);
    g.addColorStop(0, '#eef1f6');
    g.addColorStop(1, '#cfd8e6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#2b3f66';
    ctx.fillRect(0, 0, 256, 18);
    ctx.fillStyle = 'rgba(43,63,102,.18)';
    for (let i = 0; i < 6; i++) ctx.fillRect(16, 32 + i * 18, 60 + ((i * 53) % 120), 6);
    if (r >= 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, 118, 224, 22);
      ctx.fillStyle = tone === 'over' ? '#b4232c' : tone === 'late' ? '#d9a13e' : '#2b3f66';
      ctx.fillRect(16, 118, 224 * Math.min(1, r), 22);
      ctx.fillStyle = '#1c2231';
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(r * 100)} %`, 240, 108);
    }
  });
}

export function kanbanTexture(counts: number[]): THREE.CanvasTexture {
  const key = `kanban-${counts.join('-')}`;
  return texture(key, 1024, 512, (ctx) => {
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(0, 0, 1024, 512);
    const names = ['Planification', 'Terrain', 'Revue', 'Rapport', 'Facturation'];
    const colW = 1024 / 5;
    ctx.font = `600 30px ${FONT}`;
    names.forEach((n, i) => {
      ctx.fillStyle = '#2b3f66';
      ctx.fillRect(i * colW + 12, 18, colW - 24, 6);
      ctx.fillStyle = '#1c2231';
      ctx.fillText(n, i * colW + 16, 64);
      ctx.fillStyle = 'rgba(43,63,102,.12)';
      ctx.fillRect(i * colW, 0, 1, 512);
      for (let k = 0; k < Math.min(counts[i] ?? 0, 7); k++) {
        ctx.fillStyle = ['#f3d78f', '#a9bddc', '#cdbfa6', '#bfd9c2', '#f6c8a8'][(i + k) % 5];
        ctx.fillRect(i * colW + 16, 90 + k * 56, colW - 32, 42);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(i * colW + 28, 104 + k * 56, colW - 80, 5);
        ctx.fillRect(i * colW + 28, 116 + k * 56, colW - 120, 5);
      }
    });
  });
}

export function chartTexture(title: string, ratio: number, unit: string): THREE.CanvasTexture {
  const r = Math.round(ratio * 50) / 50;
  return texture(`chart-${title}-${r}`, 512, 320, (ctx) => {
    ctx.fillStyle = '#f7f5ef';
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = '#1c2231';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(title, 24, 52);
    ctx.fillStyle = '#e8eaee';
    ctx.fillRect(24, 110, 464, 60);
    ctx.fillStyle = '#2b3f66';
    ctx.fillRect(24, 110, 464 * Math.min(1, r), 60);
    ctx.fillStyle = '#6a7382';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(`${Math.round(r * 100)} % ${unit}`, 24, 220);
  });
}

// Distant buildings: a pale wall with a window band per floor (3.6 m per repeat).
export function contextTexture(tone: number): THREE.CanvasTexture {
  return texture(`context-${tone}`, 256, 256, (ctx) => {
    ctx.fillStyle = tone ? '#cdc5b6' : '#bdb9b2';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(40,52,70,.55)';
    ctx.fillRect(0, 60, 256, 120);
    ctx.fillStyle = tone ? '#cdc5b6' : '#bdb9b2';
    for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 60, 10, 120);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(0, 180, 256, 6);
  }, true);
}

export function brushedTexture(): THREE.CanvasTexture {
  return texture('brushed', 256, 256, (ctx) => {
    ctx.fillStyle = '#b9b9bd';
    ctx.fillRect(0, 0, 256, 256);
    const rand = rng(91);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${(rand() * 0.08).toFixed(3)})`;
      ctx.fillRect(0, rand() * 256, 256, 1);
    }
  }, true);
}

// Live label anchors: the 3D side registers WORLD positions (and whether the label may show); the DOM overlay projects
// them with the current camera on its own animation frame, so labels follow the camera even when 3D frames are slow.
export interface LabelAnchor { wx: number; wy: number; wz: number; visible: boolean }
export const labelRegistry = new Map<string, LabelAnchor>();
export const labelCamera: { camera: THREE.Camera | null; width: number; height: number } = { camera: null, width: 1, height: 1 };
