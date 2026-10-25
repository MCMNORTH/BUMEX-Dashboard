"use client";

import { Suspense, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import "@/vanguard/vanguard.css";
import { EntitySwitchProvider } from "@/components/entities/entity-switch-dialog";
import { AccountMenu } from "@/components/layout/account-menu";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { PageBackButton } from "@/components/layout/page-back-button";
import { PageRefreshButton } from "@/components/layout/page-refresh-button";
import { SidebarAppearanceProvider } from "@/components/layout/sidebar-appearance-provider";
import { SidebarLogoFilters } from "@/components/layout/sidebar-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useVanguardFrame } from "@/components/vanguard/frame";
import { VanguardLoading } from "@/components/vanguard/vanguard-loading";
import { workMenuPaths } from "@/components/vanguard/work-menu";
import type { SidebarAppearance } from "@/lib/settings/appearance";
import { cn } from "@/lib/utils";
import { ROOM_KEYS, type Room } from "@/vanguard/i18n";
import { MODULE_ONLY, MODULE_ROOM, useStore } from "@/vanguard/store";

// Vanguard reads the browser (WebGL, storage, the URL) as it loads: it only ever renders in the browser.
const VanguardApp = dynamic(() => import("@/components/vanguard/vanguard-app"), { ssr: false, loading: () => <VanguardLoading /> });

const ROOMS: readonly string[] = [...ROOM_KEYS, ...MODULE_ONLY];

// /vanguard?room=…&tab=…: a room opened from a link, or from one of BUMEX One's pages that moved into it
// (lib/erp/vanguard/retired.ts), as Vanguard's rail opens it (vanguard/ui/Sidebar.tsx); the address is then cleaned.
function RoomLink() {
  const params = useSearchParams();
  const pathname = usePathname();
  const loaded = useStore((s) => s.loadedAt > 0);
  const room = pathname === "/vanguard" ? params.get("room") : null;
  const tab = params.get("tab");

  useEffect(() => {
    if (!loaded || !room) return;
    const { ui, setUi, openRoom } = useStore.getState();
    window.history.replaceState(null, "", "/vanguard");
    if (!ROOMS.includes(room)) return;
    const target = room as Room;
    if (target === "myday" || ui.view !== "tower") openRoom(target, tab);
    else setUi({ view: "floor", transition: "to-floor", focusRoom: MODULE_ROOM[target] ?? target, room: target, tab, rackFocus: false });
  }, [loaded, room, tab]);
  return null;
}

// Vanguard is the app's frame: its header, its rail and the building stay in place from page to page, and each of
// BUMEX One's pages opens in it, over the building, until it moves into Vanguard itself. /vanguard is the building.
export function VanguardShell({ children, initialAppearance }: { children: React.ReactNode; initialAppearance: SidebarAppearance }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageOpen = pathname !== "/vanguard";
  const railOpen = useStore((s) => s.ui.sidebarOpen);
  const page = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useVanguardFrame.setState({ pageOpen });
  }, [pageOpen]);

  // Vanguard's header keeps as much room as BUMEX One's controls take (vanguard/ui/Header.tsx)
  useEffect(() => {
    const element = tools.current;
    if (!element) return;
    const observer = new ResizeObserver(() => frame.current?.style.setProperty("--bumex-tools", `${element.offsetWidth}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // each page opens at its top, as when it had the window to itself
  useEffect(() => {
    page.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!pageOpen) return;
    // a room, a floor or the overview chosen in Vanguard's rail or header: back to the building
    return useStore.subscribe(({ ui: a }, { ui: b }) => {
      if (a.view !== b.view || a.room !== b.room || a.focusRoom !== b.focusRoom || a.transition !== b.transition || a.rackFocus !== b.rackFocus || a.archiveId !== b.archiveId) {
        router.push("/vanguard");
      }
    });
  }, [pageOpen, router]);

  return (
    <SidebarAppearanceProvider initialAppearance={initialAppearance}>
      <EntitySwitchProvider>
        <SidebarLogoFilters />
        <Suspense fallback={null}>
          <NavigationProgress />
          <RoomLink />
        </Suspense>
        <div ref={frame} className="vanguard">
          <VanguardApp />
          {pageOpen ? (
            <div ref={page} className={cn("bumex-page bumex-page-frame bg-background font-sans text-foreground", railOpen && "wide")}>
              <div className="min-w-0 px-3 py-4 sm:px-5 lg:px-6">
                <Suspense fallback={null}>
                  <PageBackButton topLevel={workMenuPaths} />
                </Suspense>
                {children}
              </div>
            </div>
          ) : null}
          {/* BUMEX One's controls in Vanguard's header, in the room its Header keeps for them (vanguard/ui/Header.tsx) */}
          <div className="dark">
            <div ref={tools} className="bumex-page bumex-tools text-foreground">
              {pageOpen ? <PageRefreshButton /> : null}
              <NotificationBell />
              <AccountMenu compact />
            </div>
          </div>
        </div>
      </EntitySwitchProvider>
    </SidebarAppearanceProvider>
  );
}
