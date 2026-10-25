import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ContactShadows } from '@react-three/drei';
import { Sky, skyMaterial } from './Sky';
import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing';
import { allFloors, floorSignals, rackLayout, headcount, vatStatement, canOpenRoom, fmt } from '@bumex/domain';
import { useStore } from '../store';
import type { Room } from '../i18n';
import { Building } from './Building';
import { OfficeFloor } from './Floor';
import { labelRegistry, labelCamera } from './textures';
import { BUILDING, CAM, COMMON_ROOMS, floorY, roomRect } from './plan';
import emblemImage from '../assets/emblem.png'; // [bumex-one] Next imports images as objects
import { useVanguardFrame } from '@/components/vanguard/frame'; // [bumex-one]
const emblem = emblemImage.src;

// Night. Environment map rendered from the procedural sky, so glass and metal reflect a dark sky and the ground glow.
function SkyEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial(0));
    envScene.add(dome);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: '#1a1c20' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    const env = pmrem.fromScene(envScene, 0.02, 0.1, 5000).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

// Artificial light only. Outside: a cool, low ambient so the plaza lamps and the lit windows carry the scene.
// Inside a floor: white, even, strong light from above (ceiling luminaires) with no hard shadows.
function Lighting({ inside, fy }: { inside: boolean; fy: number }) {
  if (inside) {
    return (
      <group>
        <hemisphereLight args={['#ffffff', '#d6d7dc', 1.5]} />
        <ambientLight intensity={0.6} color="#ffffff" />
        <directionalLight position={[6, fy + 40, 10]} intensity={2.0} color="#ffffff" />
      </group>
    );
  }
  return (
    <group>
      <hemisphereLight args={['#2c3c5e', '#0d1016', 0.55]} />
      <ambientLight intensity={0.16} color="#9fb2d6" />
      <directionalLight position={[40, 90, 60]} intensity={0.3} color="#aab8d8" />
    </group>
  );
}

