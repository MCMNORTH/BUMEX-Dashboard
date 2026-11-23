import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Icon } from '../ui/common';
import { refreshPage, usePageUpdatedAt } from './cache';
import { useSay } from './say';
import { ago } from './ticket-history';

// ↻ at the right of a page's header (asked on 2026-11-22): what the page shows read again from the server, without
// reloading the app, what it showed kept meanwhile (one/cache.ts refreshPage), and when it was last read. A second
// press while it reads does nothing; a failure says so and keeps what was shown.
export function PageRefresh() {
  const say = useSay();
  const toast = useStore((s) => s.toast);
  const { at, busy } = usePageUpdatedAt();
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // "il y a 2 minutes" moves on by itself
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  const click = async () => {
    if (running) return;
    setRunning(true);
    try {
      const { ok } = await refreshPage();
      if (!ok) toast('error', say('Actualisation impossible : serveur injoignable. La page montre ce qui a été lu en dernier.', 'Could not refresh: server unreachable. The page shows what was read last.'));
    } finally {
      setRunning(false);
      setNow(Date.now());
    }
  };

  const when = at ? ago(new Date(at).toISOString(), Math.max(now, at), say) : '';
  const label = say('Actualiser', 'Refresh');
  return (
    <div className="pg-refresh">
      {when && <span className="small muted pg-refresh-at" title={new Date(at).toLocaleString()}>{say(`Mis à jour ${when}`, `Updated ${when}`)}</span>}
      <button type="button" className={`btn sm ghost pg-refresh-btn ${running || busy ? 'spinning' : ''}`} onClick={click} disabled={running} aria-busy={running || busy} aria-label={label} title={label}>
        <Icon name="refresh" size={16} />
      </button>
    </div>
  );
}
