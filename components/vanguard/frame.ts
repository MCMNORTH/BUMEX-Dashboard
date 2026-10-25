import { create } from "zustand";

// Whether one of BUMEX One's pages is open in Vanguard's frame (components/vanguard/vanguard-shell.tsx): the building
// behind it stops drawing and Vanguard's keyboard shortcuts (Escape, F) leave the page alone.
export const useVanguardFrame = create<{ pageOpen: boolean }>(() => ({ pageOpen: false }));
