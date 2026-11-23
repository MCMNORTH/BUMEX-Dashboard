"use client";

import { Suspense, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";

import "@/vanguard/vanguard.css";
import "@/vanguard/select.css";
import "@/vanguard/work.css";
import "@/vanguard/responsive.css"; // last: phones and tablets (docs/plans/mobile-tablet.md)
import { AccountMenu } from "@/components/layout/account-menu";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { VanguardLoading } from "@/components/vanguard/vanguard-loading";
import { ROOM_KEYS, type Room } from "@/vanguard/i18n";
import { mailOutcomeMessage } from "@/vanguard/one/mail-outcome";
import { MODULE_ONLY, MODULE_ROOM, useStore } from "@/vanguard/store";

// Vanguard reads the browser (WebGL, storage, the URL) as it loads: it only ever renders in the browser.
const VanguardApp = dynamic(() => import("@/components/vanguard/vanguard-app"), { ssr: false, loading: () => <VanguardLoading /> });

const ROOMS: readonly string[] = [...ROOM_KEYS, ...MODULE_ONLY];

// /vanguard?room=…&tab=…: a room opened from a link (BUMEX One's old addresses lead here, next.config.ts), as Vanguard's
// rail opens it (vanguard/ui/Sidebar.tsx); the address is then cleaned.
function RoomLink() {
  const params = useSearchParams();
  const pathname = usePathname();
  const loaded = useStore((s) => s.loadedAt > 0);
  const room = pathname === "/vanguard" ? params.get("room") : null;
  const tab = params.get("tab");
  const mail = params.get("mail");

  useEffect(() => {
    if (!loaded || !room) return;
    const { ui, setUi, openRoom, toast } = useStore.getState();
    window.history.replaceState(null, "", "/vanguard");
    // back from connecting Outlook (lib/mail): what came of it
    const outcome = mail ? mailOutcomeMessage(mail, (fr, en) => (ui.lang === "fr" ? fr : en)) : null;
    if (outcome) toast(outcome.kind, outcome.text);
    if (!ROOMS.includes(room)) return;
    const target = room as Room;
    // the person's own panels open over the building; a module takes you onto the floor first
    if (target === "myday" || target === "mywork" || target === "time" || target === "inbox" || ui.view !== "tower") openRoom(target, tab);
    else setUi({ view: "floor", transition: "to-floor", focusRoom: MODULE_ROOM[target] ?? target, room: target, tab, rackFocus: false });
  }, [loaded, room, tab, mail]);
  return null;
}

// BUMEX Vanguard, the app (/vanguard), with two of BUMEX One's controls in its header: the notifications' bell and the
// person's menu (vanguard/ui/Header.tsx keeps room for them). The floor is chosen from Vanguard's rail only.
// userId: who is signed in, for the app to check its memory is theirs (vanguard-app.tsx)
export function VanguardShell({ children, userId }: { children: React.ReactNode; userId: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);

  // Vanguard's header keeps as much room as the controls take
  useEffect(() => {
    const element = tools.current;
    if (!element) return;
    const observer = new ResizeObserver(() => frame.current?.style.setProperty("--bumex-tools", `${element.offsetWidth}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <NavigationProgress />
        <RoomLink />
      </Suspense>
      <div ref={frame} className="vanguard">
        <VanguardApp userId={userId} />
        {children}
        {/* the theme is the page's (lib/theme.ts): <html class="dark"> in the dark, as for the menus these open */}
        <div ref={tools} className="bumex-page bumex-tools text-foreground">
          <NotificationBell />
          <AccountMenu />
        </div>
      </div>
    </>
  );
}
