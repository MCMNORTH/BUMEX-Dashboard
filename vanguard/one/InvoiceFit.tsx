'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// [bumex-one] The A4 invoice (InvoiceSheet.tsx, 210 mm ≈ 794 px) scaled down to the width it has: a phone that scanned
// its QR code, a narrow panel. Printed at its real size.
const A4_PX = 794;

export function InvoiceFit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / A4_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="ivx-fit" style={{ width: '100%' }}>
      <style>{'@media print { .ivx-fit > .ivx-zoom { zoom: 1 !important; } }'}</style>
      <div className="ivx-zoom" style={{ zoom }}>{children}</div>
    </div>
  );
}