type Pose = { pos: THREE.Vector3; target: THREE.Vector3 };
type Ctx = 'exterior' | 'floor' | 'room' | 'rack';
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// One camera for the whole building: presets for the exterior, a floor, a room and the archive rack, tweened
// cinematically, then orbit controls with limits that fit the context so the user never ends up inside a wall.
function CameraRig({ n }: { n: number }) {
  const { camera, gl } = useThree();
  const controls = useRef<OrbitControls>(undefined); // [bumex-one] React 19: useRef takes its initial value
  const view = useStore((s) => s.ui.view);
  const entityId = useStore((s) => s.ui.entityId);
  const focusRoom = useStore((s) => s.ui.focusRoom);
  const rackFocus = useStore((s) => s.ui.rackFocus);
  const transition = useStore((s) => s.ui.transition);
  const setUi = useStore((s) => s.setUi);
  const floorOrder = useStore((s) => s.state.entities.find((e) => e.id === s.ui.entityId)?.floorOrder ?? 0);
  const tween = useRef<{ from: Pose; to: Pose; t: number; dur: number; ctx: Ctx } | null>(null);
  const ctxRef = useRef<Ctx>('exterior');
  const lastInteraction = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.09;
    c.screenSpacePanning = false;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.9;
    const onStart = () => { lastInteraction.current = performance.now(); };
    c.addEventListener('start', onStart);
    controls.current = c;
    return () => { c.removeEventListener('start', onStart); c.dispose(); };
  }, [camera, gl]);

  const goal = useMemo((): { pose: Pose; ctx: Ctx } => {
    const idx = n - 1 - floorOrder;
    const fy = floorY(idx);
    if (view !== 'floor') {
      // keep the current azimuth so returning to the exterior does not snap around the building
      const cur = camera.position.clone().sub(new THREE.Vector3(...CAM.exterior.target));
      const az = started.current ? Math.atan2(cur.x, cur.z) : Math.atan2(CAM.exterior.pos[0], CAM.exterior.pos[2]);
      const radius = 118;
      return { pose: { pos: new THREE.Vector3(Math.sin(az) * radius, CAM.exterior.pos[1], Math.cos(az) * radius), target: new THREE.Vector3(...CAM.exterior.target) }, ctx: 'exterior' };
    }
    if (rackFocus) return { pose: { pos: new THREE.Vector3(CAM.rack.pos[0], fy + CAM.rack.pos[1], CAM.rack.pos[2]), target: new THREE.Vector3(CAM.rack.target[0], fy + CAM.rack.target[1], CAM.rack.target[2]) }, ctx: 'rack' };
    const rect = focusRoom ? roomRect(focusRoom) : null;
    if (rect) {
      const f = Math.min(1.9, Math.max(0.95, Math.max(rect.w, rect.d) / 7.5));
      return { pose: { pos: new THREE.Vector3(rect.cx + CAM.roomOffset[0] * f, fy + CAM.roomOffset[1] * f, rect.cz + CAM.roomOffset[2] * f), target: new THREE.Vector3(rect.cx, fy + 0.7, rect.cz) }, ctx: 'room' };
    }
    return { pose: { pos: new THREE.Vector3(CAM.floor.pos[0], fy + CAM.floor.pos[1], CAM.floor.pos[2]), target: new THREE.Vector3(CAM.floor.target[0], fy + CAM.floor.target[1], CAM.floor.target[2]) }, ctx: 'floor' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, entityId, focusRoom, rackFocus, floorOrder, n]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (!started.current) {
      started.current = true;
      camera.position.copy(goal.pose.pos);
      c.target.copy(goal.pose.target);
      camera.lookAt(c.target);
      applyLimits(c, goal.ctx);
      ctxRef.current = goal.ctx;
      c.update();
      return;
    }
    const sameCtx = ctxRef.current === goal.ctx;
    tween.current = { from: { pos: camera.position.clone(), target: c.target.clone() }, to: goal.pose, t: 0, dur: goal.ctx === 'exterior' || ctxRef.current === 'exterior' ? 1.5 : sameCtx && goal.ctx === 'room' ? 0.8 : 1.1, ctx: goal.ctx };
    c.enabled = false;
    setUi({ cameraBusy: true });
  }, [goal, camera, setUi]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const tw = tween.current;
    if (tw) {
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.dur));
      // lift the path a little so the camera arcs over the plate instead of cutting through furniture
      const lift = Math.sin(Math.PI * Math.min(1, tw.t / tw.dur)) * (tw.ctx === 'exterior' || ctxRef.current === 'exterior' ? 14 : 2.5);
      camera.position.lerpVectors(tw.from.pos, tw.to.pos, k);
      camera.position.y += lift;
      c.target.lerpVectors(tw.from.target, tw.to.target, k);
      camera.lookAt(c.target);
      if (tw.t >= tw.dur) {
        camera.position.copy(tw.to.pos);
        c.target.copy(tw.to.target);
        applyLimits(c, tw.ctx);
        ctxRef.current = tw.ctx;
        c.enabled = true;
        tween.current = null;
        setUi({ cameraBusy: false, transition: 'none' });
      }
      return;
    }
    // keep the target on the plate when panning inside, and idle-orbit outside
    if (ctxRef.current === 'floor' || ctxRef.current === 'room') {
      const fy = floorY(n - 1 - floorOrder);
      c.target.x = THREE.MathUtils.clamp(c.target.x, -BUILDING.w / 2, BUILDING.w / 2);
      c.target.z = THREE.MathUtils.clamp(c.target.z, -BUILDING.d / 2, BUILDING.d / 2);
      c.target.y = THREE.MathUtils.clamp(c.target.y, fy, fy + 2.2);
      if (camera.position.y < fy + 1.2) camera.position.y = fy + 1.2;
    }
    if (ctxRef.current === 'exterior') {
      c.autoRotate = performance.now() - lastInteraction.current > 6000;
      if (camera.position.y < 3) camera.position.y = 3;
    } else c.autoRotate = false;
    c.update();
  });
  return null;
}

