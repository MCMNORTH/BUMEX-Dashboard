import { Suspense, lazy } from 'react';
import { useStore } from './store';
import { Header } from './ui/Header';
import { Sidebar } from './ui/Sidebar';
import { CommandBar } from './ui/CommandBar';
import { TowerHud, FloorHud } from './ui/Hud';
import { RackHud } from './ui/RackHud';
import { Sheet, FlatLayout } from './ui/Rooms';
import { DeleteDialog } from './ui/common';
import { useRoomHistory } from './one/back'; // [mobile] Back goes back one screen
import { PhoneNav } from './one/PhoneNav'; // [mobile]
import { useScreen } from './one/screen'; // [mobile]
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

// [bumex-one] Entering or leaving the test floor reads the state again in the other mode (store.ts, 0013)
function ModeSwitch() {
  const switching = useStore((s) => s.ui.switching);
  const fr = useStore((s) => s.ui.lang === 'fr');
  if (!switching) return null;
  return (
    <div className="mode-switch" role="status" aria-live="polite">
      <div>
        <i />
        {switching === 'test' ? (fr ? "Passage à l'étage de test…" : 'Going to the test floor…') : fr ? "Retour aux étages réels…" : 'Back to the real floors…'}
      </div>
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
  useRoomHistory();
  const { phone } = useScreen();
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
      {phone && <PhoneNav />}
      <DeleteDialog />
      <ModeSwitch />
      <Toast />
    </div>
  );
}
