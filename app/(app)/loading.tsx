// While the server answers: Vanguard's frame, light or dark, until its own loading screen takes over (vanguard-loading.tsx).
export default function Loading() {
  return <div aria-busy="true" className="bg-background" style={{ position: "fixed", inset: 0 }} />;
}
