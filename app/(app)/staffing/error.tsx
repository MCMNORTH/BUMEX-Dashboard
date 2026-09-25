"use client";
import { Button } from "@/components/ui/button";
export default function StaffingError({ reset }: { reset: () => void }) { return <div className="rounded-[28px] border border-border bg-card p-8"><h1 className="text-2xl font-semibold">Staffing indisponible</h1><p className="mt-2 text-muted-foreground">Les données de staffing n’ont pas pu être chargées.</p><Button className="mt-5" onClick={reset}>Réessayer</Button></div>; }