// Outside, the building can be orbited. Inside, the plan is a fixed view: zoom and pan only, no rotation, so the
// floor never turns under the user; a room is entered by clicking it and left with the "floor view" button or Escape.
function applyLimits(c: OrbitControls, ctx: Ctx) {
  c.minAzimuthAngle = -Infinity;
  c.maxAzimuthAngle = Infinity;
  c.autoRotateSpeed = 0.35;
  c.enableRotate = ctx === 'exterior';
  if (ctx === 'exterior') {
    c.minDistance = 55; c.maxDistance = 260; c.minPolarAngle = 0.2; c.maxPolarAngle = 1.5; c.enablePan = false;
  } else if (ctx === 'floor') {
    c.minDistance = 9; c.maxDistance = 75; c.enablePan = true;
  } else if (ctx === 'room') {
    c.minDistance = 3.5; c.maxDistance = 40; c.enablePan = true;
  } else {
    c.minDistance = 1.4; c.maxDistance = 8; c.enablePan = true;
  }
}

// Drops the expensive effects when the device cannot keep up: first the ambient occlusion, then the soft shadows.
function AdaptiveQuality() {
  const quality = useStore((s) => s.ui.quality);
  const setQuality = useStore((s) => s.setQuality);
  const toast = useStore((s) => s.toast);
  const acc = useRef({ t: 0, n: 0, slow: 0, since: 0 });
  useFrame((state, dt) => {
    const a = acc.current;
    if (state.clock.elapsedTime < 4) return; // let the scene settle
    a.t += dt;
    a.n += 1;
    if (a.t < 2) return;
    const avg = a.t / a.n;
    a.t = 0; a.n = 0;
    if (avg > 0.07) a.slow += 1; else a.slow = 0;
    if (a.slow >= 2) {
      a.slow = 0;
      if (quality.ao) { setQuality({ ao: false }); toast('info', 'Qualité 3D réduite : occlusion ambiante désactivée'); }
      else if (quality.shadows) { setQuality({ shadows: false }); toast('info', 'Qualité 3D réduite : ombres douces désactivées'); }
    }
  });
  return null;
}

// Hands the live camera and viewport to the DOM overlay, which projects the label anchors on its own frames.
function LabelCameraBridge() {
  const { camera, size } = useThree();
  useEffect(() => { labelCamera.camera = camera; labelCamera.width = size.width; labelCamera.height = size.height; }, [camera, size]);
  useFrame(() => { labelCamera.camera = camera; });
  return null;
}

