// The theme's key in the browser's storage and the script that sets the theme on <html> before the first paint
// (app/layout.tsx). Server-safe: the hooks are in lib/theme.ts.

export const THEME_KEY = "bumex-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=p==="dark"||(p!=="light"&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches);var r=document.documentElement;r.classList.toggle("dark",d);r.setAttribute("data-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
