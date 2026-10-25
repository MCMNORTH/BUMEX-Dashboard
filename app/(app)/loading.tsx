// While the server answers: Vanguard's night, until its own loading screen takes over (vanguard-loading.tsx).
export default function Loading() {
  return <div aria-busy="true" style={{ position: "fixed", inset: 0, background: "#131d33" }} />;
}