function SceneContent() {
  const state = useStore((s) => s.state);
  const view = useStore((s) => s.ui.view);
  const entityId = useStore((s) => s.ui.entityId);
  const quality = useStore((s) => s.ui.quality);
  const setUi = useStore((s) => s.setUi);
  const floors = useMemo(() => allFloors(state), [state]);
  const n = floors.length;
  const entity = state.entities.find((e) => e.id === entityId);
  const inside = view === 'floor' && !!entity;
  const idx = entity ? n - 1 - entity.floorOrder : 0;
  const fy = floorY(idx);
  const signals = useMemo(() => (entityId ? floorSignals(state, entityId) : null), [state, entityId]);
  const engagements = useMemo(() => state.engagements.filter((e) => e.entityId === entityId), [state, entityId]);
  const assets = useMemo(() => state.assets.filter((a) => a.entityId === entityId), [state, entityId]);
  const tasks = useMemo(() => state.tasks.filter((t) => t.entityId === entityId), [state, entityId]);
  const archives = useMemo(() => (entityId ? rackLayout(state, entityId).items : []), [state, entityId]);
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog('#070b14', 260, 900);
    return () => { scene.fog = null; };
  }, [scene]);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); setUi({ view: 'flat', sceneError: 'WebGL context lost' }); };
    el.addEventListener('webglcontextlost', lost);
    return () => el.removeEventListener('webglcontextlost', lost);
  }, [gl, setUi]);
  return (
    <>
      <Sky />
      <SkyEnvironment />
      <Lighting inside={inside} fy={fy} />
      <Building floors={floors} insideIndex={inside ? idx : null} />
      {inside && signals && (
        <OfficeFloor y={fy} signals={signals} engagements={engagements} assets={assets} archives={archives} tasks={tasks} today={state.today} people={quality.people} />
      )}
      {quality.shadows && (inside ? (
        <ContactShadows key={`in-${entityId}`} position={[0, fy + 0.015, 0]} width={BUILDING.w + 1} height={BUILDING.d + 1} far={2.6} blur={2.2} opacity={0.28} resolution={1024} frames={quality.people ? Infinity : 1} color="#1a2238" />
      ) : (
        <ContactShadows key="out" position={[0, 0.03, 4]} width={120} height={90} far={12} blur={2.6} opacity={0.3} resolution={1024} frames={1} color="#05070c" />
      ))}
      <CameraRig n={n} />
      <LabelCameraBridge />
      <AdaptiveQuality />
      {quality.ao && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={inside ? 1.0 : 6} distanceFalloff={inside ? 0.6 : 2} intensity={inside ? 1.9 : 1.4} quality="low" halfRes depthAwareUpsampling />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}

// DOM overlay: labels and the hotspot popover, positioned from the registry each frame without React re-renders.
function LabelOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  const view = useStore((s) => s.ui.view);
  const state = useStore((s) => s.state);
  const entityId = useStore((s) => s.ui.entityId);
  const t = useStore((s) => s.t);
  const hoverRoom = useStore((s) => s.ui.hoverRoom);
  const focusRoom = useStore((s) => s.ui.focusRoom);
  const room = useStore((s) => s.ui.room);
  const rackFocus = useStore((s) => s.ui.rackFocus);
  const archiveId = useStore((s) => s.ui.archiveId);
  const openRoom = useStore((s) => s.openRoom);
  const focus = useStore((s) => s.focusRoom);
  const signals = useMemo(() => (entityId ? floorSignals(state, entityId) : null), [state, entityId]);
  const hc = useMemo(() => (entityId ? headcount(state, entityId) : null), [state, entityId]);
  const vat = useMemo(() => (entityId ? vatStatement(state, entityId, state.today.slice(0, 4) + '-01-01', state.today) : null), [state, entityId]);
  useEffect(() => {
    let raf = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      const root = ref.current;
      const cam = labelCamera.camera;
      if (root && cam) {
        // project with the camera as it is now, not as it was at the last render (slow devices render late)
        cam.updateMatrixWorld();
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        for (const el of Array.from(root.children) as HTMLElement[]) {
          const a = labelRegistry.get(el.dataset.key ?? '');
          if (!a || !a.visible) { el.style.display = 'none'; continue; }
          v.set(a.wx, a.wy, a.wz).project(cam);
          if (v.z >= 1) { el.style.display = 'none'; continue; }
          el.style.display = '';
          let left = ((v.x + 1) / 2) * labelCamera.width;
          let top = ((1 - v.y) / 2) * labelCamera.height;
          if (el.classList.contains('popover')) {
            // the bar sits above its room but never leaves the viewport (the box is drawn above and centred on the anchor)
            const w = el.offsetWidth, h = el.offsetHeight;
            left = Math.min(Math.max(left, w / 2 + 12), labelCamera.width - w / 2 - 12);
            top = Math.min(Math.max(top, h + 14 + 12), labelCamera.height - 12);
          }
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const subs: Record<string, string> = signals
    ? {
        bank: `${fmt(signals.cash, 0)} ${signals.entity.functionalCurrency}`,
        accounting: `${signals.drafts} ${t('draft').toLowerCase()} · ${signals.unmatchedBank} ${t('unmatched')}`,
        clients: `${signals.overdueCount} ${t('invoices_n')} ${t('overdue').toLowerCase()} · ${state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').length} ${t('arc_boxes')}`,
        suppliers: `${signals.pendingApprovals} à approuver`,
        missions: `${signals.engagements} ${t('bar_ongoing')} · ${signals.lateEngagements} ${t('late_eng').toLowerCase()}`,
        assets: `${state.assets.filter((a) => a.entityId === entityId && a.status !== 'disposed').length} biens`,
        hr: `${hc?.active ?? 0} collaborateurs`,
        tax: `TVA nette ${fmt(vat?.net ?? 0, 0)}`,
      }
    : {};
  const roomName = (r: string) => t(`room_${r}`);
  const moduleRooms = ['bank', 'accounting', 'clients', 'suppliers', 'missions', 'assets', 'hr', 'tax'];
  const common: string[] = COMMON_ROOMS;
  const archive = archiveId ? state.archives.find((a) => a.id === archiveId) : null;
  const popRoom = focusRoom && !room && !rackFocus ? focusRoom : null;
  const popIsModule = popRoom ? moduleRooms.includes(popRoom) : false;
  return (
    <div className="labels" ref={ref}>
      {view === 'tower'
        ? state.entities.map((e) => (
            <div key={e.id} className="label3d" data-key={`floor:${e.id}`} style={{ display: 'none' }}>
              <b>{e.name}</b> · {e.activity} — {t('enter')}
            </div>
          ))
        : (
          <>
            {/* names appear on hover only; the plan stays clean. Clicking the room (or its name) zooms on it. */}
            {moduleRooms.map((r) => {
              const allowed = entityId ? canOpenRoom(state, entityId, r) : true;
              const shown = hoverRoom === r && !rackFocus && focusRoom !== r;
              return (
                <div key={r} className={`label3d room ${allowed ? '' : 'off'}`} data-key={`room:${r}`} style={{ display: 'none', visibility: shown ? 'visible' : 'hidden', opacity: allowed ? 1 : 0.6, pointerEvents: 'none' }}>
                  {roomName(r)}
                  <div className="sub">{allowed ? subs[r] : t('room_off')}</div>
                </div>
              );
            })}
            {archive && (
              <div className="label3d pin" data-key="arc:selected" style={{ display: 'none' }}>
                {archive.reference}
              </div>
            )}
            {popRoom && signals && (
              <div className={`popover ${popIsModule ? 'compact' : 'quiet'}`} data-key={`roomtop:${popRoom}`} style={{ display: 'none', pointerEvents: 'auto' }}>
                {popIsModule ? <h3>{roomName(popRoom)}</h3> : <div className="small muted">{roomName(popRoom)}</div>}
                {popIsModule && (
                  <div className="kv">
                    {popRoom === 'bank' && <><span className="k">{t('cash')}</span><span className="mono">{fmt(signals.cash, 0)} {signals.entity.functionalCurrency}</span><span className="k">{t('unmatched')}</span><span className="mono">{signals.unmatchedBank}</span></>}
                    {popRoom === 'accounting' && <><span className="k">{t('drafts')}</span><span className="mono">{signals.drafts}</span><span className="k">{t('result')}</span><span className="mono">{fmt(signals.result, 0)}</span></>}
                    {popRoom === 'clients' && <><span className="k">{t('overdue')}</span><span className="mono">{fmt(signals.overdue, 0)}</span><span className="k">{t('receivables')}</span><span className="mono">{fmt(signals.receivables, 0)}</span><span className="k">{t('nav_archives')}</span><span className="mono">{state.archives.filter((a) => a.entityId === entityId && a.status !== 'destroyed').length} {t('arc_on_rack')}</span></>}
                    {popRoom === 'suppliers' && <><span className="k">À approuver</span><span className="mono">{signals.pendingApprovals}</span><span className="k">{t('payables')}</span><span className="mono">{fmt(signals.payables, 0)}</span></>}
                    {popRoom === 'missions' && <><span className="k">{t('bar_ongoing')}</span><span className="mono">{signals.engagements}</span><span className="k">{t('late_eng')}</span><span className="mono">{signals.lateEngagements}</span></>}
                    {popRoom === 'assets' && <><span className="k">Biens</span><span className="mono">{state.assets.filter((a) => a.entityId === entityId && a.status !== 'disposed').length}</span><span className="k">VNC</span><span className="mono">{fmt(state.assets.filter((a) => a.entityId === entityId && a.status !== 'disposed').reduce((x, a) => x + a.cost - a.accumulated, 0), 0)}</span></>}
                    {popRoom === 'hr' && <><span className="k">Effectif</span><span className="mono">{hc?.active ?? 0}</span><span className="k">{t('present')}</span><span className="mono">{signals.entity.staffPresent}</span></>}
                    {popRoom === 'tax' && <><span className="k">TVA collectée</span><span className="mono">{fmt(vat?.collected ?? 0, 0)}</span><span className="k">TVA déductible</span><span className="mono">{fmt(vat?.deductible ?? 0, 0)}</span></>}
                  </div>
                )}
                <div className="toolbar" style={{ marginTop: 6 }}>
                  {popIsModule && entityId && canOpenRoom(state, entityId, popRoom) && <button className="btn sm primary" onClick={() => openRoom(popRoom as Room)}>{t('open_module')}</button>}
                  {popIsModule && entityId && !canOpenRoom(state, entityId, popRoom) && <span className="small muted">{t('room_off')}</span>}
                  {popRoom === 'clients' && <button className="btn sm" onClick={() => useStore.getState().setUi({ rackFocus: true, room: 'archives' })}>{t('rack_view')}</button>}
                  <button className="btn sm ghost" onClick={() => focus(null)}>{t('back_floor')}</button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; onError: (msg: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Loading() {
  return (
    <div className="loading">
      <img src={emblem} alt="" />
      <div className="t">BUMEX VANGUARD</div>
      <div className="s">Construction de l'immeuble…</div>
      <div className="p"><i /></div>
    </div>
  );
}

export function Scene() {
  const paused = useVanguardFrame((s) => s.pageOpen); // [bumex-one] a BUMEX One page covers the building: it stops drawing
  const transition = useStore((s) => s.ui.transition);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.toast);
  const ready = useStore((s) => s.ui.sceneReady);
  const low = useStore((s) => !s.ui.quality.shadows && !s.ui.quality.ao); // light rendering mode: fewer pixels too
  const [frame, setFrame] = useState(false);
  useEffect(() => {
    if (transition === 'to-tower' || transition === 'to-floor') {
      const id = window.setTimeout(() => setUi({ transition: 'none' }), 1600);
      return () => window.clearTimeout(id);
    }
  }, [transition, setUi]);
  useEffect(() => {
    if (frame && !ready) setUi({ sceneReady: true });
  }, [frame, ready, setUi]);
  return (
    <div className="canvas-wrap">
      <SceneBoundary onError={(msg) => { setUi({ view: 'flat', sceneError: msg }); toast('error', `Scène 3D indisponible (${msg}) : mode Plat`); }}>
        <Canvas
          frameloop={paused ? 'never' : 'always'} // [bumex-one]
          camera={{ fov: 40, near: 0.3, far: 1600, position: CAM.exterior.pos }}
          shadows={false}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0, powerPreference: 'high-performance' }}
          dpr={low ? [0.75, 1] : [1, 1.6]}
          onCreated={() => window.setTimeout(() => setFrame(true), 60)}
          onPointerMissed={() => { document.body.style.cursor = ''; }}
        >
          <SceneContent />
        </Canvas>
      </SceneBoundary>
      <LabelOverlay />
      {!ready && <Loading />}
    </div>
  );
}
