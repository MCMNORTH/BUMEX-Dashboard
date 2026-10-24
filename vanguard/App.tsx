import { Suspense, lazy } from 'react';
import { useStore } from './store';
import { Header } from './ui/Header';
import { Sidebar } from './ui/Sidebar';
import { CommandBar } from './ui/CommandBar';
import { TowerHud, FloorHud } from './ui/Hud';
import { RackHud } from './ui/RackHud';
import { Sheet, FlatLayout } from './ui/Rooms';
import { DeleteDialog } from './ui/common';
import emblemImage from './assets/emblem.png'; // [bumex-one] Next imports images as objects
const emblem = emblemImage.src;

const Scene = lazy(() => import('./three/Scene').then((m) => ({ default: m.Scene })));

function Toast() {
  const toast = useStore((s) => s.ui.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role="status">
      {toast.text}
    </div>
  );
}

function SceneFallback() {
  return (
    <div className="loading">
      <img src={emblem} alt="" />
      <div className="t">BUMEX VANGUARD</div>
      <div className="s">Chargement du moteur 3D…</div>
      <div className="p"><i /></div>
    </div>
  );
}

export function App() {
  const view = useStore((s) => s.ui.view);
  const room = useStore((s) => s.ui.room);
  const webgl = useStore((s) => s.ui.webgl);
  const barOpen = useStore((s) => s.ui.barOpen);
  const rackFocus = useStore((s) => s.ui.rackFocus);
  const flat = view === 'flat' || !webgl;
  const shelfMode = view === 'floor' && rackFocus; // the rack fills the screen; the archive table is one click away
  return (
    <div className="app">
      <Header />
      <div className="main">
        <Sidebar />
        {flat ? (
          <FlatLayout />
        ) : (
          <div className={`stage with-bar ${barOpen ? 'bar-open' : ''}`}>
            <Suspense fallback={<SceneFallback />}>
              <Scene />
            </Suspense>
            {view === 'tower' ? <TowerHud /> : (!room || shelfMode) && <FloorHud />}
            {shelfMode && <RackHud />}
            {room && !shelfMode && <Sheet />}
            <CommandBar />
          </div>
        )}
      </div>
      <DeleteDialog />
      <Toast />
    </div>
  );
}
